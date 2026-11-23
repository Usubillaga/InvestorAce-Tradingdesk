"""Reproduce the paper basket at next-session closes using the frozen research inputs."""
import csv
import gzip
import json
from datetime import date
from pathlib import Path
from statistics import median

HERE = Path(__file__).resolve().parent
FUNDS = ('SPY', 'QQQ', 'DIA')
FEE = 0.001
PERIODS = [('2006–2026', '2006', '2027'), ('2014–17', '2014', '2018'),
           ('2018–21', '2018', '2022'), ('2022–26', '2022', '2027')]


def read_inputs():
    with gzip.open(HERE / 'sessions.csv.gz', 'rt') as stream:
        days = [dict(date=r.pop('date'), **{k: float(v) for k, v in r.items()})
                for r in csv.DictReader(stream)]
    picks = {}
    with (HERE / 'selections.csv').open() as stream:
        for row in csv.DictReader(stream):
            assert row['as_of'] < row['date'] and (not row['filed'] or row['filed'] < row['date'])
            picks.setdefault(row['date'], {})[row['fund']] = row['symbol']
    return days, picks


def simulate(days, picks, start, end, fixed=False, curve=None):
    balances = [10000., 10000.]
    peaks = balances.copy()
    drawdowns = [0., 0.]
    legs, pending, entry = [], None, None
    trades = []
    exposed = 0
    for i in range(start, end):
        r = days[i]
        if legs:
            exposed += 1
            balances = [sum(units * r[s] for s, units in side) for side in legs]
        if pending == 'SELL':
            balances = [value * (1 - FEE) for value in balances]
            trades.append(dict(**entry, exit=r['date'], days=i-buy_i, exit_signal=days[i-1]['date'],
                               exit_heat=days[i-1]['heat'], pnl=balances[0]/initial[0]-1,
                               benchmark=balances[1]/initial[1]-1))
            legs = []
        elif pending == 'BUY':
            pick = picks[days[i-1]['date']]
            initial = balances.copy()
            buy_i = i
            legs = []
            for capital, names in zip(balances, ([pick[f] for f in FUNDS], FUNDS)):
                legs.append([(s, capital / len(FUNDS) / (r[s] * (1 + FEE))) for s in names])
            balances = [value / (1 + FEE) for value in balances]
            entry = dict(signal=days[i-1]['date'], heat=days[i-1]['heat'], entry=r['date'],
                         symbols=[pick[f] for f in FUNDS])
        pending = None
        for n, value in enumerate(balances):
            peaks[n] = max(peaks[n], value)
            drawdowns[n] = min(drawdowns[n], value / peaks[n] - 1)
        if curve is not None and (i == end-1 or days[i+1]['date'][:7] != r['date'][:7]):
            curve.append([r['date'], round(balances[0], 2), round(balances[1], 2)])
        if legs and ((i - buy_i == 62) if fixed else r['heat'] >= 80):
            pending = 'SELL'
        elif not legs and r['heat'] < 20 and (i == 0 or days[i-1]['heat'] >= 20):
            if set(picks.get(r['date'], {})) != set(FUNDS):
                raise ValueError(f"Missing point-in-time selection for {r['date']}")
            pending = 'BUY'
    years = (date.fromisoformat(days[end-1]['date']) - date.fromisoformat(days[start]['date'])).days / 365.25
    return dict(final=balances[0], benchmark=balances[1], dd=drawdowns[0], benchmark_dd=drawdowns[1],
                cagr=(balances[0]/10000)**(1/years)-1, benchmark_cagr=(balances[1]/10000)**(1/years)-1,
                n=len(trades), beat=sum(t['pnl']>t['benchmark'] for t in trades),
                open=bool(legs), pending=pending, exposure=exposed/(end-start)), trades


def main():
    days, picks = read_inputs()
    report = dict(as_of=days[-1]['date'], from_date=days[0]['date'], periods=[], episodes=[])
    for label, lo, hi in PERIODS:
        sessions = [i for i, d in enumerate(days) if lo <= d['date'] < hi]
        a, b = sessions[0], sessions[-1] + 1
        curve = [] if label == PERIODS[0][0] else None
        stats, trades = simulate(days, picks, a, b, curve=curve)
        fixed, _ = simulate(days, picks, a, b, fixed=True)
        record = dict(period=label, **stats, fixed63=fixed)
        if label == PERIODS[0][0]:
            report['episodes'] = trades
            report['monthly'] = curve
        else:
            offsets = [simulate(days, picks, start, b)[0] for start in sessions[:100:5]]
            record.update(offset_n=len(offsets), wins=sum(r['final']>r['benchmark'] for r in offsets),
                          ties=sum(r['final']==r['benchmark'] for r in offsets),
                          median_excess_cagr=median(r['cagr']-r['benchmark_cagr'] for r in offsets))
        report['periods'].append(record)
    target = HERE.parents[1] / 'dist/heat-study.json'
    target.write_text(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False) + '\n')


if __name__ == '__main__':
    main()
