"""Publish timestamped quotes for the public InvestorAce universe."""
import json
import math
import os
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


def main():
    snapshot = json.loads((ROOT/'dist/snapshot.json').read_text())
    target = ROOT/'dist/quotes.json'
    symbols = {r['symbol'] for r in snapshot['scorecard']} | {m['symbol'] for m in snapshot['market']['moves']} | {'EURUSD=X'}
    symbols = sorted(symbols)
    with ThreadPoolExecutor(max_workers=8) as pool:
        quotes = {s:q for s,q in zip(symbols,pool.map(fetch_quote,symbols)) if q}
    if not quotes:
        raise SystemExit('Quote feed unavailable')
    now = int(time.time())
    result = dict(version=1, sampled=now, snapshot=snapshot['current'], quotes=quotes)
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_suffix('.tmp')
    tmp.write_text(json.dumps(result, allow_nan=False, separators=(',', ':')))
    tmp.replace(target)
    print(f'{len(quotes)}/{len(symbols)} public instruments')


if __name__ == '__main__':
    main()
