# TRH for MetaTrader 5 — classic SWEEP + Mode B FVG

This is the **MetaTrader 5 version** of classic TRH, plus **Mode B**:
**liquidity sweep → displacement → Fair Value Gap (FVG) → retest → entry**.

| Mode | What it does |
|------|----------------|
| **A — Classic SWEEP** | Same as Pine room mid-entry after base confirm |
| **B — Sweep + Disp + FVG** | Sweep, displacement, FVG, then **retest** before ENTRY |
| **Both** (default) | Runs A+B with shared cooldown (FVG wins if same bar) |

**Indicator v2.21** · **EA v3.21** · **Engine v221**

### Fixes in this build
- **Closed-bar only** — no signal on the forming tip (stops setup wipe ~20s later)
- **Hold active setup** — chart keeps ENTRY/SL/TP while WAIT / IN TRADE
- **Quiet EA alerts** — `Alert on new setup` default **OFF** (indicator owns popups)
- **FVG retest** before entry (default ON)
- **Extra SL pad** beyond sweep (default 0.20 ATR)
- **BE @ 0.5R** (earlier protect)

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

## Install (overwrite ALL three files)

1. **File → Open Data Folder** → `MQL5/Indicators/TRH_Trading_Room_Hunter/`
2. Copy **all three**: `.mq5` indicator + `TRH_Engine.mqh` + (for EA folder) `TRH_AutoTrade.mq5`
3. MetaEditor → Compile each (F7) — Engine must be **same folder** as the `.mq5`
4. Remove old indicator/EA from chart, re-attach
5. Input **Detection Mode** = `Both` (or FVG-only / Classic-only)

EA: same Engine into `MQL5/Experts/TRH_Trading_Room_Hunter/`, compile `TRH_AutoTrade.mq5`, enable Algo Trading.

### Download

- Folder: https://goldanil.ir/trh-mt5/
- Zip: https://goldanil.ir/trh-mt5/TRH_Trading_Room_Hunter_MT5.zip
- Raw (branch): https://raw.githubusercontent.com/radiarkazemi/forge-charts/cursor/trh-fvg-mode-b-992e/mt5/TRH_Trading_Room_Hunter/

## Mode B defaults

| Input | Value |
|-------|-------|
| Min Displacement Body | 0.55 ATR |
| Max Bars For Displacement | 6 |
| Max Bars For FVG | 10 |
| Min FVG Gap | 0.12 ATR |
| Require FVG Retest | true |
| Max Retest Bars | 8 |
| Extra SL Beyond Sweep | 0.20 ATR |
| ENTRY | Mid of FVG (after retest) |
| TP | RR 2.4 (liquidity optional) |
| Break-even | at +0.5R |

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
