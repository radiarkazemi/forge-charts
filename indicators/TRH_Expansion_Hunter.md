# TRH | Expansion Hunter (Strategy)

## Rules

```
HTF discount (long) / premium (short)
  → liquidity sweep → displacement → quality FVG → retest
  → ENTRY = FVG mid
  → SL = beyond FVG outer + small pad (tight)
  → TP = exact 2R (never < SL distance)
```

## Why trades were all SL (your chart)

| Old bug | Effect on GOLD M1 |
|---------|-------------------|
| SL beyond **full sweep** + `minRisk 1.2 ATR` | Risk **5–7 pts** → TP **10–14 pts** |
| Stop hunts take the wide SL first | **0 TPs** even with correct 1:2 math |

## Current defaults

- SL behind **FVG outer** (sweep SL OFF)
- Max risk **0.85 ATR** — skip fatter setups
- Exact RR **≥ 2.0**
- Longs only HTF **discount** · shorts only **premium**

## Install

Re-paste from the branch raw URL into TradingView Pine Editor → Add to chart as strategy.
