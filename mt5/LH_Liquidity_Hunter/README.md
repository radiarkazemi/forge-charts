# LH · Liquidity Hunter

Liquidity-first strategy (standalone — **not TRH**).

## Complete setup path

```
1 RAID (BSL/SSL sweep) → 2 CISD → 3 MSS → 4 FVG → ENTRY / SL / TP
```

## Pine first

File: `LH_Liquidity_Hunter.pine`

1. TradingView → Pine Editor → paste → Add to chart  
2. Raw: https://raw.githubusercontent.com/radiarkazemi/forge-charts/cursor/liquidity-hunter-992e/indicators/LH_Liquidity_Hunter.pine

### What you should see on the last setup
- **1 RAID** + SWEEP labels  
- **2 CISD** level  
- **3 MSS/BOS** level  
- **4 FVG** box  
- **ENTRY / SL / TP** lines + price labels  
- RISK / REWARD boxes  
- Panel: POSITION, STATUS, full path, levels, RESULT

### Tuned defaults (vs the stopped-out short)
| Param | New default | Why |
|-------|-------------|-----|
| Min MSS displacement | 0.55 ATR | Stronger structure shift |
| Min sweep | 0.08 ATR | Clearer liquidity raid |
| SL pad | 0.20 ATR | More room beyond sweep |
| Min risk | 0.35 ATR | Skip tiny fragile stops |
| Allow BOS | OFF | MSS only (less premature) |
| Fallback RR | 2.5 | Slightly tighter target |
| Cooldown | 50 bars | Less noise |

## MT5 (later)

Compile Engine + Indicator + EA from this folder. Do not mix with TRH.
