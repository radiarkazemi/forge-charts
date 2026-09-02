# TRH for MetaTrader 5 — Modes A + B (BTB removed)

| File | Role |
|------|------|
| `TRH_Trading_Room_Hunter.mq5` | **Indicator** v2.32 (build 232) |
| `TRH_AutoTrade.mq5` | **EA** v3.37 |
| `TRH_Engine.mqh` | Shared Engine v230 |

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

## Mode B = exact TradingView Pine (v230 / EA v3.37 / Ind build 232)

User TV script is the source of truth. Mode B levels are identical:

```
ENTRY = (gapTop + gapBot) * 0.5          // FVG mid / CE
pad   = atr * (slPadAtr + fvgSlExtraAtr) // 0.02 + 0.20
SL    = sweepDistal ± pad
TP    = entry ± risk * 2.4               // + liquidity TP if enabled
```

### Fresh install (required — old chart instances keep stale levels)
1. **Remove** old TRH indicator + EA from the chart
2. Delete old `.ex5` in `MQL5/Indicators/TRH_Trading_Room_Hunter/` and `MQL5/Experts/TRH_Trading_Room_Hunter/`
3. Copy **all three** files from the zip into those folders
4. Compile Indicator + EA in MetaEditor
5. Re-attach — panel header must say **`TRH v232 · Eng230 · mid-FVG`**
6. EA Comment must say **`TRH EA v3.37 Eng230`**

If the panel still shows ENTRY like `4326.61` without an FVG mid line, you are still on the old build.

## Smart EA fill (v3.37)

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
