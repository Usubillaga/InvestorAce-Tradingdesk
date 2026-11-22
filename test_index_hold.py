import unittest
from datetime import datetime, timezone

from index_hold import START, advance, fresh
from index_paper import CAL, FEE, FUNDS


def quotes(price=100.0):
    days = CAL.sessions_in_range('2026-11-02', '2026-12-31')
    return {s: {str(d.date()): (price, price + 1, price - 1, price) for d in days} for s in FUNDS}


def at(day, hour=23):
    return datetime(2026, 11 if day > 3 else 12, day, hour, tzinfo=timezone.utc)


class IndexHold(unittest.TestCase):
    def test_nothing_before_the_first_session(self):
        state = fresh()
        self.assertFalse(advance(state, quotes(), datetime(2026, 11, 22, 23, tzinfo=timezone.utc)))
        self.assertIsNone(state['bought'])

    def test_buys_once_equally_with_costs_and_marks_each_close(self):
        state, q = fresh(), quotes()
        self.assertTrue(advance(state, q, datetime(2026, 11, 23, 23, tzinfo=timezone.utc)))
        self.assertEqual(state['bought'], START)
        shares = int(2000 / (100 * (1 + FEE)))
        self.assertEqual({h['shares'] for h in state['holdings'].values()}, {shares})
        self.assertAlmostEqual(state['equity'], 10000 - 5 * shares * 100 * FEE, places=2)
        self.assertFalse(advance(state, q, datetime(2026, 11, 23, 23, 30, tzinfo=timezone.utc)))   # same day
        for s in FUNDS:
            q[s]['2026-11-24'] = (100, 112, 99, 110)
        self.assertTrue(advance(state, q, datetime(2026, 11, 24, 23, tzinfo=timezone.utc)))
        self.assertEqual({h['shares'] for h in state['holdings'].values()}, {shares})              # never sells
        self.assertAlmostEqual(state['equity'], state['cash'] + 5 * shares * 110, places=2)
        self.assertEqual([m['session'] for m in state['marks']], ['2026-11-23', '2026-11-24'])

    def test_dividends_once_and_splits(self):
        state, q = fresh(), quotes()
        advance(state, q, datetime(2026, 11, 23, 23, tzinfo=timezone.utc))
        shares = state['holdings']['SPY']['shares']
        cash = state['cash']
        divs = {'SPY': [('2026-11-20', 9.0), ('2026-11-25', 1.5)]}
        splits = {'QQQ': [('2026-11-25', 2.0)]}
        advance(state, q, datetime(2026, 11, 25, 23, tzinfo=timezone.utc), divs, splits)
        self.assertAlmostEqual(state['cash'], cash + shares * 1.5, places=2)          # earlier ex-date ignored
        self.assertEqual(state['holdings']['QQQ']['shares'], 2 * shares)
        advance(state, q, datetime(2026, 11, 26 + 1, 23, tzinfo=timezone.utc), divs, splits)
        self.assertEqual(len(state['dividends']), 1)
        self.assertEqual(state['holdings']['QQQ']['shares'], 2 * shares)


if __name__ == '__main__':
    unittest.main()
