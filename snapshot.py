"""Generate the desk from a pinned InvestorAce checkout, with journal failure isolation."""
import argparse
import hashlib
import importlib
import json
import math
import os
import re
import subprocess
import sys
from datetime import date, datetime, time, timezone
from pathlib import Path
from tempfile import NamedTemporaryFile

RUN = re.compile(r'[0-9]{8}T[0-9]{12}-[0-9a-f]{32}')
BASE = 'https://github.com/Usubillaga/InvestorAce'
PAGES = 'https://usubillaga.github.io/InvestorAce/'
ACCOUNTS = {
    'timing': 'Opportunity + Timing', 'opportunity': 'Opportunity', 'fundamental': 'Fundamentals',
}
ERRORS = (ValueError, TypeError, KeyError, AttributeError, OSError, OverflowError, IndexError)


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def number(value, nullable=False):
    if nullable and value is None:
        return None
    if type(value) not in (int, float) or not math.isfinite(value):
        raise ValueError('Fehlender oder ungültiger Zahlenwert.')
    return value


def need(ok, message='Unvollständiges Journal oder unerwartetes Format.'):
    if not ok:
        raise ValueError(message)


def problem(section, name, error):
    return dict(section=section, name=name,
                kind='Build-Konflikt' if isinstance(error, LookupError) and not isinstance(error, (KeyError, IndexError)) else 'Datenfehler',
                message=str(error.args[0]) if type(error) in (ValueError, LookupError) and error.args else
                'Datei fehlt oder Pflichtfelder bzw. Datentypen sind unvollständig.')


def select(row, keys):
    return {k: row.get(k) for k in keys.split()}


def score_rows(record):
    rows = []
    for ticker, inp in record['_evidence']['inputs'].items():
        row = record.get(ticker, {})
        assessment = row.get('assessment') or {}
        opp = row.get('opportunity') or {}
        rows.append(dict(ticker=ticker, name=inp.get('name'), sector=inp.get('sector'), currency=inp.get('cur'),
                         score=assessment.get('model_score'), band=assessment.get('model_band'),
                         scoreRange=[assessment.get('score_lower'), assessment.get('score_upper')],
                         review=assessment.get('review_status'), issues=assessment.get('issues', []),
                         components=assessment.get('components', []), regime=row.get('regime') or {},
                         regimeComponents=row.get('regime_components') or {},
                         valuation=select(row, 'ngv cover'),
                         cashOffer=opp.get('cash_offer'),
                         opportunity=select(opp, 'score label score_lower score_upper expires_at valid_until quote_status status withdrawn version schema signal_basis profile'),
                         inputs=select(inp, 'financial_period financial_published_at financial_retrieved_at quote_observed_at shares shares_asof shares_basis cash_flow_basis normalization_status built'),
                         price=row.get('price'), symbol=inp.get('yf') or ticker))
    return rows


def archived_inputs(build, ticker, opportunity, at):
    r = build['record']
    inp = r['_evidence']['inputs'].get(ticker, {})
    row = r.get(ticker, {})
    archived = row.get('opportunity') or {}
    opp = opportunity.project(archived, as_of=at) or {}
    timing = inp.get('timing') or {}
    return dict(fundamental=opp.get('fundamental_score'), opportunity=opp.get('score'),
                signal=opp.get('label'), scoreVersion=archived.get('version') or archived.get('schema'),
                signalExpiry=opp.get('expires_at'), quoteStatus=opp.get('quote_status'),
                **select(inp, 'sector cur yf quote_observed_at financial_period financial_published_at'),
                **select(timing, 'status close trend sma36 sma50 sma200 extension_atr resistance last_bar input_sha256 source price_basis'))


def get_build(builds, run):
    if not isinstance(run, str) or not RUN.fullmatch(run) or run not in builds:
        raise LookupError('Die Build-ID ist nicht über die verifizierte Veröffentlichungsfolge auflösbar.')
    return builds[run]


def same(actual, expected):
    """Compare exactly, including nulls, booleans and all journal fields."""
    return json.dumps(actual, sort_keys=True, allow_nan=False) == json.dumps(expected, sort_keys=True, allow_nan=False)


