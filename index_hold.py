"""Claude's entry in the index competition: buy and hold the same five ETFs, all amounts in USD.

Asked for on 22 Nov 2026. A backtest in InvestorAce (index_backtest.py, 3 periods x 20 paired starts) found no
timing rule on these ETFs that beat buy and hold, so the entry is buy and hold: 10,000 USD split equally, whole
shares at the regular open of the first session (23 Nov 2026), the same fills and 0.10% cost per side as the
long/short journal (index_paper.py). Nothing is sold. Cash dividends are credited on their ex-date; splits adjust
the share count. Each run after the close marks the account at that session's close.
"""
import json
import math
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

from index_paper import FEE, FUNDS, NY, bars, fetch, sessions

PATH = Path(__file__).parent / "dist/index-hold.json"
START = "2026-11-23"
CAPITAL = 10000.0


def fresh():
    return dict(model="index-hold-v1", capital=CAPITAL, start=START, bought=None, cash=CAPITAL,
                holdings={}, dividends=[], splits=[], marks=[], as_of=None)


def events(raw, kind):
    """[(ex-date, value)] for 'dividends' (amount) or 'splits' (ratio)."""
    out = []
    for e in (raw.get("events") or {}).get(kind, {}).values():
        day = datetime.fromtimestamp(e["date"], NY).date().isoformat()
        if kind == "dividends":
            out.append((day, float(e["amount"])))
        else:
            out.append((day, float(e["numerator"]) / float(e["denominator"])))
    return sorted(out)


def advance(state, quotes, now, dividends=None, splits=None):
    """Buy once on START, then credit dividends, apply splits and mark at each completed session's close."""
    end, _ = sessions(now)
    day = str(end.date())
    if day < START or (state.get("as_of") or "") >= day:
        return False
    if state["bought"] is None:
        if any(START not in quotes[s] for s in FUNDS):
            raise ValueError("missing opening bar for the first session")
        per_fund = state["capital"] / len(FUNDS)
        for symbol in FUNDS:
            price = quotes[symbol][START][0]
            shares = int(per_fund / (price * (1 + FEE)))
            cost = shares * price * (1 + FEE)
            state["holdings"][symbol] = dict(shares=shares, entry=price, cost=round(cost, 2))
            state["cash"] -= cost
        state["bought"] = START
    for symbol, holding in state["holdings"].items():
        for ex, ratio in (splits or {}).get(symbol, []):
            key = f"{symbol}:{ex}"
            if START < ex <= day and key not in state["splits"]:
                holding["shares"] = int(round(holding["shares"] * ratio))
                state["splits"].append(key)
        for ex, amount in (dividends or {}).get(symbol, []):
            key = f"{symbol}:{ex}"
            if START < ex <= day and key not in {d["key"] for d in state["dividends"]}:
                paid = round(holding["shares"] * amount, 2)
                state["cash"] += paid
                state["dividends"].append(dict(key=key, symbol=symbol, ex_date=ex, per_share=amount, paid=paid))
    closes = {s: quotes[s][day][3] for s in FUNDS if day in quotes[s]}
    if len(closes) != len(FUNDS):
        raise ValueError(f"missing closes for {day}")
    value = state["cash"] + sum(h["shares"] * closes[s] for s, h in state["holdings"].items())
    for s, h in state["holdings"].items():
        h.update(close=closes[s], value=round(h["shares"] * closes[s], 2))
    state["cash"] = round(state["cash"], 2)
    state["marks"].append(dict(session=day, value=round(value, 2)))
    state.update(as_of=day, equity=round(value, 2))
    return True


def main():
    state = json.loads(PATH.read_text()) if PATH.exists() else fresh()
    with ThreadPoolExecutor(max_workers=5) as pool:
        raw_data = dict(zip(FUNDS, pool.map(fetch, FUNDS)))
    quotes = {s: bars(raw, s) for s, raw in raw_data.items()}
    dividends = {s: events(raw, "dividends") for s, raw in raw_data.items()}
    splits = {s: events(raw, "splits") for s, raw in raw_data.items()}
    if advance(state, quotes, datetime.now(timezone.utc), dividends, splits):
        if not all(math.isfinite(m["value"]) for m in state["marks"]):
            raise ValueError("non-finite account value")
        tmp = PATH.with_suffix(".tmp")
        tmp.write_text(json.dumps(state, indent=2, allow_nan=False) + "\n")
        tmp.replace(PATH)
    print(state.get("as_of"), state.get("equity"), state.get("bought"))


if __name__ == "__main__":
    main()
