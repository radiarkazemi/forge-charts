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
| `LH_Engine.mqh` | Detector v100 |
| `LH_Liquidity_Hunter.mq5` | Indicator v1.00 |
| `LH_AutoTrade.mq5` | EA v1.00 |
| `../../indicators/LH_Liquidity_Hunter.pine` | TradingView |

## Why these tools

| Tool | Role in LH |
|------|------------|
| **Liquidity** | Where the stop clusters are — the target the market is hunting |
| **CISD** | Confirms delivery flipped after the raid |
| **MSS** | Confirms market structure shifted (reversal after hunt) |
| **BOS** | Optional internal structure break toward the new direction |
| **FVG** | Imbalance left by displacement — clean ENTRY zone |
| **Opposing liq** | Best TP — next pool of stops the market is likely to hunt next |

## Install (MT5)

1. Unzip `LH_Liquidity_Hunter_MT5.zip`
2. `Indicators/LH_Liquidity_Hunter/` ← Engine + Indicator → Compile
3. `Experts/LH_Liquidity_Hunter/` ← Engine + EA → Compile
4. Attach to XAUUSD M1 / M5 / M15 (demo first)
5. EA: AutoTrade ON · Break-even **OFF** · far→market / near→pending

## Pine

Import `indicators/LH_Liquidity_Hunter.pine` on TradingView.

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