def record_order_events(events, orders, decision, fields):
    for order_id, order in orders:
        history = events.setdefault(order_id, [])
        evidence = select(order, fields)
        if not history or not same(evidence, history[-1]['evidence']):
            history.append(dict(run=decision['run'], at=decision['at'], evidence=evidence))


def twin_orders(engine, ledger, build, at, twin):
    series = engine.merge_series([build['record']])
    series.update({symbol: sorted(rows.items()) for symbol, rows in ledger['execution_closes'].items()})
    return engine.active_trading.replay(twin, series, at.date())['orders']


def paper(path, builds, engine, source):
    doc = read(path)
    need(type(doc['version']) is int and doc['version'] == 1 and isinstance(doc['decisions'], list)
         and bool(doc['decisions']), 'Kein vollständiges Codex-Journal v1.')
    need(set(doc['accounts']) == set(ACCOUNTS), 'Die drei Modellkonten fehlen oder sind unvollständig.')
    replay = engine.fresh()
    events, twin_events, by_time = {}, {}, {}
    for d in doc['decisions']:
        build = get_build(builds, d['run'])
        at = datetime.fromisoformat(d['at'])
        need(at.utcoffset() == timezone.utc.utcoffset(None), 'Entscheidungszeitpunkt ist nicht in UTC.')
        need(engine.advance(replay, build, at, entry_policy=d.get('entry_policy')), 'Entscheidung liegt außerhalb des gültigen Sitzungs- oder Build-Fensters.')
        need(same(d, replay['decisions'][-1]), 'Journalentscheidung stimmt nicht mit der Nachrechnung aus ihrem Build überein.')
        by_time[d['at']] = d
        for key, account in replay['accounts'].items():
            record_order_events(events, ((f'paper-{key}-{i}', o) for i, o in enumerate(account['orders'], 1)),
                                d, 'status day close fx euros detail')
        for version, twin in replay['breakout_comparison'].items():
            orders = twin_orders(engine, replay, build, at, twin)
            record_order_events(twin_events, ((f'twin-{version}-{o["id"]}', o) for o in orders),
                                d, 'status fill_date fill_price amount fee realized reason')
    need(same(doc['accounts'], replay['accounts']),
         'Kontowerte, Positionen oder Orderdaten weichen von der Nachrechnung aus den Entscheidungs-Builds ab.')

    decisions = replay['decisions']
    latest = decisions[-1]
    accounts, orders, positions = [], [], []
    for key, name in ACCOUNTS.items():
        account = replay['accounts'][key]
        outcome = latest['outcomes'][key]
        equity = outcome['equity']
        pending = [o for o in account['orders'] if o['status'] == 'Pending']
        planned = sum(o['euros'] for o in pending if o['side'] == 'Buy')
        sale_value = sum(account['holdings'][o['ticker']]['local_value'] / account['holdings'][o['ticker']]['fx']
                         for o in pending if o['side'] == 'Sell')
        invested = None if equity is None else equity - account['cash']
        accounts.append(dict(key=key, name=name, run=latest['run'], session=latest['session'],
                             equity=equity, cash=account['cash'], fees=account['fees'], turnover=account['turnover'],
                             pnl=None if equity is None else equity - engine.CAPITAL,
                             actual=None if not equity else 100 * invested / equity,
                             pendingCapital=planned,
                             target=None if not equity else 100 * (invested + planned - sale_value) / equity,
                             gaps=outcome['gaps']))
        fills_by_ticker = {}
        for i, order in enumerate(account['orders'], 1):
            order_id = f'paper-{key}-{i}'
            d = by_time[order['submitted']]
            at = datetime.fromisoformat(d['at'])
            history = events[order_id]
            inputs = archived_inputs(get_build(builds, d['run']), order['ticker'], engine.opportunity, at)
            event = history[-1]
            realized = None
            if order['status'] == 'Filled' and order['side'] == 'Sell':
                entry = fills_by_ticker.pop(order['ticker'])
                realized = order['euros'] * (1 - engine.COST) - entry['euros'] * (1 + engine.COST)
            projected = dict(id=order_id, strategy=key, run=d['run'], session=d['session'],
                             model=inputs['scoreVersion'], inputs=inputs, history=history, realized=realized,
                             entryPolicy=order.get('entry_policy'), entryMarket=d.get('market'),
                             budgetPct=12 if order['side'] == 'Buy' else None,
                             executionRun=event['run'] if order['status'] == 'Filled' else None,
                             **select(order, 'submitted ticker side status expires day currency euros reason detail close fx symbol'))
            orders.append(projected)
            if order['status'] == 'Filled' and order['side'] == 'Buy':
                fills_by_ticker[order['ticker']] = projected
        for ticker, holding in account['holdings'].items():
            mark = None if ticker in outcome['gaps'] else holding['local_value'] / holding['fx']
            entry = fills_by_ticker[ticker]
            cost = entry['euros'] * (1 + engine.COST)
            positions.append(dict(ticker=ticker, strategy=key, value=mark,
                                  pnl=None if mark is None else mark - cost,
                                  weight=None if mark is None or not equity else 100 * mark / equity,
                                  dated=holding['day'], fxDated=holding['fx_day'], markRun=latest['run'],
                                  orderId=entry['id'], entry=entry['close'], currency=holding['currency']))

    comparison_issue = None
    twins = []
    try:
        need(same(doc['breakout_comparison'], replay['breakout_comparison'])
             and same(doc['execution_closes'], replay['execution_closes']),
             'Das v1.5/v1.6-Journal weicht von der Nachrechnung aus den archivierten Builds ab.')
        for version, twin in replay['breakout_comparison'].items():
            trades = []
            for o in twin['orders']:
                d = by_time[o['submitted_at']]
                order_id = f'twin-{version}-{o["id"]}'
                history = twin_events[order_id]
                event = history[-1]
                recorded = event['evidence']
                status = {'FILLED': 'Filled', 'PENDING': 'Pending', 'REJECTED': 'Rejected',
                          'CANCELLED': 'Cancelled'}[recorded['status']]
                at = datetime.fromisoformat(d['at'])
                trades.append(dict(id=order_id, strategy=version, run=d['run'], session=d['session'],
                                   model=f'claude-rules-{version}', history=history,
                                   inputs=archived_inputs(get_build(builds, d['run']), o['ticker'], engine.opportunity, at),
                                   submitted=o['submitted_at'], ticker=o['ticker'], side=o['side'], status=status,
                                   executionRun=event['run'] if status == 'Filled' else None,
                                   day=recorded['fill_date'], close=recorded['fill_price'] if status == 'Filled' else None,
                                   euros=recorded['amount'], realized=recorded['realized'],
                                   **select(o, 'shares reason resistance currency')))
            twins.append(dict(version=version, run=latest['run'], orders=trades, **twin['summary']))
    except ERRORS as exc:
        comparison_issue = problem('Exit-Experiment', 'Gepaartes v1.5/v1.6-Journal', exc)
    return dict(accounts=accounts, decisions=decisions, orders=orders, positions=positions,
                twins=twins, ruleCommit=source, initialCapital=engine.CAPITAL, feePct=100 * engine.COST), comparison_issue


