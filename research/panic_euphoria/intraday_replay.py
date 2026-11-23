"""Replay the archived intraday entry through the production order and fill logic."""
import json
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from heat_leaders import CAL, decide, settle

def replay(data):
    readings = sorted(data['readings'], key=lambda r: r['time'])
    entries = [r for r in readings if r['heat'] < 20]
    signal, = entries  # frozen audit dataset with one observed panic
    day = signal['day']
    previous = str(CAL.previous_session(day).date())
    state = dict(as_of=previous, pending=None, position=None, history=[], cash=10000., benchmark_cash=10000.)
    observed = dict(day=day, heat=signal['heat'], intraday=True, as_of=signal['time'], url=signal['run'])
    decide(state, observed, data['weights'], datetime.fromisoformat(data['known_at']))
    prices = {s: {day:(q['close'],q['close'])} for s,q in data['prices'].items()}
    settle(state, day, prices)
    legs = state['position']['legs']
    nav = {side: sum(x['entry_units']*data['prices'][x['symbol']]['mark'] for x in legs if x['side']==side)
           for side in ('leader','etf')}
    return dict(readings=len(readings), sessions=len({r['day'] for r in readings}), entries=len(entries),
                completed=0, entry=day, legs=legs, mark_time=data['mark_time'], nav=nav)

if __name__ == '__main__':
    data = json.loads(Path(__file__).with_name('intraday_inputs.json').read_text())
    print(json.dumps(replay(data), indent=2))
