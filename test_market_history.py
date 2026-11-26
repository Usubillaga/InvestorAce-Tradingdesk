import unittest

from snapshot import market_history


def build(rows):
    return {'record': {'_evidence': {'macro': {'pulse': {
        'moves': [dict(symbol=symbol, date=day, close=close, change_pct=change)
                  for symbol, day, close, change in rows],
        'components': {'sample': len(rows)},
    }}}}}


class MarketHistoryTests(unittest.TestCase):
    def test_regression_and_same_day_revision_in_one_build(self):
        older = build([('DAX', '2026-11-25', 24702, -1.26),
                       ('SPX', '2026-11-25', 7181, -0.3),
                       ('removed', '2026-11-25', 10, 0)])
        newer = build([('SPX', '2026-11-25', 7182, -0.25),
                       ('DAX', '2026-11-24', 25018, 1.27)])
        market = market_history({'new': newer, 'old': older})
        self.assertEqual([(r['symbol'], r['date'], r['close'], r['change_pct'])
                          for r in market['moves']],
                         [('SPX', '2026-11-25', 7182, -0.25),
                          ('DAX', '2026-11-25', 24702, -1.26)])
        self.assertEqual(market['history']['DAX'][-1], ('2026-11-25', 24702))
