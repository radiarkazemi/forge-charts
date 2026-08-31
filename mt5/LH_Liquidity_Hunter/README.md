# LH · Liquidity Hunter

Our own liquidity-first strategy (standalone — **not TRH**).

> Liquidity is the most important parameter. Recognize it correctly and you do not *become* liquidity. The market hunts liquidity — we wait for the hunt, then trade the expansion.

## Model

```
1. Map BSL / SSL     swing highs/lows where stops rest
2. Raid              price takes that liquidity (sweep + close back)
3. CISD              change in state of delivery (close through raid open)
4. MSS / BOS         structure confirms the shift (MSS preferred, BOS optional)
5. FVG               imbalance = entry zone (mid, or CISD if inside FVG)
6. SL / TP           SL beyond raided extreme · TP = opposing liquidity (else RR)
```

| File | Role |
|------|------|
| **`LH_Liquidity_Hunter.pine`** | **TradingView — start here** |
| `LH_Engine.mqh` | MT5 detector v100 |
| `LH_Liquidity_Hunter.mq5` | MT5 Indicator v1.00 |
| `LH_AutoTrade.mq5` | MT5 EA v1.00 |

## Pine (TradingView) — install first

1. Open this zip → open **`LH_Liquidity_Hunter.pine`**
2. TradingView → Pine Editor → paste all → **Add to chart**
3. Use on XAUUSD M1 / M5 / M15
4. Raw link (always latest on this branch):  
   https://raw.githubusercontent.com/radiarkazemi/forge-charts/cursor/liquidity-hunter-992e/indicators/LH_Liquidity_Hunter.pine

## Install (MT5) — later

1. `Indicators/LH_Liquidity_Hunter/` ← Engine + Indicator → Compile  
2. `Experts/LH_Liquidity_Hunter/` ← Engine + EA → Compile  
3. EA: AutoTrade ON · Break-even **OFF** · far→market / near→pending  

## Defaults

| Input | Value |
|-------|-------|
| Require CISD | ON |
| Allow BOS | ON |
| FVG retest | ON |
| Opposing liquidity TP | ON |
| Fallback RR | 3.0 |
| EA break-even | **OFF** |

Do **not** mix `LH_Engine.mqh` with TRH Engine files.
