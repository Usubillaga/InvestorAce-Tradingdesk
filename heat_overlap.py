"""Forward paper portfolios of five and six distinct SPY / QQQ leaders."""
import json
import re
import subprocess
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path

import pandas as pd

from heat_leaders import CAL, COST, NY, compositions, daily_weights, monitor, quotes, sessions

ROOT = Path(__file__).resolve().parent
PATH = ROOT / 'dist/heat-overlap.json'
FUNDS = ('SPY', 'QQQ')
SIZES = (5, 6)
INITIAL = 10_000.
CLASS = re.compile(r'\b(?:CL(?:ASS)?|SERIES)\s+[-.\s]*[A-Z0-9]+\b.*$', re.I)
ERRORS = (OSError, ValueError, IndexError, KeyError, TypeError)


def sponsor_table(frame, fund, day, url):
    source = {'SPY': 'spdr_cdn', 'QQQ': 'invesco_cdn'}[fund]
    rows = daily_weights(frame[frame.source == source], fund, day)
    if rows.ticker.isna().any() or rows.name.isna().any():
        raise ValueError(f'{fund}: unidentified security')
    return dict(fund=fund, date=rows.iloc[0]['day'], url=url, rows=rows.to_dict('records'))


def overlap(tables):
    """Union issuer identifiers before ranking. Tickers link a class across sponsors."""
    parents = {}

    def root(key):
        parents.setdefault(key, key)
        while parents[key] != key:
            parents[key] = parents[parents[key]]
            key = parents[key]
        return key

    if {t['fund'] for t in tables} != set(FUNDS) or len(tables) != 2:
        raise ValueError('Both sponsor tables required')
    weights = {fund: defaultdict(float) for fund in FUNDS}
    names = {}
    for table in tables:
        fund = table['fund']
        for row in table['rows']:
            sym = row['ticker'].replace('.', '-').strip().upper()
            name = row['name'].strip()
            if not sym or not name:
                raise ValueError('Missing security identifier')
            key = 'ticker:' + sym
            base = re.sub('[^A-Z0-9]', '', CLASS.sub('', name.upper()))
            identities = ['name:' + base] if base else []
            for field in ('issuer_cik', 'cusip'):
                value = row.get(field)
                if pd.notna(value) and str(value).strip():
                    v = str(value).strip()
                    if field == 'issuer_cik' and v not in ('0', '0.0'):
                        identities.append('cik:' + v.removesuffix('.0').lstrip('0'))
                    elif field == 'cusip' and re.fullmatch('[A-Z0-9]{9}', v):
                        identities.append('cusip-issuer:' + v[:6])
            for identity in identities:
                parents[root(identity)] = root(key)
            weights[fund][sym] += float(row['weight'])
            names.setdefault(sym, name)
    totals, classes = {}, defaultdict(set)
    for fund in FUNDS:
        grouped = defaultdict(float)
        for sym, weight in weights[fund].items():
            issuer = root('ticker:' + sym)
            grouped[issuer] += weight
            classes[issuer].add(sym)
        totals[fund] = dict(sorted(grouped.items(), key=lambda p: (-p[1], p[0]))[:10])
    shared = totals['SPY'].keys() & totals['QQQ'].keys()
    ranked = []
    for issuer in shared:
        # Pick the most heavily represented class across the two funds.
        symbol = min(classes[issuer], key=lambda s: (-sum(weights[f].get(s, 0) for f in FUNDS), s))
        w = {f: totals[f][issuer] for f in FUNDS}
        ranked.append(dict(symbol=symbol, name=names[symbol], classes=sorted(classes[issuer]),
                           weights=w, score=sum(w.values()) / 2))
    return dict(sources={t['fund']: dict(date=t['date'], url=t['url']) for t in tables},
                candidates=sorted(ranked, key=lambda x: (-x['score'], x['symbol'])))


def load_basket(day, when):
    return overlap(compositions(day, when, funds=FUNDS, select=sponsor_table))


def new_book(size):
    return dict(size=size, cash=INITIAL, nav=INITIAL, holdings=[], entry=None, pending=None,
                controls={f: INITIAL for f in FUNDS}, events=[])


def min_date(entry):
    return (pd.Timestamp(entry) + pd.DateOffset(months=42)).date().isoformat()


def register(book, sample, now, since, selection=None):
    if book['pending'] or datetime.fromisoformat(sample['as_of']) < since:
        return
    observed = datetime.fromisoformat(sample['as_of'])
    day = sample['day']
    close = CAL.session_close(day).to_pydatetime()
    if sample['intraday']:
        if book['entry'] or sample['heat'] >= 20 or not CAL.session_open(day).to_pydatetime() <= observed <= now < close:
            return
        if not selection or len(selection['candidates']) < book['size']:
            return
        picks = selection['candidates'][:book['size']]
        if len(set(s for p in picks for s in p['classes'])) != sum(len(p['classes']) for p in picks):
            raise ValueError('Repeated issuer in order')
        detail = dict(side='BUY', target=day, picks=picks, sources=selection['sources'])
    else:
        if not book['entry'] or day < min_date(book['entry']) or sample['heat'] < 80 or not close <= observed <= now:
            return
        target = str(CAL.next_session(day).date())
        if now >= CAL.session_close(target).to_pydatetime():
            return
        detail = dict(side='SELL', target=target)
    book['pending'] = dict(**detail, submitted=now.isoformat(), signal=sample)


