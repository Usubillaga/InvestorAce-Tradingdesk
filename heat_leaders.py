"""Codex paper account, in USD. Record the order before its executable close."""
import hashlib
import io
import json
import math
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from index_paper import CAL, NY, fetch, sessions

PATH = Path(__file__).parent / 'dist/heat-account.json'
IA = 'https://raw.githubusercontent.com/Usubillaga/InvestorAce/main/history'
FUNDS = {'SPY': ('sp500', 450), 'QQQ': ('ndx', 90), 'DIA': ('dji', 30)}
COST = 0.001


def get(url):
    headers = {'User-Agent': 'InvestorAce-Codex-Paper/1.0'}
    if url.startswith('https://api.github.com/') and os.getenv('GITHUB_TOKEN'):
        headers['Authorization'] = 'Bearer ' + os.environ['GITHUB_TOKEN']
    with urlopen(Request(url, headers=headers), timeout=25) as response:
        return response.read()


def monitor(day):
    """Use a hash-verified build after the NY close, with matching VIX and S&P sessions."""
    pointer = json.loads(get(IA + '/_current.json'))
    run = pointer['run_id']
    session_close = CAL.session_close(day).to_pydatetime()
    for _ in range(24):
        base = f'{IA}/_builds/{run}'
        manifest = json.loads(get(base + '/manifest.json'))
        if manifest['run_id'] != run:
            raise ValueError('Mismatched InvestorAce generation')
        # Skip weekend or late snapshots without pulling their multi-MB observations.
        build_stamp = datetime.strptime(run.split('-')[0], '%Y%m%dT%H%M%S%f').replace(tzinfo=timezone.utc)
        if build_stamp < session_close:
            break
        if build_stamp > session_close + timedelta(hours=12):
            run = manifest.get('previous_run_id')
            if not run:
                break
            continue
        raw = get(base + '/observation.json')
        if hashlib.sha256(raw.rstrip(b'\n')).hexdigest() != manifest['observation_sha256']:
            raise ValueError('InvestorAce observation hash mismatch')
        pulse = json.loads(raw).get('_evidence', {}).get('macro', {}).get('pulse') or {}
        if pulse.get('as_of'):
            stamp = datetime.fromisoformat(pulse['as_of'])
            if stamp < session_close + timedelta(minutes=20):
                break
            parts = pulse.get('components') or {}
            heat = pulse.get('heat')
            if (isinstance(heat, (int, float)) and 0 <= heat <= 100 and
                    all(parts.get(k, {}).get('date') == day for k in ('vix', 'sp500_ma50', 'sp500_ma200')) and
                    stamp.astimezone(NY).date().isoformat() <= str(CAL.next_session(day).date()) and
                    stamp <= session_close + timedelta(hours=12)):
                return dict(day=day, heat=heat, as_of=pulse['as_of'], components=parts,
                            url=base.replace('raw.githubusercontent.com/', 'github.com/').replace('/main/', '/blob/main/') + '/observation.json')
        run = manifest.get('previous_run_id')
        if not run:
            break
    raise ValueError('No verified after-close monitor reading available for ' + day)


def select_daily(frame, fund, day, url):
    slug, minimum = FUNDS[fund]
    sources = {'spdr_cdn', 'ishares_cdn'} if slug != 'ndx' else {'invesco_cdn'}
    frame = frame[frame.source.isin(sources)].copy()
    frame['day'] = frame.as_of.astype(str)
    frame = frame[frame.day <= day]
    if frame.empty:
        raise ValueError(f'{fund}: no sponsor holdings as of {day}')
    stamp = frame.day.max()
    basket = frame[(frame.day == stamp) & (frame.weight > 0)].copy()
    # Different daily sources can cover the same fund. Never combine their weights.
    if 'spdr_cdn' in set(basket.source):
        basket = basket[basket.source == 'spdr_cdn']
    if (len(basket.ticker.unique()) < minimum or basket.ticker.duplicated().any()
            or (datetime.fromisoformat(day) - datetime.fromisoformat(stamp)).days > 7
            or not .9 <= basket.weight.sum() <= 1.1):
        raise ValueError(f'{fund}: stale or incomplete holdings for {day}')
    row = basket.sort_values(['weight', 'ticker'], ascending=[False, True]).iloc[0]
    return dict(fund=fund, symbol=row.ticker.replace('.', '-'), name=row['name'],
                weight_pct=round(float(row.weight)*100, 6), as_of=stamp, source=row.source, url=url)


def compositions(day):
    import pandas as pd
    cutoff = CAL.session_close(day).isoformat()
    query = urlencode({'until': cutoff, 'per_page': 1})
    sha = json.loads(get('https://api.github.com/repos/kovagent/indexkit/commits?' + query))[0]['sha']
    picked = []
    for fund, (slug, _) in FUNDS.items():
        first = datetime.fromisoformat(day).replace(day=1)
        for month in (day[:7], (first-timedelta(days=1)).strftime('%Y-%m')):
            path = f'data/{slug}/{slug}-{month}.parquet'
            try:
                raw = get(f'https://raw.githubusercontent.com/kovagent/indexkit/{sha}/{path}')
                row = select_daily(pd.read_parquet(io.BytesIO(raw)), fund, day,
                                   f'https://github.com/kovagent/indexkit/blob/{sha}/{path}')
            except (OSError, ValueError):
                if month == day[:7]:
                    continue
                raise
            picked.append(row)
            break
    return picked


