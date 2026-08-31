# TRH for MetaTrader 5 — one indicator + one AutoTrade (Modes A/B/C)

| File | Role |
|------|------|
| `TRH_Trading_Room_Hunter.mq5` | **Indicator** — draws rooms / ENTRY / SL / TP |
| `TRH_AutoTrade.mq5` | **EA** — auto trades the same engine |
| `TRH_Engine.mqh` | Shared logic (copy next to **both** `.mq5` files) |

| Mode | What it does |
|------|----------------|
| **A — Classic SWEEP** | Liquidity sweep → room mid ENTRY |
| **B — Sweep + Disp + FVG** | Sweep → displacement → FVG → retest → mid ENTRY |
| **C — Pro BTB** | Breakout → return to BE → confirm → ENTRY |
| **All** (default) | A + B + C together |

**Indicator v2.22** · **EA v3.22** · **Engine v222**

## Install on MT5

1. Unzip `TRH_Trading_Room_Hunter_MT5.zip`
2. Copy **Engine + Indicator** into:
   `MQL5/Indicators/TRH_Trading_Room_Hunter/`
3. Copy **Engine + EA** into:
   `MQL5/Experts/TRH_Trading_Room_Hunter/`
4. MetaEditor → open each `.mq5` → **Compile (F7)**  
   (`TRH_Engine.mqh` must sit in the **same folder** as that `.mq5`)
5. Chart → Insert → Indicators → Custom → `TRH_Trading_Room_Hunter`  
   Chart → Navigator → Experts → `TRH_AutoTrade`  
   Enable **Algo Trading**. Detection Mode = **All**.

## Download

- Zip (this branch): build locally from `mt5/TRH_Trading_Room_Hunter_MT5.zip` after packaging
- Mirror: https://goldanil.ir/trh-mt5/TRH_Trading_Room_Hunter_MT5.zip
- Raw Engine: https://raw.githubusercontent.com/radiarkazemi/forge-charts/cursor/trh-mt5-abc-992e/mt5/TRH_Trading_Room_Hunter/TRH_Engine.mqh
- Raw Indicator: https://raw.githubusercontent.com/radiarkazemi/forge-charts/cursor/trh-mt5-abc-992e/mt5/TRH_Trading_Room_Hunter/TRH_Trading_Room_Hunter.mq5
- Raw EA: https://raw.githubusercontent.com/radiarkazemi/forge-charts/cursor/trh-mt5-abc-992e/mt5/TRH_Trading_Room_Hunter/TRH_AutoTrade.mq5

## Defaults (EA)

| Setting | Value |
|---------|-------|
| Detection Mode | All (A+B+C) |
| Risk | ~1.5% equity (dynamic lots) |
| RR Mode A/B | 2.4 |
| RR Mode C BTB | 2.0 |
| BE | at 0.5R |
| Max daily loss | 4% |
| Closed-bar only | yes |

Start on **demo** until you trust fills.
