# Trade Journal Pro (MT5 EA)

Watches your trades live and builds a **professional trading journal** for:

- **Day** — full narrative + per-trade cards  
- **Week** — 7-day rollup  
- **Month** — month-to-date rollup  

## What each trade card includes
- Symbol, side, size, open/close, SL/TP, P/L, R-multiple  
- **Session** (Asia / London / NY)  
- **Chart bias** at entry (EMA20/50 → BULL / BEAR / RANGE)  
- **Structure note** (near swing high/low / mid-range)  
- **What you saw** — auto trigger text from candle character + session + bias + your order **comment**  
- **Why it exited** — TP / SL / MANUAL / STOPOUT with plain-English reason  

## Install
1. Copy `Trade_Journal_Pro.mq5` → `MQL5/Experts/`
2. MetaEditor → **Compile**
3. Attach EA to any chart (needs **Algo Trading** enabled)
4. Allow live trading / automated trading if prompted (EA does **not** open trades; it only journals)

## Where reports are saved
Terminal → **File → Open Data Folder → MQL5 → Files → TradeJournal/**

Examples:
- `2026-09-27.html` — daily journal  
- `week_2026-09-27.html` — weekly rollup  
- `month_2026-09.html` — monthly rollup  
- `trades_master.csv` — master log  
- `2026-09-27.csv` — day CSV  

## Tips
- Put your setup name in the order **comment** (e.g. `TRH-SWEEP`, `OB-RETEST`) — it appears in the journal trigger section.  
- Press **J** on the chart to force-refresh today’s report anytime.  
- Auto report runs near **23:55 broker time** (configurable).  
- Chart markers: blue/orange entry arrows, green/red/gold exit markers.

## Downloads
- EA: https://raw.githubusercontent.com/radiarkazemi/forge-charts/cursor/trade-journal-ea-992e/mt5/Trade_Journal_Pro/Trade_Journal_Pro.mq5  
- Pack: https://raw.githubusercontent.com/radiarkazemi/forge-charts/cursor/trade-journal-ea-992e/packs/Trade_Journal_Pro_Pack.zip  

## Notes
- Does **not** place or manage trades.  
- “What you saw” is reconstructed from chart context + your comment — add richer comments for better journals.  
- Keep the EA running during your session so entry context is captured live.
