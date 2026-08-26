# Forge Charts — live feed checklist

Public chart: **http://185.222.163.116/charts/**

## Stack URLs

| What | URL |
|------|-----|
| Chart UI | http://185.222.163.116/charts/ |
| BTC (default) | http://185.222.163.116/charts/?symbol=BTCUSDT&exchange=BINANCE |
| EURUSD | http://185.222.163.116/charts/?symbol=EURUSD&exchange=FOREXCOM |
| XAUUSD | http://185.222.163.116/charts/?symbol=XAUUSD&exchange=FOREXCOM |
| Compact history | http://185.222.163.116/crypto-chart/history?symbol=btcusdt&timeframe=1m&limit=350&group=15 |
| Health | http://185.222.163.116/crypto-chart/health |
| REST | http://185.222.163.116/crypto-api/health/ |
| WebSocket | `ws://185.222.163.116/crypto-ws` |

## Test plan

- [x] Local VPS: compact history cold/cached timing
- [x] Health + WS subscribe still work
- [x] Open `/charts/`, confirm candles paint quickly with status `BINANCE · live chart-api`
- [x] EURUSD / XAUUSD FOREXCOM history via deep links

## PR

https://github.com/radiarkazemi/forge-charts/pull/1
