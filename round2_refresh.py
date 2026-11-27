"""Refresh dist/paper-round2.json from the published InvestorAce report, only if it reconciles.

The desk bundles the round-two journal as its offline copy and journal_audit.py checks that copy. It was written
once on 25 Nov 2026 and never refreshed, so the audit found the valuation stuck at 24 Nov (27 Nov 2026). This
step takes the report InvestorAce publishes every build, and keeps the bundled file when the new one is missing,
older, from another round or does not reconcile to the cent.
"""
import json
import math
import sys
from pathlib import Path
from urllib.request import Request, urlopen

SOURCE = 'https://usubillaga.github.io/InvestorAce/paper-round2.json'
TARGET = Path('dist/paper-round2.json')


def problems(new, old):
    out = []
    for key in ('round', 'entry', 'end'):
        if new.get(key) != old.get(key):
            out.append(f'{key} {new.get(key)!r} != {old.get(key)!r}')
    if set(new.get('accounts', {})) != set(old.get('accounts', {})):
        out.append('different accounts')
    if (new.get('mark') or '') < (old.get('mark') or ''):
        out.append(f"older mark {new.get('mark')} < {old.get('mark')}")
    if (new.get('built') or '') < (old.get('built') or ''):
        out.append('older build')
    rates = {'EUR': 1, 'USD': new.get('fx')}
    for name, book in new.get('accounts', {}).items():
        try:
            closes = sum(p['shares'] * p['close'] * rates[p['currency']] for p in book['positions'])
            nav = book['days'][-1]['nav']
        except (KeyError, IndexError, TypeError):
            out.append(f'{name}: incomplete account')
            continue
        if not math.isclose(nav, book['cash'] + closes, abs_tol=0.02, rel_tol=0):
            out.append(f'{name}: NAV {nav:.2f} != cash + positions {book["cash"] + closes:.2f}')
        if book['days'][-1]['day'] != new.get('mark'):
            out.append(f'{name}: last valuation {book["days"][-1]["day"]} != mark {new.get("mark")}')
    return out


def main(fetch=None):
    old = json.loads(TARGET.read_text())
    try:
        raw = fetch() if fetch else urlopen(Request(SOURCE, headers={'User-Agent': 'InvestorAce desk'}), timeout=30).read()
        new = json.loads(raw)
    except Exception as exc:                 # keep the bundled copy; the page still loads the live report itself
        print(f'::notice::Round-two report unavailable ({type(exc).__name__}); keeping {old.get("mark")}')
        return False
    found = problems(new, old)
    if found:
        print('::notice::Round-two report not taken: ' + '; '.join(found))
        return False
    TARGET.write_text(json.dumps(new, ensure_ascii=False, indent=1) + '\n')
    print(f'Round-two journal {old.get("mark")} -> {new.get("mark")}')
    return True


if __name__ == '__main__':
    main()
    sys.exit(0)
