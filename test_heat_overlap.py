import copy
import unittest
from datetime import datetime

import heat_overlap as h


class OverlapTests(unittest.TestCase):
    def setUp(self):
        names = ['AAA','BBB','CCC','DDD','EEE','FFF','GGG','HHH','III','ZZZ']
        base = [dict(ticker=s, name=s, weight=.115-i*.006) for i,s in enumerate(names)]
        # Separate classes rank below the top ten as securities but first as an issuer.
        spy = base + [dict(ticker='ALPA', name='Alpha Corp CL A', weight=.060),
                      dict(ticker='ALPC', name='Alpha Corp CL C', weight=.059)]
        qqq = base + [dict(ticker='ALPA', name='Alpha Corp Class A', weight=.060),
                      dict(ticker='ALPC', name='Alpha Corp Class C', weight=.059)]
        self.selection = h.overlap([dict(fund=f,date='2026-11-20',url='archive',rows=rows)
                                    for f,rows in zip(h.FUNDS,(spy,qqq))])
        self.start = datetime.fromisoformat('2026-11-24T15:00:00+00:00')
        self.now = datetime.fromisoformat('2026-11-24T17:00:00+00:00')
        self.day = '2026-11-24'
        self.sample = dict(intraday=True, heat=19.9, day=self.day, as_of=self.now.isoformat(), url='archive')
        self.prices = lambda symbol:{self.day:(100., 50.), '2026-11-25':(55.,55.)}

    def test_merge_classes_before_top_ten(self):
        candidates = self.selection['candidates']
        self.assertEqual(len(candidates), 10)
        self.assertEqual(candidates[0]['classes'], ['ALPA','ALPC'])
        self.assertAlmostEqual(candidates[0]['weights']['SPY'], .119)
        self.assertNotIn('ZZZ', [p['symbol'] for p in candidates])

    def test_only_shared_issuers_and_independent_books(self):
        a,b = h.new_book(5),h.new_book(6)
        selection = dict(self.selection,candidates=self.selection['candidates'][:5])
        for book in [a,b]:
            h.register(book,self.sample,self.now,self.start,selection)
        self.assertEqual(len(a['pending']['picks']),5)
        self.assertIsNone(b['pending'])
        only = [dict(ticker='X'+str(i), name='Issuer X'+str(i),weight=1/(i+1)) for i in range(10)]
        other = [dict(ticker='Y'+str(i), name='Issuer Y'+str(i),weight=1/(i+1)) for i in range(10)]
        shared = h.overlap([dict(fund=f,rows=rows,url='',date=self.day) for f,rows in zip(h.FUNDS,(only,other))])
        self.assertEqual(shared['candidates'],[])

    def test_boundaries_recorded_order_and_same_date_controls(self):
        for size in h.SIZES:
            b=h.new_book(size)
            for samp in [dict(self.sample,heat=20),dict(self.sample,as_of='2026-11-24T14:59:00+00:00'),dict(self.sample,intraday=False)]:
                h.register(b,samp,self.now,self.start,self.selection)
                self.assertIsNone(b['pending'])
            h.register(b,self.sample,self.now,self.start,self.selection)
            pending=copy.deepcopy(b['pending'])
            h.register(b,self.sample,self.now,self.start,self.selection)
            self.assertEqual(b['pending'],pending)
            exp=copy.deepcopy(b)
            h.apply_close(exp,'2026-11-23',self.day,self.prices,lambda *_:False)
            self.assertEqual((exp['cash'],exp['events'][0]['status']),(10000,'expired'))
            h.apply_close(b,'2026-11-23',self.day,self.prices,lambda *_:True)
            self.assertEqual(len(b['holdings']),size)
            for leg in b['holdings']:
                self.assertAlmostEqual(leg['value']/b['nav'],1/size)
            h.apply_close(b,self.day,'2026-11-25',self.prices,lambda *_:True)
            for nav in [b['nav'],*b['controls'].values()]:
                self.assertAlmostEqual(nav,10000/1.001*1.1)

    def test_euphoria_only_after_42_calendar_months(self):
        b=h.new_book(5)
        b.update(entry='2023-05-24',holdings=[dict(symbol='AAA',value=500.)],cash=0)
        self.assertEqual(h.min_date('2022-08-31'),'2026-02-28')
        for d, heat in [('2026-11-23',95),('2026-11-24',79.9),('2026-11-24',80)]:
            now=datetime.fromisoformat(d+'T21:40:00+00:00')
            sample=dict(day=d,heat=heat,intraday=False,as_of=now.isoformat(),url='archive')
            h.register(b,sample,now,datetime.fromisoformat('2023-05-01T10:00:00+00:00'))
            if heat!=80:self.assertIsNone(b['pending'])
        self.assertEqual(b['pending']['target'],'2026-11-25')
        h.apply_close(b,self.day,'2026-11-25',self.prices,lambda *_:True)
        self.assertAlmostEqual(b['cash'],550.*.999)
        self.assertIsNone(b['entry'])
        self.assertEqual(b['events'][-1]['status'],'sold')
