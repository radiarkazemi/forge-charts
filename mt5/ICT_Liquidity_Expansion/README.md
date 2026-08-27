# ICT Liquidity Expansion (standalone — not TRH)

ICT model for the **blue → red** style move:

1. **Raid** sell-side / buy-side liquidity (sweep swing)
2. **MSS** — market structure shift with displacement
3. **FVG** — fair value gap entry (retest optional)
4. **TP** — opposing liquidity (next swing), else fallback RR

| File | Role |
|------|------|
| `ICT_Engine.mqh` | Detector v100 |
| `ICT_Liquidity_Expansion.mq5` | Indicator v1.00 |
| `ICT_AutoTrade.mq5` | EA v1.00 |

**This is a separate product from TRH.** Do not mix Engine files.

## Install

1. Folder: `MQL5/Indicators/ICT_Liquidity_Expansion/`  
   Copy `ICT_Liquidity_Expansion.mq5` + `ICT_Engine.mqh` → Compile
2. Folder: `MQL5/Experts/ICT_Liquidity_Expansion/`  
   Copy `ICT_AutoTrade.mq5` + `ICT_Engine.mqh` → Compile
3. Attach to XAUUSD M1 / M5 / M15 (demo first)

## Defaults

| Input | Value |
|-------|-------|
| FVG retest | ON |
| Fallback RR | 3.0 |
| Opposing liquidity TP | ON |
| Closed-bar only | yes |
| EA alerts | OFF (indicator owns popups) |
| Risk % | 1.0 |

## Download

- Zip: https://goldanil.ir/ict-mt5/ICT_Liquidity_Expansion_MT5.zip
- Folder: https://goldanil.ir/ict-mt5/
