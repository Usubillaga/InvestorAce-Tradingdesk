"""Publish timestamped quotes for the public InvestorAce universe."""
import json
import math
import re
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import quote
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent

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
        rows.setdefault(symbol, dict(symbol=symbol, ticker=item.get('ticker') or symbol,
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


def main():
    snapshot = json.loads((ROOT/'dist/snapshot.json').read_text())
    target = ROOT/'dist/quotes.json'
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
