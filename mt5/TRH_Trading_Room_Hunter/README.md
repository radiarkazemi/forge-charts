# TRH for MetaTrader 5 — Modes A + B (BTB removed)

| File | Role |
|------|------|
| `TRH_Trading_Room_Hunter.mq5` | **Indicator** v2.29 |
| `TRH_AutoTrade.mq5` | **EA** v3.34 |
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

## Smart EA fill (v3.34)

- **Far from ENTRY** → **market open immediately** (live SL/TP geometry)
- **Near ENTRY** → pending **Stop/Limit @ ENTRY**
- **Session filter OFF** by default (Asian dumps trade)
- **Adopt age 20 bars** (was 8 — gold was aging out)
- Auto-pad SL vs live bid/ask · retry filling modes (IOC/FOK/RETURN)
- Chart Comment shows block reason (`Algo Trading OFF`, spread, etc.)
- Break-even still **OFF** by default

## Break-even (v3.32 — OFF by default)

**Default = OFF.** SL stays at the setup SL until TP or original SL. No “risk-free”.

That early BE @ ~0.5R was moving SL to entry and stopping trades that dip back then run to TP (exactly what you saw on GOLD).

Optional styles if you turn it on later: `EARLY` / `SMART` / `STEP`.  
Input name is `InpSLProtectStyle` (not the old checkbox) so MT5 does not remount saved “true” as EARLY.

## Links

- Zip: https://github.com/radiarkazemi/forge-charts/raw/cursor/trh-mt5-abc-992e/mt5/TRH_Trading_Room_Hunter_MT5.zip
- Pine: https://raw.githubusercontent.com/radiarkazemi/forge-charts/cursor/trh-mt5-abc-992e/indicators/TRH_Trading_Room_Hunter.pine
- EA: https://raw.githubusercontent.com/radiarkazemi/forge-charts/cursor/trh-mt5-abc-992e/mt5/TRH_Trading_Room_Hunter/TRH_AutoTrade.mq5
- Indicator: https://raw.githubusercontent.com/radiarkazemi/forge-charts/cursor/trh-mt5-abc-992e/mt5/TRH_Trading_Room_Hunter/TRH_Trading_Room_Hunter.mq5
