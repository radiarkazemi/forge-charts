# Forge Charts

Trading terminal built on the **TradingView Charting Library** (Pro), React 19 and **MUI v9**.
The chart, drawing tools, indicators, layouts and templates come from the library; Forge adds
multi-source market data, a watchlist, price alerts and a data window around it.

## Requirements

- Node ≥ 22, [pnpm](https://pnpm.io) (`corepack enable` or `npm i -g pnpm`)
- A licensed copy of the TradingView Charting Library

## Setup

```bash
pnpm install
cp .env.example .env            # optional: enable cp_fetcher, change library path
```

Place your licensed library so that `public/charting_library/charting_library.standalone.js`
exists (the folder is git-ignored — the library must not be committed). The app loads it at
runtime from `VITE_TV_LIBRARY_PATH` (default `/charting_library/`).

```bash
pnpm dev                        # http://127.0.0.1:5173
pnpm build && pnpm preview      # production build
pnpm typecheck && pnpm lint
```

## Architecture

Layered (clean architecture); dependencies only point inward.

```
src/
├─ domain/          Pure types & rules: Bar, SymbolInfo, Interval, Quote, PriceAlert
├─ application/     Ports (MarketDataProvider, SymbolRepository, KeyValueStorage, Notifier),
│                   observable Store, services (MarketData, Quote, Alert, Settings)
├─ infrastructure/  Adapters: Binance · Yahoo · cp_fetcher · Synthetic providers,
│                   localStorage, Web Notifications, TradingView datafeed + save/load adapter
├─ features/        MUI presentation: chart (widget facade), watchlist, alerts, data window, layout
├─ shared/          Theme tokens (shared by MUI + chart overrides), hooks, formatting, UI atoms
└─ app/             Composition root: config, DI container, React providers
```

Key patterns

- **Ports & adapters** — the UI and services depend on interfaces in `application/ports`;
  concrete data sources are swapped in `app/container.ts` only.
- **Chain of responsibility** — `MarketDataService` walks providers in priority order
  (cp_fetcher → Binance → Yahoo → Synthetic) so the chart is never blank; demo data is flagged.
- **Adapter** — `TradingViewDatafeed` maps the app's market-data port onto `IBasicDataFeed`;
  `LocalSaveLoadAdapter` persists layouts, study/drawing/chart templates with no backend.
- **Facade** — `ChartController` is the only object that touches the widget API; components read
  its stores (symbol, interval, crosshair) and call a handful of intent methods.
- **Observer** — a tiny framework-agnostic `Store` bridges services to React via
  `useSyncExternalStore`.

## Market data

| Provider   | Symbols                          | History | Streaming        |
| ---------- | -------------------------------- | ------- | ---------------- |
| Binance    | BTC, ETH, SOL, BNB, XRP          | REST    | WebSocket klines |
| Yahoo      | Stocks, ETFs, indices, FX, gold, crypto fallback | REST | 5 s polling |
| cp_fetcher | Crypto, FX, metals (opt-in)      | REST    | 3 s polling      |
| Synthetic  | Everything else                  | Deterministic noise | 1 s ticks |

All upstreams are reached through the dev-server proxy (`/api/*`, see `vite.config.ts`); mirror
those routes in your production reverse proxy.

Binance answers HTTP 451 from restricted regions; the provider marks itself unavailable for the
session on the first 451 and crypto falls through to Yahoo (`BTC-USD`, `ETH-USD`, …) instead.

## TRH indicator & alerts

The Pine script and the Node alert tooling live in [`indicators/`](./indicators/README.md) and
are independent of the web app (`pnpm trh:alert`, `pnpm trh:server`).
