# TRH for MetaTrader 5 — classic SWEEP + Mode B FVG

This is the **MetaTrader 5 version** of classic TRH, plus **Mode B**:
**liquidity sweep → displacement → Fair Value Gap (FVG)** entry.

| Mode | What it does |
|------|----------------|
| **A — Classic SWEEP** | Same as Pine room mid-entry after base confirm |
| **B — Sweep + Disp + FVG** | Sweep, strong displacement candle, then 3-candle FVG mid as ENTRY |
| **Both** (default) | Runs A+B with shared cooldown (FVG wins if same bar) |

**Indicator v2.20** · **EA v3.20** — filters, dynamic lots, BE@1R unchanged.

## Where are the files?

```
forge-charts/
  mt5/
    TRH_Trading_Room_Hunter/
      TRH_Engine.mqh                  shared detector (A + B)
      TRH_Trading_Room_Hunter.mq5     indicator
      TRH_AutoTrade.mq5               EA
      README.md
```

## Install

1. **File → Open Data Folder** → `MQL5/Indicators/TRH_Trading_Room_Hunter/`
2. Copy `TRH_Trading_Room_Hunter.mq5` + `TRH_Engine.mqh` (same folder)
3. MetaEditor → Compile (F7)
4. Attach to **XAUUSD M1**
5. Input **Detection Mode** = `Both` (or FVG-only / Classic-only)

EA: same files into `MQL5/Experts/`, compile `TRH_AutoTrade.mq5`, enable Algo Trading.

### Raw download links

- EA: https://raw.githubusercontent.com/radiarkazemi/forge-charts/cursor/trh-fvg-mode-b-992e/mt5/TRH_Trading_Room_Hunter/TRH_AutoTrade.mq5
- Indicator: https://raw.githubusercontent.com/radiarkazemi/forge-charts/cursor/trh-fvg-mode-b-992e/mt5/TRH_Trading_Room_Hunter/TRH_Trading_Room_Hunter.mq5
- Engine: https://raw.githubusercontent.com/radiarkazemi/forge-charts/cursor/trh-fvg-mode-b-992e/mt5/TRH_Trading_Room_Hunter/TRH_Engine.mqh
- Zip: https://raw.githubusercontent.com/radiarkazemi/forge-charts/cursor/trh-fvg-mode-b-992e/mt5/TRH_Trading_Room_Hunter_MT5.zip

## Mode B defaults

| Input | Value |
|-------|-------|
| Min Displacement Body | 0.55 ATR |
| Max Bars For Displacement | 6 |
| Max Bars For FVG | 10 |
| Min FVG Gap | 0.12 ATR |
| ENTRY | Mid of FVG |
| SL | Beyond sweep extreme + pad |
| TP | RR 2.4 (liquidity optional) |

## Classic defaults (= Pine)

| Input | Value |
|-------|-------|
| Pivot Period | 5 |
| Min Context ATR | 1.2 |
| Min Sweep ATR | 0.05 |
| Base Confirm Bars | 8 |
| Max Base Bars | 40 |
| Min / Max Room ATR | 0.8 / 3.5 |
| Cooldown | 50 |
| Risk Reward | 2.4 |

Start on **demo** until you trust Mode B fills.
