# TRH for MetaTrader 5 — exact classic SWEEP (same as Pine)

This is the **MetaTrader 5 version** of `indicators/TRH_Trading_Room_Hunter.pine`.  
Same math → same **ENTRY / SL / TP** (on the same symbol feed + timeframe).

**v2.00** adds a dashboard panel, live R, TP/SL status, history setups, colors, and toggles for every graphic object.

Pine cannot place broker orders. MT5 can (optional EA, off by default).

## Where are the files?

On GitHub in this repo:

```
forge-charts/
  mt5/
    TRH_Trading_Room_Hunter/          ← this folder
      TRH_Engine.mqh                  shared detector (= Pine logic)
      TRH_Trading_Room_Hunter.mq5     indicator (draw + alert)
      TRH_AutoTrade.mq5               EA (trading OFF until you enable it)
      README.md
```

Download: open the repo → folder `mt5/TRH_Trading_Room_Hunter/` → download those 3 files  
(or download the whole repo ZIP and open that folder).

## Install the indicator (recommended first)

1. Open **MetaTrader 5**
2. Menu: **File → Open Data Folder**
3. Go to: `MQL5` → `Indicators`
4. Create a folder named `TRH_Trading_Room_Hunter`
5. Copy **both** of these into that folder:
   - `TRH_Trading_Room_Hunter.mq5`
   - `TRH_Engine.mqh`  
   (they must stay **next to each other**)
6. In MT5: open **MetaEditor** (F4) → open `TRH_Trading_Room_Hunter.mq5` → press **Compile (F7)**  
   You want `0 error(s)`
7. Back in MT5: **Navigator → Indicators → TRH_Trading_Room_Hunter** → drag onto chart
8. Chart: **XAUUSD**, timeframe **M1** (same as TradingView)
9. Leave all inputs at defaults (they match Pine)

You should see room boxes + **ENTRY / SL / TP** lines and a comment panel with the numbers.

## Match TradingView exactly

| Must be the same | Why |
|------------------|-----|
| Symbol feed | FOREXCOM on TV ≠ your broker’s XAUUSD → prices shift |
| Timeframe | M1 |
| Inputs | defaults already match Pine |

Best check: open **FOREXCOM:XAUUSD** on TradingView and the **same broker symbol** on MT5 only if they are the same feed.  
Morning FOREXCOM sample: LONG ENTRY **4602.87** / SL **4599.63** / TP **4610.64** @ **06:13 UTC**.

## Optional: AutoTrade EA (after levels match)

1. Copy `TRH_AutoTrade.mq5` + `TRH_Engine.mqh` into `MQL5/Experts/TRH_Trading_Room_Hunter/`
2. Compile `TRH_AutoTrade.mq5`
3. Attach to the same chart
4. Keep **`Enable live trading = false`** until several setups match TV
5. Then enable Algo Trading + set `InpAutoTrade = true` on demo first

## Defaults (= Pine)

| Input | Value |
|-------|-------|
| Pivot Period | 5 |
| Min Context ATR | 1.2 |
| Min Sweep ATR | 0.05 |
| Base Confirm Bars | 8 |
| Max Base Bars | 40 |
| Min / Max Room ATR | 0.8 / 3.5 |
| Cooldown | 50 |
| SL Pad ATR | 0.02 |
| Risk Reward | 2.4 |

## New display options (v2)

| Option | What it does |
|--------|----------------|
| Info Panel | Dashboard with ENTRY/SL/TP, status, **live R** |
| Panel Corner | Top-left or top-right |
| Only Last / History | One setup or last N setups |
| Extend To Now | Stretch boxes to the current bar |
| Room / TP / SL zones | Toggle each shade box |
| HLines / trend levels | Full-width lines and/or window-only lines |
| Arrow + mid-room dot | Confirm markers |
| Distal / Proximal labels | Optional room edges |
| Colors | Long/short/TP/SL/entry/panel |
| Alerts | Popup, sound, MetaQuotes push, TP/SL hit |

Detection inputs stay identical to Pine — only the **look** and **alerts** are expanded.

## Troubleshooting

- **Compile error / missing include**: `TRH_Engine.mqh` must be in the **same folder** as the `.mq5`
- **No setups**: load more history (right‑click chart → Refresh); need ~120+ M1 bars
- **Numbers differ from TV**: different broker feed — geometry should still look the same on *that* feed
- **Chrome / phone alerts**: those use VPS FOREXCOM Mongo; MT5 uses your broker chart
