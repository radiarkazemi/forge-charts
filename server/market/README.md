# FXPro market feed

Other apps should call this service — not TradingView’s chart socket.

Base URL (default): `http://127.0.0.1:8788`  
CORS is open.

```bash
npm run market:server
```

| Env | Default | Meaning |
| --- | --- | --- |
| `MARKET_HOST` | `127.0.0.1` | Bind (`0.0.0.0` if another machine must connect) |
| `MARKET_PORT` | `8788` | HTTP port |

```bash
curl http://127.0.0.1:8788/health
curl 'http://127.0.0.1:8788/history?symbol=XAUUSD&interval=15&limit=200'
curl 'http://127.0.0.1:8788/quote?symbol=XAUUSD'
```

`interval` is a Forge id (`1`, `5`, `15`, `60`, `240`, `1D`, `1W`, `1M`). Bars use Unix seconds.

Realtime: `GET /stream?symbol=XAUUSD&interval=15` (SSE `hello`, `bar`, `ping`).

Mapped tickers: XAUUSD, XAGUSD, EURUSD, GBPUSD, USDJPY, AUDUSD, USDCHF, USOIL (`FXPRO:XTIUSD`), DJI (`FXPRO:US30`).