def apply_close(book, previous, day, prices, registered):
    """Apply the next split-/distribution-adjusted return and the pre-registered order."""
    order = book['pending']
    if book['entry']:
        for leg in book['holdings']:
            series = prices(leg['symbol'])
            leg['value'] *= series[day][1] / series[previous][1]
        for fund in FUNDS:
            series = prices(fund)
            book['controls'][fund] *= series[day][1] / series[previous][1]
    if order and order['target'] <= day:
        if (order['target'] != day or datetime.fromisoformat(order['submitted']) >= CAL.session_close(day).to_pydatetime()
                or not registered(book['size'], day, order)):
            book['events'].append(dict(status='expired', day=day, order=order))
        elif order['side'] == 'BUY':
            per_name = book['cash'] / len(order['picks']) / (1 + COST)
            book['holdings'] = [dict(symbol=p['symbol'], name=p['name'], classes=p['classes'],
                                     price=prices(p['symbol'])[day][0], units=per_name/prices(p['symbol'])[day][0],
                                     value=per_name) for p in order['picks']]
            book['entry'], book['cash'] = day, 0.
            book['eligible'] = min_date(day)
            for fund in FUNDS:
                prices(fund)[day]  # require both same-session benchmark closes before the fill
                book['controls'][fund] /= 1 + COST
            book['events'].append(dict(status='bought', day=day, order=order, fills=[leg.copy() for leg in book['holdings']]))
        else:
            fills = [dict(symbol=p['symbol'], price=prices(p['symbol'])[day][0], proceeds=p['value']*(1-COST))
                     for p in book['holdings']]
            book['cash'] = sum(p['proceeds'] for p in fills)
            for fund in FUNDS:
                book['controls'][fund] *= 1 - COST
            book['events'].append(dict(status='sold', day=day, order=order, fills=fills, entry=book['entry']))
            book['entry'], book['holdings'] = None, []
            book.pop('eligible', None)
        book['pending'] = None
    book['nav'] = book['cash'] + sum(p['value'] for p in book['holdings'])


@lru_cache(maxsize=8)
def committed_state(day):
    cutoff = CAL.session_close(day).to_pydatetime() - timedelta(seconds=1)
    path = PATH.relative_to(ROOT).as_posix()
    args = dict(cwd=ROOT, text=True)
    sha = subprocess.check_output(['git', 'rev-list', '-1', '--first-parent', '--before='+cutoff.isoformat(), 'HEAD', '--', path], **args).strip()
    if not sha:
        return {}
    raw = subprocess.check_output(['git', 'show', f'{sha}:{path}'], **args)
    return json.loads(raw)['books']


def recorded(size, day, order):
    return committed_state(day).get(str(size), {}).get('pending') == order


def main():
    before = PATH.read_text()
    state = json.loads(before)
    start = datetime.fromisoformat(state['started'])
    now = datetime.now(timezone.utc)
    latest = str(sessions(now)[0].date())
    books = list(state['books'].values())
    previous = state['as_of']
    prices = lru_cache(None)(quotes)
    warnings = []
    if previous < latest:
        for session in CAL.sessions_in_range(CAL.next_session(previous), latest):
            day = str(session.date())
            for book in books:
                apply_close(book, previous, day, prices, recorded)
            previous = day
            if day != latest:
                state['missed_checks'].append(day)
        state['as_of'] = latest

    today = now.astimezone(NY).date().isoformat()
    trading = CAL.is_session(today) and CAL.session_open(today) <= now < CAL.session_close(today)
    if any(b['entry'] and latest >= min_date(b['entry']) for b in books):
        try:
            sample = monitor(latest)
            state['monitor'] = sample
            for book in books:
                register(book, sample, datetime.now(timezone.utc), start)
        except ERRORS as exc:
            warnings.append(str(exc))
    if trading:
        try:
            sample = monitor(today, intraday_at=now, since=start, seek_panic=any(not b['entry'] and not b['pending'] for b in books))
            if sample and datetime.fromisoformat(sample['as_of']) >= start:
                state['monitor'] = sample
                if sample['heat'] < 20 and any(not b['entry'] and not b['pending'] for b in books):
                    basket = load_basket(today, datetime.fromisoformat(sample['as_of']))
                    state['selection'] = dict(**basket, checked=sample['as_of'])
                    for book in books:
                        register(book, sample, datetime.now(timezone.utc), start, basket)
            elif not sample or datetime.fromisoformat(sample['as_of']) < start:
                warnings.append('NO_NEW_READING')
        except ERRORS as exc:
            warnings.append(str(exc))
    # A dated preview is useful while in cash. It never authorizes an order.
    preview_day = today if trading else latest
    if state.get('preview_day') != preview_day:
        try:
            cutoff = now if trading else CAL.session_close(latest).to_pydatetime()
            basket = load_basket(preview_day, cutoff)
            state['selection'] = dict(**basket, checked=cutoff.isoformat())
            state['preview_day'] = preview_day
        except ERRORS as exc:
            warnings.append(str(exc))
    state['warnings'] = warnings
    body = json.dumps(state, ensure_ascii=False, indent=2, allow_nan=False) + '\n'
    if body != before:
        tmp = PATH.with_suffix('.tmp')
        tmp.write_text(body)
        tmp.replace(PATH)
    print(state['as_of'], {b['size']: b['nav'] for b in books}, warnings)


if __name__ == '__main__':
    main()
