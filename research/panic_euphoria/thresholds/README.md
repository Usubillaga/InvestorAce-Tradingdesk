# Historical threshold comparison

Regenerate the Spanish, English and German pink pages from the repository root with:

```sh
python3 research/panic_euphoria/thresholds/build.py
```

The public event file is `dist/heat-comparison-events.csv`. It is a dated extract from the independent 23 November 2026 close study, distributed as `InvestorAce_Umbrales_10_20_Python_Datos.zip`. Its source is `output/episodes.csv.gz`, filtered to `family=independent` and `period=42m_euphoria`. It retains the historical mix across levels 10–20 and the reference baskets at 17 and 20. Returns and drawdowns are fractions; the event file preserves unrounded inputs for aggregation. Phase IDs align threshold-specific purchases with the original below-20 panic phase. An open event has a mark in the end column. The RSP case before inception has status `no_price`; the benchmark dates on that row do not represent a filled RSP trade.

The historical date rule uses the next session's close after a panic close, then the first close following a reading of at least 80 after 42 calendar months. Each basket leg pays 0.1% per side. The independent index-price comparator includes the same hypothetical costs. The historical equal-weight sleeve buys then-observable members once, and carries their last available quote. Traded RSP follows the fund's own rebalancing. Top 10 uses the PR's market-cap / dollar-volume approximation, with observations for share counts cut off on the signal day. The 2001/2002 results are especially sensitive to missing delistings. The acquisition sources are the Yahoo chart and fundamentals time-series endpoints and the [pinned S&P membership history](https://github.com/fja05680/sp500/tree/a2430f2af0c79ddf0748e91de11bdeb1616ab5a7).

The separate PR reference is [InvestorAce #230 at 36d35ba](https://github.com/Usubillaga/InvestorAce/blob/36d35ba5b180f01e93946d42b5ee13a2bc5c5660/backtests/panic_history.json). Its long-exit summary includes the open mark, uses 882 sessions and compares to the gross S&P price index. The forward protocol on the pages describes proposed pre-close confirmation for two mixed-basket paper accounts. The existing journal tracks a different strategy.
