import copy
import json
import os
import tempfile
import unittest
from pathlib import Path

import round2_refresh as r

BUNDLED = json.loads(Path('dist/paper-round2.json').read_text())


def later(days=1):
    new = copy.deepcopy(BUNDLED)
    new['mark'] = '2026-11-26' if days else new['mark']
    new['built'] = '2026-11-27T05:00:00+00:00'
    for book in new['accounts'].values():
        last = dict(book['days'][-1], day=new['mark'])
        book['days'] = book['days'] + [last]
    return new


class Refresh(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.cwd = os.getcwd()
        os.chdir(self.dir.name)
        Path('dist').mkdir()
        Path('dist/paper-round2.json').write_text(json.dumps(BUNDLED))

    def tearDown(self):
        os.chdir(self.cwd)
        self.dir.cleanup()

    def test_takes_a_newer_reconciled_report(self):
        new = later()
        self.assertTrue(r.main(fetch=lambda: json.dumps(new).encode()))
        self.assertEqual(json.loads(Path('dist/paper-round2.json').read_text())['mark'], '2026-11-26')

    def test_keeps_the_bundle_when_the_report_is_wrong_or_missing(self):
        bad = later()
        bad['accounts']['rules']['days'][-1]['nav'] += 5
        for fetch in (lambda: json.dumps(bad).encode(), lambda: (_ for _ in ()).throw(OSError('offline')),
                      lambda: json.dumps(dict(later(), round='v19')).encode()):
            self.assertFalse(r.main(fetch=fetch))
            self.assertEqual(json.loads(Path('dist/paper-round2.json').read_text())['mark'], BUNDLED['mark'])
        self.assertIn('older mark', '; '.join(r.problems(dict(BUNDLED, mark='2026-11-20'), BUNDLED)))


if __name__ == '__main__':
    unittest.main()
