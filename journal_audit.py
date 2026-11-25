import json, math, os, sys
from pathlib import Path
from datetime import datetime, timedelta, timezone
from urllib.request import Request, urlopen
import exchange_calendars as xc

desk, source = map(Path, sys.argv[1:])
cal = xc.get_calendar("XNYS")
now = datetime.now(timezone.utc)
due = cal.date_to_session((now - timedelta(hours=30)).date(), direction="previous").date().isoformat()
notes = []

def read(path):
    return json.loads(path.read_text())

def note(evidence, impact, check):
    notes.append(f"[Sicher] {evidence}\n\nAuswirkung: {impact}\n\nPrüfschritt: {check}")

def fresh(path, actual, expected):
    if not actual or actual < expected:
        note(f"{path}: {actual}, erwartet mindestens {expected}.",
             "Aktuellere Marktbewegungen können fehlen.",
             "Quelldatum und letzten vorgesehenen Workflow-Lauf vergleichen.")

def check_amount(label, actual, expected):
    if not math.isclose(actual, expected, abs_tol=0.02, rel_tol=0):
        note(f"{label}: {actual:.2f} ausgewiesen, {expected:.2f} EUR nachgerechnet.",
             "Cash oder Vergleichsrendite kann verfälscht sein.",
             "Positionen mit Stückzahl, Kurs und Rundungsdifferenz in EUR abstimmen.")

def scans():
    scan = read(source / "market-scan/latest.json")
    fresh("trend.json/as_of", read(source / "market-scan/trend.json")["as_of"], due)
    fresh("latest.json/generated_at", scan["generated_at"][:10], (now.date()-timedelta(days=8)).isoformat())
    stale = [p["ticker"] for p in scan["candidates"] if (p.get("price_date") or "") < due]
    if stale:
        note(f"latest.json: {len(stale)} Kurse älter als {due}, darunter {', '.join(stale[:10])}.",
             "Ranking verwendet möglicherweise unterschiedliche Kurstage.",
             "price_date je Symbol, quote_refresh.failures und Handelsaussetzungen prüfen.")

def journal():
    j = read(desk / "dist/index-paper.json")
    fresh("index-paper.json/as_of", j["as_of"], due)
    for row in j["trades"] + j["signals"]:
        session = row["session"]
        if not cal.is_session(session) or datetime.fromisoformat(row["submitted"]) >= cal.session_open(session):
            note(f"{row['symbol']} / {session}: Registrierung {row['submitted']}.",
                 "Simulierte Ausführung zur Eröffnung zeitlich nicht belegbar.",
                 "Registrierung in UTC mit der XNYS-Eröffnung der ETF-Sitzung vergleichen.")

def portfolios():
    paper = read(desk / "dist/paper-round2.json")
    fresh("paper-round2.json/mark", paper["mark"], min(due, paper["end"]))
    a = paper["accounts"]
    check_amount("Startkapital Regel/Score", a["rules"]["capital"], a["score"]["capital"])
    for key, book in a.items():
        def value(field):
            rates = {"EUR": 1, "USD": paper["fx"]}
            return sum(p["shares"] * p[field] * rates[p["currency"]] for p in book["positions"])
        check_amount(key+" investiert", book["invested"], value("entry"))
        check_amount(key+" Cash", book["cash"], book["capital"] - value("entry"))
        check_amount(key+" NAV", book["days"][-1]["nav"], book["cash"] + value("close"))
        if book["net_nav"] is not None:
            s = book["settlement"]
            check_amount(key+" Netto-NAV", book["net_nav"], book["final_nav"] + s["interest_eur"] + s["dividends_eur"] - s["costs_eur"])

def workflow_runs():
    repos = {"InvestorAce-Tradingdesk": ["market", "index-paper", "heat-leaders", "index-hold"],
             "InvestorAce": ["market-scan", "active-round"]}
    for repo, names in repos.items():
        for name in names:
            url = f"https://api.github.com/repos/Usubillaga/{repo}/actions/workflows/{name}.yml/runs?branch=main&event=schedule&per_page=100"
            request = Request(url, headers={"Authorization": "Bearer " + os.environ["GH_TOKEN"]})
            with urlopen(request, timeout=30) as response:
                runs = json.load(response)["workflow_runs"]
            if not runs or runs[0]["created_at"][:10] < due:
                note(f"{repo}/{name}: kein planmäßiger Lauf seit {due}.",
                     "Aktualisierung möglicherweise ausgeblieben.", "Cron, Actions-Verzögerung und Archivstand vergleichen.")
            for run in runs:
                if datetime.fromisoformat(run["created_at"].replace("Z","+00:00")) < now-timedelta(hours=24):
                    break
                if run["conclusion"] in ("failure","timed_out","startup_failure","action_required","cancelled"):
                    note(f"{name}: {run['conclusion']} {run['html_url']}",
                         "Aktualisierung möglicherweise unterbrochen.", "Jobprotokoll und erfolgreichen Ersatzlauf prüfen.")

checks = [scans, journal, portfolios]
if "GH_TOKEN" in os.environ:
    checks.append(workflow_runs)
for check in checks:
    try:
        check()
    except Exception as exc:
        note(f"{check.__name__}: {exc}", "Prüfabdeckung eingeschränkt.", "Quelldaten, Schema und Laufprotokoll prüfen.")
result = "\n\n---\n\n".join(notes) or f"Keine Abweichung festgestellt. Erwartete Mindestsitzung: {due}."
print(result)
if "GITHUB_STEP_SUMMARY" in os.environ:
    with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as summary:
        print(result, file=summary)
sys.exit(bool(notes))