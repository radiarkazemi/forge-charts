# Use the news fetcher from other apps

This service is a small HTTP + SSE server. Other apps should talk to **it**, not to TradingView directly.

Base URL (default): `http://127.0.0.1:8787`  
CORS is open (`Access-Control-Allow-Origin: *`).

## Start it

From the `forge-charts` repo, Node 22+:

```bash
npm run news:server
# same as: node --experimental-sqlite server/news/index.mjs
```

Optional env:

| Env | Default | Meaning |
| --- | --- | --- |
| `NEWS_HOST` | `127.0.0.1` | Bind address (`0.0.0.0` if other machines must reach it) |
| `NEWS_PORT` | `8787` | HTTP port |
| `NEWS_DB_PATH` | `server/news/data/news.sqlite` | SQLite file |
| `NEWS_POLL_MS` | `15000` | Re-fetch hot symbols |
| `NEWS_LANG` | `en` | Headline language |
| `CALENDAR_POLL_MS` | `120000` | Re-fetch Forex Factory calendar |

`symbol` is a Forge ticker (`XAUUSD`, `BTCUSD`, `EURUSD`, `AAPL`, …). Mapped symbols live in `symbols.mjs`. Requesting a ticker also marks it “hot” so it is polled about every 15s.

## REST

```bash
curl http://127.0.0.1:8787/health
curl 'http://127.0.0.1:8787/news?symbol=XAUUSD&limit=50'
curl -g 'http://127.0.0.1:8787/news/DJN_DN20260909001433:0'
curl 'http://127.0.0.1:8787/ingest?symbol=XAUUSD'   # force a TradingView pull
```

`GET /news` response:

```json
{
  "symbol": "XAUUSD",
  "count": 2,
  "items": [
    {
      "id": "DJN_DN20260909001433:0",
      "title": "Gold Rises, With Middle East and Fed Policy in Focus — Market Talk",
      "published": 1788938400,
      "urgency": 2,
      "providerId": "dow-jones",
      "providerName": "Dow Jones Newswires",
      "storyUrl": "https://www.tradingview.com/news/DJN_DN20260909001433:0/",
      "shortDescription": "Gold prices rise as…",
      "relatedSymbols": ["OANDA:XAUUSD"],
      "tickers": ["XAUUSD"]
    }
  ]
}
```

`published` is Unix seconds. Put a lightning mark on a chart at that timestamp. Open `storyUrl` for the article; this API only stores headlines + a short preview.

## Forex Factory calendar (separate collection)

Economic releases (NFP, CPI, PPI, GDP, rate decisions, claims, …) live in the **`calendar` collection**, not `news`. Source is the JSON/CSV Forex Factory publishes from [the calendar page](https://www.forexfactory.com/calendar) (`nfs.faireconomy.media`). The HTML page itself is Cloudflare-protected; do not scrape it.

```bash
curl 'http://127.0.0.1:8787/calendar?symbol=XAUUSD'
curl 'http://127.0.0.1:8787/calendar?impact=high'
curl 'http://127.0.0.1:8787/calendar?family=cpi'
curl 'http://127.0.0.1:8787/calendar?category=labor'
curl 'http://127.0.0.1:8787/calendar/ingest'
```

Omit `limit` to get up to 500 rows (`impact=high` is not capped at 1). Default time window is **now−7d … now+14d** (`from` / `to` Unix seconds override). `impact` is a **minimum**: `high` = red-folder only, `medium` = medium+high, `low` = everything except holidays.

Each row is classified before insert:

| Field | Meaning |
| --- | --- |
| `datetime` / `timeUnix` | Release time (ISO + Unix seconds) |
| `currency` / `countryName` | FF currency (USD, EUR, …) and resolved country (German CPI → Germany) |
| `impact` / `impactRank` | `high` 3, `medium` 2, `low` 1, `holiday` 0 |
| `category` | `labor`, `inflation`, `growth`, `central_bank`, `consumer`, … |
| `eventFamily` | Specific print: `nfp`, `core_cpi`, `cpi`, `interest_rate`, `jobless_claims`, … |
| `forecast` / `previous` / `actual` | Consensus, prior, and print when FF publishes it |
| `status` | `upcoming` / `live` / `released` |
| `relatedTickers` | Forge symbols that should show the event (USD CPI → `XAUUSD`, `USCPI`, FX; ECB rate → `EURUSD` + gold) |
| `url` | Forex Factory event link |

Gold (`XAUUSD`) gets USD market holidays plus high/medium USD events, NFP/CPI/FOMC-style families, and high/medium Eurozone/UK/Japan/China macro (ECB, UK GDP, …).

Realtime: `GET /calendar/stream?symbol=XAUUSD` (SSE events `hello`, `calendar`, `ping`). Polled about every 2 minutes (`CALENDAR_POLL_MS`).

## Realtime (SSE)

```js
const es = new EventSource("http://127.0.0.1:8787/news/stream?symbol=XAUUSD");
es.addEventListener("hello", (e) => {
  const { items } = JSON.parse(e.data); // full current list
});
es.addEventListener("news", (e) => {
  const { added, items } = JSON.parse(e.data); // added = new rows
});
es.addEventListener("ping", () => {}); // keepalive ~25s
```

Python (poll if you do not want SSE):

```python
import requests, time
base = "http://127.0.0.1:8787"
seen = set()
while True:
    data = requests.get(f"{base}/news", params={"symbol": "XAUUSD", "limit": 50}, timeout=10).json()
    for item in data["items"]:
        if item["id"] not in seen:
            seen.add(item["id"])
            print(item["published"], item["title"], item["storyUrl"])
    time.sleep(15)
```

## Embed in Node

```js
import { createNewsService, startNewsServer } from "./server/news/index.mjs";

const http = await startNewsServer({ port: 8787, host: "0.0.0.0" });
// or in-process, no extra port:
const news = createNewsService();
news.start();
const items = news.listNews("XAUUSD", 100);
news.onNews((added) => console.log("new", added.length));
```

Only headlines, timestamps, providers, related symbols, and short previews are stored. Full articles stay on TradingView.
