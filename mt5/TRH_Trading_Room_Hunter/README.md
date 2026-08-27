# TRH for MetaTrader 5 — SWEEP + FVG + Pro BTB

| Mode | What it does |
|------|----------------|
| **A — Classic SWEEP** | Pine room mid-entry after base confirm |
| **B — Sweep + Disp + FVG** | Sweep → displacement → FVG → retest → mid ENTRY |
| **C — Pro BTB** | Break key pivot → return to breakout BE → confirm → ENTRY |
| **Both** | A + B |
| **All** (default) | A + B + C |

**Indicator v2.22** · **EA v3.22** · **Engine v222**

### Mode C — Pro BTB (Poursamadi)
1. Strong **breakout** of a pivot high/low (body + close beyond level)
2. Wait for price to **return to breakeven** (breakout candle close) or broken level
3. Optional **rejection candle** confirm
4. **ENTRY** = breakout candle close (BTB)
5. **SL** behind breakout extreme + pad
6. **TP** at **≥ 2.0R** (default)

Closed-bar only · hold active setup · quiet EA alerts · BE @ 0.5R

## Install (overwrite ALL three files)

1. Copy Engine + Indicator into `MQL5/Indicators/TRH_Trading_Room_Hunter/`
2. Copy Engine + EA into `MQL5/Experts/TRH_Trading_Room_Hunter/`
3. MetaEditor → Compile (F7) — Engine must be **same folder** as each `.mq5`
4. Re-attach; Detection Mode = `All` or `Mode C - Pro BTB`

### Download

- https://goldanil.ir/trh-mt5/TRH_Trading_Room_Hunter_MT5.zip
- Engine: https://raw.githubusercontent.com/radiarkazemi/forge-charts/cursor/trh-pro-btb-992e/mt5/TRH_Trading_Room_Hunter/TRH_Engine.mqh
- Indicator: https://raw.githubusercontent.com/radiarkazemi/forge-charts/cursor/trh-pro-btb-992e/mt5/TRH_Trading_Room_Hunter/TRH_Trading_Room_Hunter.mq5
- EA: https://raw.githubusercontent.com/radiarkazemi/forge-charts/cursor/trh-pro-btb-992e/mt5/TRH_Trading_Room_Hunter/TRH_AutoTrade.mq5

## Mode C defaults

| Input | Value |
|-------|-------|
| Min Break Beyond Pivot | 0.15 ATR |
| Min Breakout Body | 0.35 ATR |
| Max BTB Retest Bars | 12 |
| BTB RR | 2.0 |
| Extra SL | 0.10 ATR |
| Require Confirm Candle | true |

Start on **demo** until you trust Pro BTB fills.
