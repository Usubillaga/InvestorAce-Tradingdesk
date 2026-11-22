import unittest
from datetime import datetime, timezone
from index_paper import CAL, FUNDS, advance, settle, signal


class IndexPaper(unittest.TestCase):
    def test_long_short_and_stops(self):
        for side, stop in [('LONG', 98), ('SHORT', 102)]:
            order = dict(side=side, budget=1500, risk=50, stop_distance=2)
            result = settle(order, (100,103,97,101))
            self.assertEqual((result['exit'], result['shares'], result['status']), (stop,15,'STOP'))
            self.assertLess(result['net'], -30)
            self.assertEqual(settle(order,(100,101,99,100))['net'], -3)

    def test_signal_symmetry(self):
        for step, side in [(1,'LONG'), (-1,'SHORT'), (0,'FLAT')]:
            prices = [100+i*step for i in range(20)]
            self.assertEqual(signal([(p,p+1,p-1,p) for p in prices])[0], side)

    def test_forward_only_holiday_and_retries(self):
        days = CAL.sessions_in_range('2026-10-15','2026-11-30')
        quotes = {s:{str(d.date()):(p,p+1,p-1,p) for p,d in enumerate(days,100)} for s in FUNDS}
        state = dict(equity=10000,signals=[],trades=[])
        def run(day,hour):
            return advance(state,quotes,datetime(2026,11,day,hour,tzinfo=timezone.utc))
        self.assertTrue(run(25,23))
        self.assertEqual(state['target'],'2026-11-27')
        self.assertFalse(run(26,23))
        self.assertFalse(state['trades'])
        self.assertTrue(run(30,23))
        self.assertEqual([x['session'] for x in state['trades']], ['2026-11-27']*5)
        self.assertFalse(run(30,23))
        self.assertEqual(state['target'],'2026-12-01')
