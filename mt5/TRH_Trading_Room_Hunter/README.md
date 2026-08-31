# TRH for MetaTrader 5 — Modes A + B (BTB removed)

| File | Role |
|------|------|
| `TRH_Trading_Room_Hunter.mq5` | **Indicator** v2.29 |
| `TRH_AutoTrade.mq5` | **EA** v3.31 |
| `TRH_Engine.mqh` | Shared Engine v228 |

| Mode | Chart name | Live? |
|------|------------|--------|
| **A** | `A · SWEEP` | **Yes** — main classic room |
| **B** | `B · FVG` | **Yes** — sweep + disp + FVG |
| **C** | `C · BTB` | **Removed** from live model |

**Default Detection Mode = `A + B` (Both)** on Indicator and AutoTrade.

## Why Pine found a SWEEP MT5 missed (v228)

Pine `ta.atr(14)` is **Wilder RMA**. Old MT5 used SMA of the last 14 TRs — after a big selloff SMA ATR spikes and `minRoom` fails, so Mode A never confirms. Engine now matches Pine ATR.


Priority when both fire: **A > B**.

## Install

1. Unzip `TRH_Trading_Room_Hunter_MT5.zip`
2. `Indicators/TRH_Trading_Room_Hunter/` ← Engine + Indicator  
3. `Experts/TRH_Trading_Room_Hunter/` ← Engine + EA  
4. Compile both `.mq5` · re-attach  
5. Detection Mode = **A + B (Both)** · AutoTrade ON · Algo Trading ON  

## Live position sync (v2.26+)

Same-account multi-PC: panel shows `LIVE LONG/SHORT` from the open broker position.

## Smart EA fill (v3.27+)

Active setup manager · BuyStop/SellStop before ENTRY · Limit pullback · market on touch.

## Smart break-even (v3.31+)

Early “risk-free @ 0.5R” is **off by default** — it killed setups that dip near SL then run to TP.

Default **BE-SMART**:
- Mode A·SWEEP → full BE ~**1.5R** (1.20 + 0.30 extra)
- Mode B·FVG → full BE ~**1.0R**
- Needs a **closed bar** at the trigger (wicks alone do not move SL)
- Min **3 bars** open before any BE
- Styles: `OFF` / `EARLY` (old 0.5R) / `SMART` / `STEP` (cut risk first, full BE later)

## Links

- Zip: https://github.com/radiarkazemi/forge-charts/raw/cursor/trh-mt5-abc-992e/mt5/TRH_Trading_Room_Hunter_MT5.zip
- Pine: https://raw.githubusercontent.com/radiarkazemi/forge-charts/cursor/trh-mt5-abc-992e/indicators/TRH_Trading_Room_Hunter.pine
- EA: https://raw.githubusercontent.com/radiarkazemi/forge-charts/cursor/trh-mt5-abc-992e/mt5/TRH_Trading_Room_Hunter/TRH_AutoTrade.mq5
- Indicator: https://raw.githubusercontent.com/radiarkazemi/forge-charts/cursor/trh-mt5-abc-992e/mt5/TRH_Trading_Room_Hunter/TRH_Trading_Room_Hunter.mq5
