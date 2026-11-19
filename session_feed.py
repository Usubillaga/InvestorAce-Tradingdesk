"""Publish timestamped quotes for the public InvestorAce universe."""
import hashlib
import json
import math
import re
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path
from urllib.parse import quote
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent
TRADINGVIEW_EXCHANGES = {"Nasdaq": "NASDAQ", "NYSE": "NYSE"}

def positive(v):
    return type(v) in (int, float) and math.isfinite(v) and v > 0


def fetch_quote(symbol):
    for host in ('query2', 'query1'):
        try:
            url = f'https://{host}.finance.yahoo.com/v8/finance/chart/{quote(symbol, safe="")}?range=1d&interval=5m'
            with urlopen(Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=8) as response:
                result = json.load(response)['chart']['result'][0]
            m = result['meta']
            period = m['currentTradingPeriod']['regular']
            price = m['regularMarketPrice']
            if m['symbol'].upper() != symbol.upper() or not positive(price):
                continue
            bars = result['indicators']['quote'][0]
            path = [[t, c] for t, c in zip(result.get('timestamp', []), bars.get('close', []))
                    if positive(c) and period['start'] <= t <= m['regularMarketTime']]
            return dict(name=m.get('longName') or m.get('shortName'), price=price, at=m['regularMarketTime'], start=period['start'], end=period['end'],
                        currency=m.get('currency'), previous=m.get('chartPreviousClose'),
                        high=m.get('regularMarketDayHigh'), low=m.get('regularMarketDayLow'), path=path)
        except (OSError, ValueError, TypeError, KeyError, IndexError):
            continue
    return None


def scanner_universe(report, known):
    if report.get('schema') != 'market-scan-v1' or not isinstance(report.get('candidates'), list):
        raise ValueError('Unsupported scanner report')
    rows = {}
    for item in report['candidates']:
        if not isinstance(item, dict) or item.get('rank_eligible') is not True:
            continue
        symbol = item.get('yahoo')
        if not isinstance(symbol, str) or not re.fullmatch(r'[A-Z0-9][A-Z0-9.-]{0,16}', symbol):
            continue
        ticker = item.get('ticker') or symbol
        exchange = TRADINGVIEW_EXCHANGES.get(item.get('exchange'))
        tv_symbol = f'{exchange}:{ticker}' if exchange and re.fullmatch(r'[A-Z0-9]+(?:\.[A-Z0-9]+)?', ticker) else None
        rows.setdefault(symbol, dict(symbol=symbol, ticker=ticker, tradingViewSymbol=tv_symbol,
                        name=item.get('name'), sector=item.get('sector'), score=item.get('score'),
                        band=item.get('band'), review=item.get('review_status'),
                        priceDate=item.get('price_date'), added=symbol not in known))
    return dict(asOf=report['as_of'], coverage=report.get('coverage'), rows=list(rows.values()))


def fetch_scanner(snapshot, known):
    revision = snapshot['commit']
    if not re.fullmatch(r'[0-9a-f]{40}', revision):
        raise ValueError('Unexpected archive revision')
    url = f'https://raw.githubusercontent.com/Usubillaga/InvestorAce/{revision}/market-scan/latest.json'
    with urlopen(Request(url, headers={'User-Agent': 'InvestorAce-TradingDesk'}), timeout=20) as response:
        scanner = scanner_universe(json.load(response), known)
    return {**scanner, 'revision': revision}


def short_positions(raw, snapshot):
    current = snapshot['current']
    digest = snapshot['builds'][current]['manifest']['observation_sha256']
    report = json.loads(raw)
    canonical = json.dumps(report, sort_keys=True, separators=(',', ':'), allow_nan=False)
    if hashlib.sha256(canonical.encode('utf-8')).hexdigest() != digest:
        raise ValueError('Archive observation hash mismatch')
    captured = date.fromisoformat(snapshot['captured'][:10])
    rows = {}
    for stock in snapshot['scorecard']:
        position = (report.get(stock['ticker'], {}).get('opportunity') or {}).get('short_interest')
        if not isinstance(position, dict):
            continue
        settlement = position.get('settlement_date')
        try:
            reported = date.fromisoformat(settlement)
        except (TypeError, ValueError):
            continue
        if reported > captured:
            continue
        shares, prior = position.get('shares'), position.get('prior_month_shares')
        # Match the source report's guard against anomalous provider data.
        if type(shares) in (int, float) and positive(prior) and prior >= 1e6 and shares < 0.05 * prior:
            rows[stock['ticker']] = dict(status='REVIEW_REQUIRED', settlement_date=settlement)
            continue
        fields = ('shares', 'pct_float', 'days_to_cover', 'change_pct', 'settlement_date', 'source')
        rows[stock['ticker']] = dict(status='REPORTED', **{field: position.get(field) for field in fields})
    return dict(snapshot=current, rows=rows)


def fetch_positions(snapshot, seed):
    if seed and seed['snapshot'] == snapshot['current']:
        return seed
    revision, build = snapshot['commit'], snapshot['current']
    if not re.fullmatch(r'[0-9a-f]{40}', revision) or not re.fullmatch(r'[0-9]{8}T[0-9]{12}-[0-9a-f]{32}', build):
        raise ValueError('Unexpected archive coordinates')
    path = f'{revision}/history/_builds/{build}/observation.json'
    url = f'https://raw.githubusercontent.com/Usubillaga/InvestorAce/{path}'
    with urlopen(Request(url, headers={'User-Agent': 'InvestorAce-TradingDesk'}), timeout=15) as response:
        return short_positions(response.read(), snapshot)


def main():
    snapshot = json.loads((ROOT/'dist/snapshot.json').read_text())
    target = ROOT/'dist/quotes.json'
    position_file = ROOT/'dist/positioning.json'
    try:
        seed = json.loads(position_file.read_text()) if position_file.exists() else None
        positioning = fetch_positions(snapshot, seed)
    except (OSError, ValueError, KeyError, TypeError) as error:
        print(f'Short-interest data unavailable: {type(error).__name__}')
    else:
        temporary = position_file.with_suffix('.tmp')
        temporary.write_text(json.dumps(positioning, allow_nan=False, separators=(',', ':')))
        temporary.replace(position_file)
    symbols = {r['symbol'] for r in snapshot['scorecard']} | {m['symbol'] for m in snapshot['market']['moves']} | {'EURUSD=X'}
    try:
        scanner = fetch_scanner(snapshot, {row['symbol'] for row in snapshot['scorecard']})
    except (OSError, ValueError, KeyError, TypeError) as error:
        print(f'Scanner unavailable: {type(error).__name__}')
        scanner = None
    if scanner:
        symbols.update(row['symbol'] for row in scanner['rows'])
    symbols = sorted(symbols)
    with ThreadPoolExecutor(max_workers=8) as pool:
        quotes = {s:q for s,q in zip(symbols,pool.map(fetch_quote,symbols)) if q}
    if not quotes:
        raise SystemExit('Quote feed unavailable')
    now = int(time.time())
    result = dict(version=1, sampled=now, snapshot=snapshot['current'], quotes=quotes, scanner=scanner)
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_suffix('.tmp')
    tmp.write_text(json.dumps(result, allow_nan=False, separators=(',', ':')))
    tmp.replace(target)
    print(f'{len(quotes)}/{len(symbols)} public instruments')


if __name__ == '__main__':
    main()
