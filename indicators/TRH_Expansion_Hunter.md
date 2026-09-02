# TRH | Expansion Hunter (Strategy)

Pine **strategy** that hunts sharp displacement moves like the Sep 2 XAUUSD squeeze — **long and short**, with explicit **ENTRY / SL / TP**.

## Model

```
HTF bias (discount/premium + 1H FVG/CISD magnet)
    → LTF liquidity sweep
    → Displacement candle
    → Quality FVG (≥1.50pt)
    → Retest mid-FVG
    → ENTRY / SL / TP
```

| Level | Rule |
|-------|------|
| **ENTRY** | FVG midpoint |
| **SL** | Beyond sweep extreme & FVG outer + pad (min risk floor) |
| **TP** | R×R (default 2.4), optionally pulled to HTF FVG/CISD or opposing pivot |

## When to use

- **Long:** HTF discount / CISD reclaim → sweep lows → bullish displacement → FVG retest (Sep 2-style expansion)
- **Short:** HTF premium / into bearish 1H FVG → sweep highs → bearish displacement → FVG retest

## Install

1. TradingView → Pine Editor → paste [`TRH_Expansion_Hunter.pine`](./TRH_Expansion_Hunter.pine)
2. **Add to chart** as a *strategy* (not indicator)
3. Best on **XAUUSD M1 or M5**, HTF default **60**

Raw (this branch):  
https://raw.githubusercontent.com/radiarkazemi/forge-charts/cursor/trh-expansion-hunter-992e/indicators/TRH_Expansion_Hunter.pine

## Suggested defaults (Gold M1/M5)

- HTF filter **ON** · TF `60`
- Min FVG price `1.50` · Min disp `0.55 ATR`
- Require retest **ON** · R:R `2.4` · Min risk `1.20 ATR`
- Use HTF magnet TP **ON**

## Panel

Shows status (`LONG LIVE` / `SHORT LIVE` / `TP HIT` / `SL HIT`), HTF bias, ENTRY, SL, TP, risk/reward.
