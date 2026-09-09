# TradingView lightning news

Standalone collector for the **Latest news** bolts Supercharts draws on the time scale.

TradingView serves those from the public News Flow / headlines APIs (the FXPRO XAUUSD URL is valid; OANDA/FX_IDC aliases return the same gold feed):

- `https://news-mediator.tradingview.com/public/news-flow/v2/news?filter=lang:en&filter=symbol:OANDA:XAUUSD&client=web&user_prostatus=non_pro`
- `https://news-headlines.tradingview.com/v2/headlines?client=web&lang=en&symbol=OANDA:XAUUSD`
- Story preview: `https://news-headlines.tradingview.com/v2/story?id=...&lang=en`

There is no public news WebSocket. This process polls those endpoints, stores headlines in SQLite, and pushes new rows over SSE.

## Run

```bash
node --experimental-sqlite server/news/index.mjs
```

`npm run dev` auto-starts this on `127.0.0.1:8787` and proxies `/news-api`.

| Env | Default | Meaning |
| --- | --- | --- |
| `NEWS_PORT` | `8787` | HTTP port |
| `NEWS_DB_PATH` | `server/news/data/news.sqlite` | SQLite file |
| `NEWS_POLL_MS` | `15000` | Hot-symbol poll |
| `NEWS_SWEEP_MS` | `300000` | Full-universe sweep |
| `NEWS_LANG` | `en` | News language |

## API

- `GET /health`
- `GET /news?symbol=XAUUSD&limit=200`
- `GET /news/stream?symbol=XAUUSD` (SSE: `hello`, `news`, `ping`)
- `GET /news/:id`
- `GET /ingest?symbol=XAUUSD` force a TradingView pull

Only headlines, timestamps, providers, related symbols, and short previews are stored. Full articles stay on TradingView (`storyUrl`).
