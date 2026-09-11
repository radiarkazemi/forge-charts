# Forge Charts

Original Super Chart–style trading terminal. **Not** TradingView’s library — our own TypeScript canvas engine, MIT licensed.

The UI follows Super Chart layout: product header, dense chart toolbar, drawing flyouts, widget dock, range presets, replay, and a Pine pane.

Chart prices: **FXPro** (gold/FX CFDs), **Binance** (crypto), and **Forex.com** via the VPS Chart API, with Yahoo as a last fallback. FXPro history and live bars come from the same `FXPRO:XAUUSD` feed Supercharts uses (`npm run market:server`, or auto-started by `npm run dev`).

Live **Latest news** lightning bolts come from TradingView News Flow. The **economic calendar** (NFP, CPI, rate decisions, …) is a separate SQLite collection ingested from Forex Factory. `npm run dev` starts the collector (`server/news`) and draws purple bolts plus red/orange calendar marks on the time scale. Standalone: `npm run news:server`. Other apps: see [`server/news/README.md`](server/news/README.md).

## Run

```bash
npm install
npm run dev
```

Open http://127.0.0.1:5173
