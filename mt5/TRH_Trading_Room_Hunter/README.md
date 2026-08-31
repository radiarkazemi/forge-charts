# TRH for MetaTrader 5 — Modes A / B / C (named setups)

| File | Role |
|------|------|
| `TRH_Trading_Room_Hunter.mq5` | **Indicator** v2.24 |
| `TRH_AutoTrade.mq5` | **EA** v3.24 |
| `TRH_Engine.mqh` | Shared Engine v224 |

| Mode | Chart name | Logic |
|------|------------|--------|
| **A** | `A · SWEEP` | Classic room mid ENTRY (unchanged) |
| **B** | `B · FVG` | Sweep → disp → FVG → retest (unchanged) |
| **C** | `C · BTB` | Breakout → BE retest — **quality tightened** |
| **All** | default | A + B + C |

## Mode C BTB quality (v224)

Filters the weak M1 shorts (tiny SL / fake confirm):

- Stronger breakout body (0.45 ATR)
- Min confirm body (0.28 ATR)
- Wick must tag BE + close reject
- Min risk 0.50 ATR (no 1.85-pt gold SL noise)
- Skip if already past BE toward TP
- Wait ≥2 bars after breakout before entry

Mode **A** and **B** detection are unchanged.

## Graphics

Each setup tag shows its own mode name + accent color:

- A SWEEP → teal / crimson  
- B FVG → blue / purple  
- C BTB → orange / red  

## Install

1. Unzip `TRH_Trading_Room_Hunter_MT5.zip`
2. `Indicators/TRH_Trading_Room_Hunter/` ← Engine + Indicator  
3. `Experts/TRH_Trading_Room_Hunter/` ← Engine + EA  
4. Compile both `.mq5` · re-attach · Mode = **All**

## Links

- Zip: https://github.com/radiarkazemi/forge-charts/raw/cursor/trh-mt5-abc-992e/mt5/TRH_Trading_Room_Hunter_MT5.zip
- Pine: https://raw.githubusercontent.com/radiarkazemi/forge-charts/cursor/trh-mt5-abc-992e/indicators/TRH_Trading_Room_Hunter.pine
- EA: https://raw.githubusercontent.com/radiarkazemi/forge-charts/cursor/trh-mt5-abc-992e/mt5/TRH_Trading_Room_Hunter/TRH_AutoTrade.mq5
- Indicator: https://raw.githubusercontent.com/radiarkazemi/forge-charts/cursor/trh-mt5-abc-992e/mt5/TRH_Trading_Room_Hunter/TRH_Trading_Room_Hunter.mq5
- Engine: https://raw.githubusercontent.com/radiarkazemi/forge-charts/cursor/trh-mt5-abc-992e/mt5/TRH_Trading_Room_Hunter/TRH_Engine.mqh
