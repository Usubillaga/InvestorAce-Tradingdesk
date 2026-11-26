# InvestorAce Trading Desk

Static dashboard for the InvestorAce Trading Desk trial. It includes a pinned snapshot derived from the public [InvestorAce repository](https://github.com/Usubillaga/InvestorAce). Backtest, Frozen-OOS, paper trading, and live observations have separate views.

The browser stores manually recorded trades and reviews under the dashboard's origin. Exports contain local journal records and Build metadata. The JSON import accepts live records from a Desk export.

## Company research

- 2026-11-26 · [Alantra Partners · ACP settlement, segment results and capital allocation](research/alantra-2026-11-26.md) (ES / EN / DE)

## Run locally

From the repository root, serve the checked-in dashboard over HTTP:

```sh
python -m http.server 8000 --bind 127.0.0.1 --directory dist
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000) in your browser.

## Rebuild the archive snapshot

Use a clean clone of Usubillaga/InvestorAce with enough history to include the first commits for the Frozen-OOS definitions. Pin the desired published source revision, then run:

```sh
python -m pip install -r /absolute/path/to/InvestorAce/requirements.txt
python snapshot.py /absolute/path/to/InvestorAce
node --check dist/app.js
```

The generator resolves the current Build using the repository's existing validator and traverses only its published ancestry. Each ancestor is verified for its report hash, observation hash, model-bundle hash and capture date. The current scorecard is projected directly from the verified observation. The Desk replays the Paper ledger using the publication code from the pinned revision and the verified decision Builds. It compares the recorded decisions, account balances, positions and orders against the replay. Individual orders link to their decision Build and to the replay step that first recorded a fill. A malformed or inconsistent journal produces a review case while the independent sections still render. The paired exit experiment is checked separately.

Frozen portfolio weights and dates are checked against their first Git revision. The first available archived closing price for each session is used for evaluation. The regular model Paper report and the retrospective Backtest are presented separately.

The Desk uses a versioned archive snapshot and has no broker connection. Rebuild `dist/snapshot.json` to incorporate another InvestorAce archive revision.

## Market session

The Market session workflow samples Yahoo Finance on a half-hourly weekday schedule covering European and US regular sessions. GitHub may queue or skip scheduled runs. The site polls the latest published sample once per minute and displays exchange timestamps. Intraday breadth counts covered InvestorAce listings with a fresh regular-session price relative to their previous close. Daily amplitude uses the session high minus low divided by the previous close.

While the Desk is open, its browser-local intraday paper accounts mirror pending orders from the verified daily model. Each starts with EUR 10,000. The simulator requires a subsequent fresh regular-session quote, a valid decision signal, and fresh EUR/USD for USD orders. Simulations use fractional shares, the model order budget and a 0.10% fee. Execution at the observed indicative price omits spread, order-book depth and slippage. The dated daily-close accounts remain the reference experiment. The public feed contains instrument quotes. Browser cash balances, holdings and fills are stored locally. Suspended and closed tabs miss executions.
