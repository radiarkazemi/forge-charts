# Apex Brain (MT5)

## Where files go

```
MQL5/
  Indicators/Apex_Brain/
    Apex_Chart.mq5
    Apex_Engine.mqh          ← same folder as chart
  Experts/Apex_Brain/
    Apex_AutoTrade.mq5
    Apex_Engine.mqh          ← copy again beside the EA
  Include/MT5_WatchBridge/   OR Experts/MT5_WatchBridge/
    WatchBridge.mqh
```

**Important:** `Apex_Chart.mq5` must be under **Indicators**, not Experts.

## After updating

1. MetaEditor → compile `Apex_Chart.mq5` (0 errors)
2. Remove old indicator from chart
3. Re-attach **Apex Brain** from Navigator → Indicators
4. You should see:
   - cyan HUD top-left (`APEX · SCOUTING` or a setup)
   - dotted swing high/low lines (always)
   - pocket rectangle + ENTRY/SL/TP when a setup exists

## If chart is still blank

- Wrong folder (Experts instead of Indicators)
- Compile errors (Engine must sit next to Chart)
- Chart has < 80 bars — scroll left / load more history
- Objects hidden: Chart → Objects → show all

## Raw download

https://raw.githubusercontent.com/radiarkazemi/forge-charts/cursor/apex-brain-dashboard-992e/packs/Apex_Complete_Pack.zip