def frozen(root, path, builds, evaluator):
    doc = read(path)
    need(doc['schema'] == 'paper-portfolio-v1' and bool(doc['holdings']))
    run = doc['signal_snapshot'].removesuffix('.json')
    build = get_build(builds, run)
    capture = build['record']['_evidence']['captured_at']
    cutoff = datetime.combine(date.fromisoformat(doc['entry_date']), time(8), tzinfo=timezone.utc)
    need(capture == doc['signal_snapshot_captured'] and datetime.fromisoformat(capture) < cutoff,
         'Zeitstempel des eingefrorenen Signals widerspricht dem Archiv.')
    rel = str(path.relative_to(root))
    first = subprocess.check_output(['git','-C',str(root),'log','--diff-filter=A','--format=%H %cI','--',rel], text=True).splitlines()
    need(bool(first), 'Git-Nachweis der Einfrierung fehlt.')
    origin, authored = first[-1].split(' ', 1)
    need(datetime.fromisoformat(authored) < cutoff, 'Erstveröffentlichung der Kohorte liegt nach dem Vorab-Stichtag.')
    initial = json.loads(subprocess.check_output(['git','-C',str(root),'show',f'{origin}:{rel}']))
    need(all(doc.get(k) == initial.get(k) for k in ('entry_date','exit_date','model','holdings','weight_rule','benchmark')),
         'Kohorte, Termin oder Bewertungsvorgabe weicht vom eingefrorenen Stand ab.')
    keys = 'ticker yahoo score label weight_pct currency signal_quote_date'
    prices = {}
    for b in reversed(list(builds.values())):
        for symbol, rows in evaluator.merge_series([b['record']]).items():
            for session, price in rows:
                if session >= doc['entry_date']:
                    prices.setdefault(symbol, {}).setdefault(session, price)
    series = {symbol: sorted(rows.items()) for symbol, rows in prices.items()}
    latest = next(iter(builds.values()))['manifest']
    result = evaluator.evaluate(doc, series, date.fromisoformat(latest['day']))
    fmt = dict(name=doc['name'], run=run, model=doc['model'], capture=capture,
               freezeCommit=origin, freezeAt=authored, freezeUrl=f'{BASE}/blob/{origin}/{rel}',
               entry=doc['entry_date'], exit=doc['exit_date'], evaluationRun=latest['run_id'],
               entryRule=doc['entry_rule'], weightRule=doc['weight_rule'], currencyNote=doc['currency_note'],
               legs=[dict(select(h, keys), **select(r, 'entry_close entry_close_date exit_close exit_close_date return_pct'))
                     for h, r in zip(doc['holdings'], result['holdings'], strict=True)],
               **select(result, 'status valued_to portfolio_return_pct benchmark_return_pct excess_vs_benchmark_pct'))
    priced = [leg['exit_close_date'] for leg in fmt['legs'] if leg['exit_close_date']]
    fmt['valued_to'] = min(priced) if len(priced) == len(fmt['legs']) else None
    fmt['lastPriceDay'] = max(priced, default=None)
    if fmt['status'] == 'FINAL' and (len(priced) < len(fmt['legs']) or min(priced) < fmt['exit']):
        fmt['status'] = 'RUNNING'
    return fmt


