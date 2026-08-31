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

**Indicator v2.23** · **EA v3.23** · **Engine v223**

## v3.23 fix — missed ENTRY (spread + expired mid)

Problems on GOLD M1 (like the SHORT | SWEEP that hit SL without a real fill):

1. **Spread** — EA locked the setup after one wide-spread tick and never retried  
2. **Expired ENTRY** — Mode A confirmed at **0.7** room depth so mid-ENTRY was already behind price; EA parked a pullback **limit** that rarely filled

Fixes:

- Mode A confirms at **mid (0.5)**; skips if close already past mid toward TP  
- If price is already past ENTRY toward TP → **skip** (no dead pullback limit)  
- Else → **market** now (no hope-pullback waits)  
- Spread fail → **retry** while setup is still fresh (do not lock)  
- Cancel pending if price **runs through** ENTRY without fill  
- Default max spread **100** points + optional ATR spread cap  

## Install on MT5

1. Unzip `TRH_Trading_Room_Hunter_MT5.zip`
2. Copy **Engine + Indicator** into:
   `MQL5/Indicators/TRH_Trading_Room_Hunter/`
3. Copy **Engine + EA** into:
   `MQL5/Experts/TRH_Trading_Room_Hunter/`
4. MetaEditor → open each `.mq5` → **Compile (F7)**  
   (`TRH_Engine.mqh` must sit in the **same folder** as that `.mq5`)
5. Re-attach indicator + EA · Detection Mode = **All** · Algo Trading ON

## Download

- Zip: https://github.com/radiarkazemi/forge-charts/raw/cursor/trh-mt5-abc-992e/mt5/TRH_Trading_Room_Hunter_MT5.zip
- Engine: https://raw.githubusercontent.com/radiarkazemi/forge-charts/cursor/trh-mt5-abc-992e/mt5/TRH_Trading_Room_Hunter/TRH_Engine.mqh
- Indicator: https://raw.githubusercontent.com/radiarkazemi/forge-charts/cursor/trh-mt5-abc-992e/mt5/TRH_Trading_Room_Hunter/TRH_Trading_Room_Hunter.mq5
- EA: https://raw.githubusercontent.com/radiarkazemi/forge-charts/cursor/trh-mt5-abc-992e/mt5/TRH_Trading_Room_Hunter/TRH_AutoTrade.mq5

## Defaults (EA)

| Setting | Value |
|---------|-------|
| Detection Mode | All (A+B+C) |
| Room confirm | mid 0.5 |
| Skip expired ENTRY | yes |
| Max spread | 100 pts |
| Pending expiry | 15 bars |
| Risk | ~1.5% equity |
| RR Mode A/B | 2.4 |
| RR Mode C BTB | 2.0 |
| BE | at 0.5R |

Start on **demo** until you trust fills.
