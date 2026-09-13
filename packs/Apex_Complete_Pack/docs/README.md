# Apex Brain — Complete Pack

Realtime MetaTrader 5 trading brain + web cockpit.

**Thesis:** `RAID → SHIFT → POCKET → CONFIRM → STRIKE`  
**Geometry:** ENTRY = pocket proximal · SL = distal · **TP always 1:3 R:R**  
**Money:** risk-% of equity per strike · daily loss lock · break-even at +1R

This is **not** a TradingView indicator. It is MQL5 + a local Node dashboard.

---

## What it thinks

1. **RAID** — swing liquidity sweep (wick beyond swing, close reclaim)
2. **SHIFT** — displacement / market structure break after the raid
3. **POCKET** — origin opposing-candle zone (supply/demand)
4. **CONFIRM** — score quality (zone ATR fit, TP runway clear, freshness, displacement)
5. **ARMED / STRIKE** — score ≥ threshold → wait for price to touch ENTRY → market order with frozen 1:3 TP

## Install (MT5)

1. Copy `MT5/Apex_Brain/` into `MQL5/Experts/Apex_Brain/` (or Indicators for the chart file).
2. Copy `../MT5_WatchBridge/WatchBridge.mqh` beside it as `MQL5/Experts/MT5_WatchBridge/WatchBridge.mqh`  
   (paths in `#include` expect `../MT5_WatchBridge/WatchBridge.mqh` from the EA folder).
3. Compile:
   - `Apex_AutoTrade.mq5` (Expert)
   - `Apex_Chart.mq5` (Indicator)
4. Attach **Apex_AutoTrade** to a chart (suggest M5).
5. Enable **WebRequest** for `http://127.0.0.1:8787` in  
   Tools → Options → Expert Advisors → Allow WebRequest.

## Web dashboard

From repo root:

```bash
npm run apex:watch
```

- All models: http://127.0.0.1:8787/
- **Apex cockpit:** http://127.0.0.1:8787/apex.html

Events flow: EA → WatchBridge (HTTP + Common/Files JSONL) → `mt5-watch/server.mjs` → SSE UI.

## Inputs (key)

| Input | Default | Role |
|------|---------|------|
| Risk % | 0.75 | Equity risk per strike |
| R:R | 3.0 | Fixed reward multiple |
| Min score | 70 | Arm threshold |
| Max daily loss % | 3.0 | Lock new entries for the day |
| Move BE at 1R | true | Protect winners |

## Files

```
MT5/Apex_Brain/
  Apex_Engine.mqh      — pattern brain
  Apex_AutoTrade.mq5   — execution + risk
  Apex_Chart.mq5       — chart zones / levels
WebDashboard/          — mirror of mt5-watch Apex UI
docs/README.md         — this file
```

## Disclaimer

Automated trading loses money. Demo-test thoroughly. Past pattern language (ICT-style) does not guarantee future results.
