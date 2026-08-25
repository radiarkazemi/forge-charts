# Forge Charts

Original Super Chart–style trading terminal. **Not** TradingView’s library — our own TypeScript canvas engine, MIT licensed.

The UI follows Super Chart layout: product header, dense chart toolbar, drawing flyouts, widget dock, range presets, replay, and a Pine pane.

## Run

```bash
npm install
npm run dev
```

Open http://127.0.0.1:5173

## Market data

The chart loads **BINANCE** (spot USDT/USDC) and **FOREXCOM** (FX, metals, indices) historical candles plus live prices.

1. If your `cp_fetcher` Chart API is reachable, it is used first (`VITE_CHART_API_URL`, Settings → Chart API server, or the Vite `/cp` proxy via `CHART_API_URL`).
2. Otherwise BINANCE uses `data-api.binance.vision` + `data-stream.binance.vision`, and FOREXCOM uses Yahoo Finance mapped to FOREX.com symbols.
