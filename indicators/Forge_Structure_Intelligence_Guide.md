# Forge Structure Intelligence v1

A configurable Pine Script v6 indicator that recognizes structural setup families, follows multiple candidates through their lifecycle, and compares related zones across five timeframes.

**Status:** implementation preview. The source has undergone local structural checks and reference-model logic tests. It has NOT been compiled or executed in TradingView, and has not been backtested on market data. Compile and replay verification are the next required checks. The website is documentation and source access, not a live TradingView scanner.

## Install in TradingView

1. Open a standard candlestick chart. Start with XAUUSD on the **1-minute chart** so all default scanner timeframes are available.
2. Open Pine Editor, create a new indicator, and replace its contents with the complete downloaded `.pine` file or copied source.
3. Save and choose **Add to chart**. Compilation happens in TradingView; any compiler diagnostics need to be resolved before use.
4. Keep the default settings initially. Allow enough history for major pivots and ATR initialization.
5. For alerts, create an alert on this indicator and select **Any alert() function call**. This includes chart and scanner confirmations with entry reference, stop, and projected target.
6. Recreate the alert after changing code or inputs. TradingView alerts use a saved snapshot of the script/settings.

## What makes this more than a basic break indicator

The engine does not emit an entry on every BOS. A break creates a candidate only if a qualifying candle-defined zone exists. It waits for a later retest, then demands a bullish/bearish candle reaction, an optional micro break, a rule score threshold, and acceptable entry-to-stop geometry. Candidates remain independent: a previous signal does not halt future detection. It maintains up to 12 candidates per timeframe by default.

The default confirmation is a **close beyond the previous candle's high/low after a recent zone touch**, with a directional body and a close back beyond the zone. This is a one-candle micro trigger, not a second pivot-confirmed MSS. The alternative is a directional rejection candle closing beyond the zone.

## Setup families and the original sheets

| Family | Detection rule | Relationship to your drawings |
|---|---|---|
| Reversal | Minor break opposing the previous major break direction | Basic bullish/bearish shift and retest sequences |
| Sweep + reversal | Minor break after a recently reclaimed swing-low/high crossing | Liquidity-led variants, including B2/S5-type sequences |
| Stepped / deep | At least two consecutive higher minor highs or lower minor lows; deep retest is an additional flag | B5/S2-type sequences |
| Continuation | Break without the above classifications | B3/S6-type repeat pullbacks and B4-like recovery structures |
| Nested recovery | Recent opposite minor break followed by current directional break | B6/S3-type structures |

Classification priority: nested → stepped → sweep → reversal → continuation. A valid match gets one family plus explanatory flags. The script recognizes these structural families; it does **not** encode all 15 drawings as exact independent templates. Extra minor swings are tolerated through swing filtering and classification. The longer L1/L2/L3 drawings can produce multiple related candidates rather than one complete sequence label. **There is no standalone CISD detector in v1.** A candle-exact CISD rule and exact template matching require additional specifications and validation.

## Lifecycle

| Stage | Meaning |
|---|---|
| Await retest | A directional break and valid zone have been found. |
| Zone touched | A later candle overlaps the zone. |
| Confirmed | A recent touch plus candle trigger, score, optional outer-break filter, and geometry qualify. |
| Invalid | Before confirmation, price closes through the far zone edge or crosses the swing stop. |
| Expired | A pending candidate exceeds its lifetime, or a confirmed candidate exceeds its tracking lifetime. |
| Target touched / Stop crossed | A later candle crosses the frozen projected price level. These are theoretical price events, not executed trades. |
| Ambiguous bar | A later candle crosses both stop and target. Intrabar order is unknown; the script does not count this as a win. |

A break candle cannot retest its own newly created setup. A confirmation candle is not evaluated retrospectively against its new stop/target: theoretical tracking begins on the next bar. Repeated touches refresh the confirmation window. Expiry is measured in the candidate's own timeframe bars.

## Structure, liquidity, and zones

**Minor pivots:** 3 bars to each side by default. **Major pivots:** 10 bars to each side. These pivot locations become known only after the right-hand confirmation bars. The gray map draws them at their earlier location, but signal labels appear on the actual confirmation candle.

**Swing filtering:** separation must exceed 0.35 ATR by default. This suppresses small moves without requiring an exact number of zigzag vertices. Major direction is the last direction in which price closed beyond a confirmed major pivot. Until that happens, direction is unknown; a reversal can initially be classified as continuation.

**Break:** close beyond a confirmed swing level by default, from the other side on the previous bar. Optional wick mode recognizes wick crossings at the close of that candle. Each pivot level can seed a candidate once. Same-direction candidates sharing the same anchor are deduplicated while live.

**Liquidity reclaim:** price crosses a known low/high by at least 0.05 ATR and closes back beyond it. This remains remembered for 30 bars. It is a price-based proxy; the indicator cannot observe resting stop orders. The memory is not an exact causal proof of which sweep powered a later break.

**FVG:** a three-candle wick gap: bullish `low > high[2]`, bearish `high < low[2]`. Minimum size is 0.08 current ATR. Search is limited to recent gaps formed at or after the anchor. Any subsequent close through the far edge rejects a gap at selection; wick mitigation is allowed. The newest valid gap behind the break price is preferred.

**OB candidate:** if permitted, use the newest opposite-body candle at/after the anchor before the break, with its full high/low range behind price, and without an intervening close through its far edge. This is an explicitly simplified candle-range order-block candidate, not verification of institutional orders. Strict displacement is scored separately rather than mandatory for every OB candidate.

The selected zone is frozen for that candidate. The script does not invent a reaction zone from ATR when neither FVG nor OB qualifies.

## Explainable rule score

