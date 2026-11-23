# Codex · Pánico y euforia

Reproduce the 2006-01-03 to 2026-11-20 simulation from the repository root with
`python research/panic_euphoria/replay.py`. Inputs are frozen to make each return auditable.
`sessions.csv.gz` contains completed US market sessions, the reconstructed InvestorAce thermometer,
and adjusted USD closes (Yahoo Finance, distributions and splits included).
`selections.csv` records the largest holding by published portfolio weight for each of the
44 panic crossings, including portfolio date, filing date and source URL. The forward account
uses the actual after-close InvestorAce thermometer and sponsor-reported holdings.

Buy at the next close after a crossing below 20 while in cash. Hold one third in the
top stock of each of SPY, QQQ and DIA, keeping overlapping names. Never rotate an open
basket. Sell at the next close after heat reaches 80. Deduct 0.1% each side. The paired
benchmark buys one third in each ETF on the same dates. A second control keeps the names,
timing of eligible entries and costs, and exits 63 sessions after entry instead. Each
strategy accepts new signals only while flat. Fractional holdings, distributions reinvested,
USD, zero interest on idle cash, no tax. Daily drawdown includes unrealized losses.
Each subperiod starts with cash. The 20 paired starts are spaced five sessions apart.

Historical weights approximate the indices with ETF portfolios. SEC holdings published before
each historical signal can lag by up to 493 days. Daily weights come from sponsor files
archived by indexkit where available on the final signal. Today's InvestorAce breadth
universe was used to reconstruct historical market heat. This leaves survivorship bias;
CNN Fear & Greed is omitted from the reconstruction. A pending order at the data boundary
is never counted as a trade. A holding still open at a study boundary is marked, never
counted as a completed sale. The 20 starts overlap and do not supply independent evidence.

## Forward ledger

The canonical state is `dist/heat-account.json`. Both websites read the same account.
The initial pre-close order was recorded for 23 November 2026. A later order requires
a verified after-close InvestorAce observation with matching VIX and S&P dates.
Holdings are selected from sponsor daily files in an archive revision known by the signal
close. Incomplete files and weights older than seven calendar days cannot authorize buys.
Fills use the next XNYS close and never precede submission. The scheduled job independently
marks both books with daily adjusted-return relatives. A later missed decision is logged;
fills already registered are settled in order. Daily feeds and the Claude comparison can
be unavailable. The page labels their as-of dates and pending states.

[InvestorAce thermometer](https://github.com/Usubillaga/InvestorAce/blob/5d5741a84fa762cac4b6d265e5ea8b6132660596/market_pulse.py) ·
[ETF portfolio archive](https://github.com/kovagent/indexkit) ·
[SEC fund reports](https://www.sec.gov/edgar/search/) ·
[Claude research](https://github.com/Usubillaga/InvestorAce/pull/219).