def backtest(path):
    b = read(path)
    need(b['schema'] == 'backtest-v3')
    windows = []
    for w in [b, *b['windows']]:
        models = {v: select(w['portfolio'][f'base_v1_{v[-1]}'], 'cagr max_drawdown sharpe trades')
                  for v in ('v1.5', 'v1.6')}
        for values in models.values():
            for n in values.values():
                number(n)
        windows.append(dict(window=w['window'], symbols=number(w['symbols']), models=models,
                            benchmark=select(w['spx'], 'cagr max_drawdown sharpe')))
    return dict(generated=b['generated_at'], schema=b['schema'], windows=windows)


def generate(root, rules=None):
    rules = rules or root
    sys.path.insert(0, str(rules))
    rule_revision = subprocess.check_output(['git', '-C', str(rules), 'rev-parse', 'HEAD'], text=True).strip()
    evidence = importlib.import_module('evidence')
    evaluator = importlib.import_module('paper_portfolio')
    git = ['git', '-C', str(root)]
    rev = subprocess.check_output([*git, 'rev-parse', 'HEAD'], text=True).strip()
    need(not subprocess.check_output([*git, 'status', '--porcelain', '--untracked-files=no'], text=True),
         'InvestorAce-Checkout enthält Änderungen, die nicht zum Archiv-Commit gehören.')
    out = dict(commit=rev, paper=None, frozen=[], backtest=None, issues=[], builds={}, scorecard=[],
               pages=dict(home=PAGES, paper=PAGES+'codex-trading.html', oos=PAGES+'paper-test.html',
                          active=PAGES+'trade.html', backtest=PAGES+'backtest.html'),
               source=f'{BASE}/tree/{rev}')
    builds = {}
    try:
        current = evidence.current_build(root/'history')
        record = current['record']
        macro = record['_evidence']['macro']
        out.update(current=current['manifest']['run_id'], captured=record['_evidence']['captured_at'],
                   macro=select(macro, 'regime regime_input source regime_basis'),
                   scorecard=score_rows(record))
        build = current
        while build is not None:
            m = build['manifest']
            need(m['run_id'] not in builds, 'Zyklus in der Build-Kette.')
            builds[m['run_id']] = build
            previous = m.get('previous_run_id')
            build = evidence._load_build(root/'history', previous) if previous else None
    except ERRORS as exc:
        out['issues'].append(problem('Build', 'Veröffentlichungskette', exc))
    for run,b in builds.items():
        out['builds'][run] = dict(manifest=b['manifest'], captured=b['record']['_evidence']['captured_at'],
                                  url=f'{BASE}/tree/{rev}/history/_builds/{run}')
    history = {}
    for item in reversed(list(builds.values())):
        pulse = ((item['record']['_evidence'].get('macro') or {}).get('pulse') or {})
        for move in pulse.get('moves') or []:
            history.setdefault(move['symbol'], {})[move['date']] = move['close']
    if builds:
        pulse = record['_evidence']['macro'].get('pulse') or {}
        out['market'] = dict(moves=pulse.get('moves') or [], components=pulse.get('components') or {},
                             history={symbol: sorted(rows.items())[-90:] for symbol, rows in history.items()})
    try:
        engine = importlib.import_module('codex_trading')
        out['paper'], comparison_issue = paper(root/'history'/'codex_trading.json', builds, engine, rule_revision)
        if comparison_issue:
            out['issues'].append(comparison_issue)
    except (ImportError, LookupError, *ERRORS) as exc:
        out['issues'].append(problem('Paper-Trading','Codex-Modelljournal',exc))
    active = root/'paper_trades'/'active-account.json'
    try:
        doc = read(active)
        need(doc['schema'] == 'active-account-v1' and isinstance(doc['orders'], list))
        if doc['orders']:
            out['issues'].append(problem('Archiv','Historisches aktives Paper-Konto',
                                         LookupError('Historische Orders enthalten keine unveränderliche Entscheidungs-Build-ID. Konto und Fills sind isoliert.')))
    except ERRORS as exc:
        out['issues'].append(problem('Archiv','Historisches aktives Paper-Konto',exc))
    for path in sorted((root/'paper_trades').glob('*.json')):
        if path == active:
            continue
        try:
            out['frozen'].append(frozen(root, path, builds, evaluator))
        except (LookupError, subprocess.CalledProcessError, *ERRORS) as exc:
            out['issues'].append(problem('Frozen-OOS',path.stem,exc))
    try:
        out['backtest'] = backtest(root/'backtests'/'latest.json')
    except ERRORS as exc:
        out['issues'].append(problem('Backtest','Backtest-Artefakt',exc))
    for entry in out['issues']:
        identity = '\0'.join(entry[k] for k in ('section', 'name', 'kind', 'message'))
        entry['id'] = 'source-' + hashlib.sha256(identity.encode()).hexdigest()[:24]
    return out


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('checkout', type=Path)
    parser.add_argument('--rules', type=Path, help='Use this trusted checkout for offline replay code')
    args = parser.parse_args()
    if args.rules:
        # autoscore imports Yahoo at module load. Archived replay only calls its pure score functions.
        # An unavailable download method must fail instead of fetching revised historical inputs.
        import types
        sys.modules['yfinance'] = types.ModuleType('offline_yahoo_unavailable')
    target = Path(__file__).resolve().parent/'dist'/'snapshot.json'
    result = generate(args.checkout.resolve(), args.rules.resolve() if args.rules else None)
    with NamedTemporaryFile(mode='w', encoding='utf-8', dir=target.parent, delete=False) as f:
        json.dump(result, f, ensure_ascii=False, allow_nan=False, separators=(',',':'))
    os.chmod(f.name, 0o644)
    os.replace(f.name, target)
    print(dict(verified_builds=len(result['builds']), scores=len(result['scorecard']),
               paper=bool(result['paper']), frozen=len(result['frozen']), issues=result['issues']))
