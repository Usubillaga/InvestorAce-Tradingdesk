"""Forward-only US ETF paper day trades, all amounts in USD."""
import json
import math
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

import exchange_calendars as xc

FUNDS = {"SPY": "S&P 500", "QQQ": "Nasdaq-100", "DAX": "DAX", "DIA": "Dow Jones Industrial Average", "IWM": "Russell 2000"}
CAL = xc.get_calendar("XNYS")
NY = ZoneInfo("America/New_York")
PATH = Path(__file__).parent / "dist/index-paper.json"
FEE = 0.001  # Slippage and commissions together, per side.


def fetch(symbol):
    for host in ("query1", "query2"):
        url = f"https://{host}.finance.yahoo.com/v8/finance/chart/{symbol}?range=2y&interval=1d&events=div%2Csplits"
        try:
            with urlopen(Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=20) as response:
                return json.load(response)["chart"]["result"][0]
        except (OSError, KeyError, TypeError, IndexError, ValueError):
            if host == "query2":
                raise


def sessions(now):
    today = now.astimezone(NY).date().isoformat()
    end = CAL.date_to_session(today, direction="previous")
    if CAL.session_close(end).timestamp() + 900 > now.timestamp():
        end = CAL.previous_session(end)
    return end, CAL.next_session(end)


def bars(raw, symbol):
    meta = raw["meta"]
    if (meta["symbol"], meta["currency"], meta["instrumentType"]) != (symbol, "USD", "ETF"):
        raise ValueError(f"{symbol}: unexpected instrument")
    series = raw["indicators"]["quote"][0]
    result = {}
    for i, t in enumerate(raw["timestamp"]):
        day = datetime.fromtimestamp(t, NY).date().isoformat()
        o, h, l, c = (series[k][i] for k in ("open", "high", "low", "close"))
        if all(isinstance(v, (int, float)) and math.isfinite(v) and v > 0 for v in (o,h,l,c)) and l <= min(o,c) <= max(o,c) <= h:
            result[day] = (o,h,l,c)
    return result


def signal(history):
    closes = [bar[3] for bar in history]
    avg = mean(closes[-20:])
    direction = "FLAT"
    if closes[-1] > avg and closes[-1] > closes[-6]:
        direction = "LONG"
    if closes[-1] < avg and closes[-1] < closes[-6]:
        direction = "SHORT"
    ranges = [max(h-l, abs(h-prev[3]), abs(l-prev[3]))
              for prev, (_,h,l,_) in zip(history[-15:-1], history[-14:])]
    return direction, 2 * mean(ranges)


def settle(order, bar):
    entry, high, low, close = bar
    side = 1 if order["side"] == "LONG" else -1
    distance = order["stop_distance"]
    size = int(min(order["budget"]/entry, order["risk"]/distance))
    if size == 0:
        return {**order, "status": "SIZE_ZERO", "shares": 0, "net": 0}
    stop = entry - side * distance
    hit = low <= stop if side == 1 else high >= stop
    exit_price = stop if hit else close
    costs = size * (entry + exit_price) * FEE
    return {**order, "status": "STOP" if hit else "CLOSE", "entry": entry, "stop": stop,
            "exit": exit_price, "shares": size, "notional": round(size * entry, 2),
            "costs": round(costs, 2), "net": round(size * side * (exit_price-entry)-costs, 2)}


def advance(state, quotes, now, splits=None):
    end, target = sessions(now)
    day, next_day = str(end.date()), str(target.date())
    if state.get("as_of", "") >= day:
        return False
    calendar_days = [str(d.date()) for d in CAL.sessions_window(end, -20)]
    history = {s: [quotes[s][d] for d in calendar_days] for s in FUNDS}
    completed = []
    for order in state["signals"]:
        if order["side"] != "FLAT":
            symbol, session = order["symbol"], order["session"]
            if any(session <= d <= day for d in (splits or {}).get(symbol, [])):
                completed.append({**order, "status": "SPLIT_REVIEW", "shares": 0, "net": 0})
            else:
                completed.append(settle(order, quotes[symbol][session]))
    equity = round(state["equity"] + sum(r["net"] for r in completed), 2)
    signals = []
    if now.timestamp() < CAL.session_open(target).timestamp():
        for symbol in FUNDS:
            side, distance = signal(history[symbol])
            if distance <= 0:
                raise ValueError(f"{symbol}: invalid ATR")
            signals.append({"session": next_day, "submitted": now.isoformat(), "symbol": symbol,
                            "index": FUNDS[symbol], "side": side, "reference": history[symbol][-1][3],
                            "stop_distance": distance, "budget": round(max(0,equity)*0.15, 2),
                            "risk": round(max(0,equity)*0.005, 2)})
    state["trades"].extend(completed)
    state.update(as_of=day, equity=equity, signals=signals, target=next_day)
    return True


def main():
    state = json.loads(PATH.read_text()) if PATH.exists() else dict(model="index-day-v1", equity=10000, signals=[], trades=[])
    with ThreadPoolExecutor(max_workers=5) as pool:
        raw_data = dict(zip(FUNDS, pool.map(fetch, FUNDS)))
    quotes = {s: bars(raw, s) for s, raw in raw_data.items()}
    splits = {s: [datetime.fromtimestamp(event["date"], NY).date().isoformat()
                  for event in raw.get("events", {}).get("splits", {}).values()]
              for s, raw in raw_data.items()}
    if advance(state, quotes, datetime.now(timezone.utc), splits):
        tmp = PATH.with_suffix(".tmp")
        tmp.write_text(json.dumps(state, indent=2, allow_nan=False) + "\n")
        tmp.replace(PATH)
    print(state["as_of"], state["equity"], [(r["symbol"],r["side"]) for r in state["signals"]])


if __name__ == "__main__":
    main()
