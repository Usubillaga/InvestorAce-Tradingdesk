import copy
import json
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import patch

import pandas as pd

import heat_leaders as h


class LedgerTests(unittest.TestCase):
    def setUp(self):
        names = [dict(fund=f, symbol=s) for f, s in zip(h.FUNDS, ['AAPL', 'AAPL', 'GS'])]
        self.state = dict(as_of='2026-11-20', cash=10000., benchmark_cash=10000., position=None,
                          pending=None, history=[], leaders=names)
        self.now = datetime.fromisoformat('2026-11-23T12:00:00+00:00')
        self.prices = {s: {'2026-11-23': (100., 50.), '2026-11-24': (50., 52.)}
                       for s in ['AAPL', 'GS', *h.FUNDS]}

    def decide(self, score, leaders=None):
        day = self.state['as_of']
        h.decide(self.state, dict(day=day, heat=score, url='archive'),
                 self.state['leaders'] if leaders is None else leaders, self.now)

    def test_panic_boundary_next_close_overlap_and_euphoria_exit(self):
        self.decide(20.)
        self.assertIsNone(self.state['pending'])
        self.decide(19.9)
        order = copy.deepcopy(self.state['pending'])
        self.decide(5.)
        self.assertEqual(self.state['pending'], order)
        h.settle(self.state, '2026-11-23', self.prices)
        self.assertAlmostEqual(self.state['equity'], 10000 / 1.001)
        self.assertEqual(sum(r['symbol']=='AAPL' for r in self.state['position']['legs']), 2)
        self.now = datetime.fromisoformat('2026-11-23T23:00:00+00:00')
        self.decide(79.9)
        self.assertIsNone(self.state['pending'])
        self.decide(80., [])  # a sale never waits for new holdings
        self.assertEqual(self.state['pending']['target'], '2026-11-24')
        h.settle(self.state, '2026-11-24', self.prices)
        self.assertIsNone(self.state['position'])
        self.assertAlmostEqual(self.state['cash'], 10000/1.001 * 1.04 * .999)
        self.assertEqual(len(self.state['history']), 1)
        self.assertAlmostEqual(self.state['benchmark'], self.state['equity'])

    def test_missing_weights_and_late_order(self):
        self.decide(12, [])
        self.assertIsNone(self.state['pending'])
        self.now = datetime.fromisoformat('2026-11-23T21:00:00+00:00')
        self.decide(12)
        self.assertIsNone(self.state['pending'])

    def test_early_close(self):
        self.state['as_of'] = '2026-11-25'
        self.now = datetime.fromisoformat('2026-11-27T18:01:00+00:00')
        self.decide(19)
        self.assertIsNone(self.state['pending'])

    def test_weights_must_be_point_in_time_complete_and_fresh(self):
        rows = [dict(ticker=str(i), source='spdr_cdn', weight=(2 if i==3 else 1)/31,
                     name=str(i), as_of='2026-11-19') for i in range(30)]
        future = dict(rows[0], ticker='FUTURE', as_of='2026-11-23', weight=.99)
        chosen = h.select_daily(pd.DataFrame(rows+[future]), 'DIA', '2026-11-20', 'archive')
        self.assertEqual(chosen['symbol'], '3')
        for data, day in [(rows[:-1], '2026-11-20'), (rows, '2026-12-01')]:
            with self.assertRaises(ValueError):
                h.select_daily(pd.DataFrame(data), 'DIA', day, 'archive')

    def test_intraday_snapshot_rejected(self):
        run = '20261120T213100000000-fixture'
        ptr = json.dumps({'run_id':run}).encode()
        pulse = {'as_of':'2026-11-20T20:30:00+00:00'}
        raw = json.dumps({'_evidence':{'macro':{'pulse':pulse}}}).encode()
        manifest = json.dumps({'run_id':run,'observation_sha256':h.hashlib.sha256(raw).hexdigest()}).encode()
        with patch.object(h, 'get', side_effect=[ptr, manifest, raw]), self.assertRaises(ValueError):
            h.monitor('2026-11-20')

    def test_real_archive_hash_excludes_serialization_newline(self):
        day = '2026-11-20'
        run = '20261120T222500000000-fixture'
        pulse = dict(as_of='2026-11-20T22:24:00+00:00', heat=15.4,
                     components={k:dict(date=day) for k in ('vix','sp500_ma50','sp500_ma200')})
        raw = json.dumps({'_evidence':{'macro':{'pulse':pulse}}}, sort_keys=True, separators=(',', ':')).encode()
        ptr = json.dumps({'run_id':run}).encode()
        manifest = json.dumps(dict(run_id=run, observation_sha256=h.hashlib.sha256(raw).hexdigest())).encode()
        with patch.object(h, 'get', side_effect=[ptr, manifest, raw + b'\n']):
            self.assertEqual(h.monitor(day)['heat'], 15.4)

    def test_public_page_and_study_controls(self):
        root = Path(__file__).parent
        study = json.loads((root/'dist/heat-study.json').read_text())
        self.assertEqual(len(study['episodes']), study['periods'][0]['n'])
        self.assertTrue(all(t['signal']<t['entry']<=t['exit_signal']<t['exit']
                            and t['heat']<20 and t['exit_heat']>=80 for t in study['episodes']))
        self.assertEqual([p['offset_n'] for p in study['periods'][1:]], [20]*3)
        self.assertIn('href="heat-leaders.html"', (root/'dist/index.html').read_text())