def quotes(symbol):
    data = fetch(symbol)
    if data['meta']['symbol'] != symbol or data['meta']['currency'] != 'USD':
        raise ValueError(f'{symbol}: unexpected quote')
    raw = data['indicators']['quote'][0]['close']
    adjusted = data['indicators']['adjclose'][0]['adjclose']
    return {datetime.fromtimestamp(t, NY).date().isoformat(): (c, a)
            for t, c, a in zip(data['timestamp'], raw, adjusted, strict=True)
            if all(isinstance(v, (int, float)) and math.isfinite(v) and v > 0 for v in (c, a))}


def settle(state, day, prices):
    """Advance exactly one completed exchange session. All fills are atomic."""
    prev = state['as_of']
    if day != str(CAL.next_session(prev).date()):
        raise ValueError('Nonconsecutive session')
    order, position = state['pending'], state['position']
    if position:
        for leg in position['legs']:
            sym = leg['symbol']
            leg['value'] *= prices[sym][day][1] / prices[sym][prev][1]
    if order and order['target'] <= day:
        if order['target'] != day or datetime.fromisoformat(order['submitted']) >= CAL.session_close(day).to_pydatetime():
            raise ValueError('Unregistered or late order')
        if order['side'] == 'BUY':
            if position:
                raise ValueError('Duplicate entry')
            legs = []
            for pick in order['leaders']:
                for side, symbol, budget in [('leader', pick['symbol'], state['cash']), ('etf', pick['fund'], state['benchmark_cash'])]:
                    raw = prices[symbol][day][0]
                    value = budget / len(FUNDS) / (1 + COST)
                    legs.append(dict(side=side, fund=pick['fund'], symbol=symbol, entry_price=raw,
                                     entry_units=value/raw, value=value))
            state['position'] = dict(order=order, entry=day, legs=legs)
            state['cash'] = state['benchmark_cash'] = 0.
        elif order['side'] == 'SELL' and position:
            exits = [dict(**leg, exit_price=prices[leg['symbol']][day][0],
                          proceeds=leg['value']*(1-COST)) for leg in position['legs']]
            state['cash'], state['benchmark_cash'] = [
                sum(leg['proceeds'] for leg in exits if leg['side'] == side) for side in ('leader', 'etf')]
            state['history'].append(dict(entry=position['entry'], buy=position['order'], exit=day, sell=order, legs=exits,
                                         equity=state['cash'], benchmark=state['benchmark_cash']))
            state['position'] = None
        else:
            raise ValueError('Invalid sale')
        state['pending'] = None
    legs = (state['position'] or {}).get('legs', [])
    state['equity'] = state['cash'] + sum(x['value'] for x in legs if x['side'] == 'leader')
    state['benchmark'] = state['benchmark_cash'] + sum(x['value'] for x in legs if x['side'] == 'etf')
    state['as_of'] = day


def decide(state, sample, leaders, now):
    if sample['day'] != state['as_of']:
        raise ValueError('Monitor/ledger session mismatch')
    day = sample['day']
    state['monitor'] = sample
    if leaders:
        if len(leaders) != len(FUNDS) or {x['fund'] for x in leaders} != set(FUNDS):
            raise ValueError('Incomplete basket')
        state['leaders'] = leaders
    if state['pending']:
        return
    side = ('SELL' if state['position'] and sample['heat'] >= 80 else
            'BUY' if not state['position'] and sample['heat'] < 20 else None)
    if not side or (side == 'BUY' and not leaders):
        return
    target = str(CAL.next_session(day).date())
    if now >= CAL.session_close(target).to_pydatetime():
        return
    order = dict(side=side, signal_day=day, heat=sample['heat'], target=target,
                 submitted=now.isoformat(), source=sample['url'])
    if side == 'BUY':
        order['leaders'] = leaders
    state['pending'] = order


def main():
    before = PATH.read_text()
    state = json.loads(before)
    now = datetime.now(timezone.utc)
    end, _ = sessions(now)
    latest = str(end.date())
    names = {x['symbol'] for x in (state['position'] or {}).get('legs', [])}
    if (state['pending'] or {}).get('side') == 'BUY':
        names.update(FUNDS)
        names.update(x['symbol'] for x in state['pending']['leaders'])
    if state['as_of'] < latest:
        prices = {s: quotes(s) for s in sorted(names)}
        due = CAL.sessions_in_range(CAL.next_session(state['as_of']), end)
        if state['monitor']['day'] != state['as_of'] and state['as_of'] not in state['skipped']:
            state['skipped'].append(state['as_of'])
        for d in due:
            day = str(d.date())
            settle(state, day, prices)
            if day != latest:
                state['skipped'].append(day)
    warnings = []
    try:
        sample = state['monitor'] if state['monitor']['day'] == latest else monitor(latest)
    except (OSError, ValueError, KeyError) as exc:
        sample = None
        warnings.append(str(exc))
    leaders = None
    try:
        leaders = compositions(latest)
    except (OSError, ValueError, IndexError, KeyError) as exc:
        warnings.append('Pesos pendientes: ' + str(exc))
    if sample:
        decide(state, sample, leaders, datetime.now(timezone.utc))
    elif leaders:
        state['leaders'] = leaders
    state['warnings'] = warnings
    body = json.dumps(state, ensure_ascii=False, indent=2, allow_nan=False) + '\n'
    if body != before:
        tmp = PATH.with_suffix('.tmp')
        tmp.write_text(body)
        tmp.replace(PATH)
    print(latest, 'NAV', state['equity'], 'order', (state['pending'] or {}).get('side'), warnings)


if __name__ == '__main__':
    main()