| Component | Points |
|---|---:|
| Valid structural break + qualifying zone | 50 |
| Recent reclaimed sweep | +15 |
| Break candle directional body ≥ 0.8 ATR | +15 |
| Close beyond the selected major level | +10 |
| Retest candle confirmation | +10 |

The pending score excludes the final reaction points. At confirmation, the resulting score must reach 65 by default. The maximum is 100. **A score is rule agreement, not probability, confidence calibrated on data, or an expected win rate.** Stepped/nested/deep flags explain classification without adding points. Multi-timeframe association is separate from the score.

## Multi-timeframe behavior

Default scanners: **1m, 5m, 15m, 1h, 4h**. Each scanner runs its own pivots, candidates, zones, and lifecycle. The dashboard displays a fresh confirmation first, otherwise the highest-ranked live candidate per timeframe; if none are live, it can display the latest retained terminal outcome. It is not a list of every stored candidate.

A parent/child association requires a higher timeframe, matching direction, an active parent, parent birth no later than child birth, and overlapping zones or a child entry inside the parent zone. This is **contextual overlap**, not a proof that both are the same setup or independent statistical confluence. Only the selected parent snapshot is checked, so a lower-ranked valid parent can be missed.

Scanners **below the chart timeframe are disabled** to avoid missing lower-timeframe intrabar events. Use the 1m chart for the defaults. v1 does not implement `request.security_lower_tf()` intrabar scanning. Changing the chart timeframe changes what is available.

Every remote tuple field uses the previous source bar with `lookahead_on`. There is no unoffset future higher-timeframe value. Remote results become available on the following source interval and alerts wait for the chart candle to close. The scanner for the chart's own timeframe is consequently one closed bar behind the chart's direct detector; its duplicate alert is suppressed.

Duplicate configured timeframes are deduplicated for alerts. Scanner event IDs prevent repeated alerts while a higher-timeframe value persists. Multiple confirmations in one chart bar are combined into one alert message. When multiple candidates confirm in the same source bar, only the highest-score event receives the detailed annotation/alert; the chart label reports the count. This is deliberate batching, not every candidate receiving an individual alert.

**Alerts require related HTF zone** is optional and off by default. It filters alerts only; chart detections and annotations remain visible. No session filter, daily signal quota, or lockout after a prior trade is imposed.

## Entry reference, stop, and projected target

Entry reference = confirmation candle close. Stop = beyond the anchor swing or far zone edge, whichever is farther, plus 0.15 ATR. Confirmation is rejected if risk is ≤ one tick or exceeds 5 ATR by default.

Target = entry ± risk × selected R, default **3R**. This is a geometric projection; it is not a detected liquidity target, broker order, guaranteed achievable R, or a minimum profit. The script does not account for spread, slippage, fills, fees, or bid/ask execution. There is no strategy backtest or win-rate calculation. Higher-timeframe events remain displayed at source-timeframe reference prices, even if the market has moved before the alert arrives.

## Suggested starting settings

| Goal | Change |
|---|---|
| First review | Keep defaults; standard XAUUSD 1m candles; replay slowly. |
| Less noise | Minor pivots 4–5; minimum swing separation 0.5 ATR; score 75. |
| Earlier structure information | Minor pivots 2; expect more candidates and shorter swing confirmation delay. |
| Stronger outer structure requirement | Enable Require major structure break before entry. |
| Sweep-led variants only | Enable Require a reclaimed liquidity sweep. |
| More selective alerts | Enable related higher-timeframe zone requirement after inspecting its behavior. |
| Zones restricted to explicit gaps | Select FVG only. |

These are configuration examples, not performance-tested settings.

## Resource limits and display

Default capacity is 12 candidates per timeframe, maximum 24. Terminal candidates are reclaimed when capacity is needed. If all slots are live, a new candidate is skipped rather than evicting a live one. Thus detection is bounded by capacity; raise it cautiously if needed. Five requests return 20 fields each (100 total), below Pine's 127 requested-tuple-element limit. Confirmed drawings are bounded by the history setting; older drawings are deleted. The swing map retains 100 segments.

The active chart zone shows only the selected candidate. Historical chart confirmation labels retain their original prices and flags. Gray swing lines can extend to newer same-direction confirmed extremes; they are an evolving structure map, not immutable signals. Higher-timeframe patterns appear in the dashboard and alerts, not full higher-timeframe zigzags drawn on the chart.

## Validation and next iteration

Local checks cover requested tuple offsets/budget, object/candidate bounds, score ranges, long/short projection symmetry, retest-before-confirmation, confirmation-bar exclusion from theoretical outcomes, invalidation precedence, ambiguous stop/target bars, and event-ID deduplication. These checks operate on a reference model and source contracts; they do not execute the Pine engine.

TradingView compilation, historical/realtime agreement, source-timeframe alignment, and replay detection quality remain unverified. For replay QA, log the symbol/feed, date, timeframe, settings, original expected pattern, first available pivot confirmation, detected family, zone, and actual signal bar. Compare at least ten examples per family, including failures and close lookalikes. Keep future candles hidden when judging a candidate.

v1 is rule-based and does not learn from trades, run an AI model, inspect screenshots, or guarantee profitable entries. The next useful upgrade is a labeled replay dataset, precise candle definitions for each desired variant, and a strategy harness for realistic performance evaluation.

## Official references

- [Pine multi-timeframe data and confirmed higher-timeframe requests](https://www.tradingview.com/pine-script-docs/concepts/other-timeframes-and-data/)
- [Pine repainting](https://www.tradingview.com/pine-script-docs/concepts/repainting/)
- [Pine resource limitations](https://www.tradingview.com/pine-script-docs/writing/limitations/)
- [TradingView alerts](https://www.tradingview.com/pine-script-docs/concepts/alerts/)

Version: 1.0 · Created 5 October 2026.
