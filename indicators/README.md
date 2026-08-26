# TRH | Trading Room Hunter

Pine Script built from **real XAUUSD samples**:

1. **Tue 25 Aug 2026 04:19 UTC-4 — LONG** (classic selloff sweep)
2. **Wed 26 Aug 2026 ~08:24 UTC-4 — SHORT** (HTF resistance level-reject)

## Sample A — Long (25 Aug)

| Level | Price | Meaning |
|---|---|---|
| SL | **4620.23** | Just under sweep low |
| ENTRY | **4627.84** | Mid of room (sweep low → base high) |
| TP | **4645.99** | ~2.39R / opposing liquidity |

## Sample B — Short (26 Aug) ← new

Multi-TF charts (1m / 5m / 15m / 1h) show the same short:

1. Clear **multi-touch HTF resistance** (purple horizontal)
2. Price **wicks above / tags** the level then rejects
3. **SHORT** with tight SL just above the high
4. ENTRY a few points below the high (mid of a tight room)
5. TP at lower liquidity (~3R on the sample)

The old model sometimes fired a **false LONG** into that resistance (5m panel showed LONG · SL HIT).  
v2 blocks counter-trend longs after a resistance reject and adds a **LEVEL REJECT** path for early shorts.

## Model

### Path 1 — Classic SWEEP (Sample A)
1. Large selloff/rally into a major pivot  
2. Sweep + reclaim close  
3. Base ≥ N bars → room = distal ↔ proximal  
4. ENTRY mid-room · SL distal ± pad · TP 2.4R or opposing pivot  

### Path 2 — LEVEL REJECT (Sample B)
1. Multi-touch HTF level **or** swing high/low rejection  
2. Reject candle closes back through the level  
3. Faster confirm (default 3 bars)  
4. Room stays **tight under/over the level** (clamped) even if price runs  
5. Opposite-direction setups blocked for ~25 bars after a reject  

## Install

1. Remove old TRH from the chart  
2. Paste `TRH_Trading_Room_Hunter.pine` → Add to chart  
3. XAUUSD **1m** (also check 5m/15m for context)  

## Defaults

- Pivot `5` · Context `1.2 ATR` · Base bars `6` · Reject confirm `3`  
- Room width `0.6–3.5 ATR` (reject rooms capped ~2.2 ATR) · R:R **`2.4`**  
- HTF level touches `2` · Counter-trend block **ON** · Only last setup **ON**  

## Alerts

> TradingView chart alerts need a paid plan.  
> Free phone push → [`FREE-ALERTS.md`](./FREE-ALERTS.md) + Android APK release.
