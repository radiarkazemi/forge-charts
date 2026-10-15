# Forge AutoBots — TRH + ICT + CRT on ONE chart

**Why:** MetaTrader 5 allows **only one Expert Advisor per chart**.  
If you attach TRH / ICT / CRT AutoTrade separately on the same gold chart, only one runs.

**Fix:** use this single EA — it runs all 3 engines every bar with separate magics.

## Install

1. Copy folder `mt5/Forge_AutoBots/` → `MQL5/Experts/Forge_AutoBots/`
2. MetaEditor → open `Forge_AutoBots.mq5` → Compile (F7)  
   (all `*_Engine.mqh` + `WatchBridge.mqh` must stay in the **same folder**)
3. **Remove** the three separate AutoTrade EAs from the chart (or use other charts)
4. Attach **Forge_AutoBots** to XAUUSD M1 (or M5)
5. Inputs:
   - `Run TRH / ICT / CRT` = all **true**
   - `Allow TRH+ICT+CRT open together` = **true**
   - Magics stay unique: `260825 / 270827 / 280827`
6. Allow WebRequest `http://127.0.0.1:8787` if using MT5 Watch

## Chart comment

Shows all three lines live, e.g.:

```
Forge AutoBots | XAUUSD PERIOD_M1 | day 0
TRH scanning | orders 0
ICT LONG E4601.20 | orders 0
CRT scanning | orders 0
```

## Alternative (3 charts)

You can still run the three separate AutoTrade EAs — but each needs **its own chart window** (duplicate gold chart ×3).
