# LH · Liquidity Hunter for MetaTrader 5

Exact Pine parity of `indicators/LH_Liquidity_Hunter.pine`.

## Model

```
1 RAID (SSL/BSL sweep) → 2 CISD → 3 MSS → 4 FVG → ENTRY / SL / TP
```

| Level | Rule (exact Pine) |
|-------|-------------------|
| **ENTRY** | FVG mid (or CISD if CISD sits inside FVG) |
| **SL** | Sweep extreme ± `0.20 ATR` (min risk `0.35 ATR`) |
| **TP** | Fallback RR `2.5`, opposing liquidity, min `1.5R` |

## Files

| File | Role |
|------|------|
| `LH_Engine.mqh` | Shared engine **v120** |
| `LH_Liquidity_Hunter.mq5` | Indicator **v1.20** |
| `LH_AutoTrade.mq5` | EA **v1.20** |
| `LH_Liquidity_Hunter.pine` | Pine source of truth (copy) |

## Defaults (must match Pine)

- Min sweep `0.08` · Min MSS `0.55` · Min FVG `0.12`
- Max bars: CISD `6` · MSS `10` · FVG `8` · Retest `8`
- Require CISD **ON** · Allow BOS **OFF** (MSS only)
- Cooldown `50` · SL pad `0.20` · Min risk `0.35` · RR `2.5`

## Install

1. Copy the three `.mqh`/`.mq5` files into one MT5 folder
2. Compile **indicator** and **EA** (F7)
3. Attach indicator — panel must say **`LH · Liquidity Hunter  v120`**
4. Attach EA with Algo Trading ON if you want auto orders

Zip: `mt5/LH_Liquidity_Hunter_MT5.zip`
