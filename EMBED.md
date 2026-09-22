# Embed API — full chart in your app

Host the **entire Forge Superchart** inside a mobile app WebView or any site via iframe. The chart fills the container, scales to phone sizes, and stays responsive.

## Embed URL (market data)

```
https://goldanil.ir/charts/?embed=1&symbol=BTCUSDT&exchange=BINANCE&interval=15&theme=dark
```

| Param | Default (`embed=1`) | Description |
| --- | --- | --- |
| `embed` | — | `1` enables embed / iframe mode |
| `symbol` / `ticker` | `XAUUSD` | Instrument ticker |
| `exchange` / `ex` | auto | `BINANCE`, `FOREXCOM`, or `CUSTOM` |
| `interval` / `resolution` | `15` | Bar size (`1`, `5`, `15`, `60`, `1D`, …) |
| `theme` | saved / dark | `dark` or `light` |
| `header` | `0` | Product header |
| `toolbar` | `1` | Chart toolbar (symbol, interval, …) |
| `drawings` / `draw` | `0` | Left drawing tools |
| `widgets` / `dock` | `0` | Right widget dock |
| `bottom` | `0` | Pine / bottom dock |
| `mobile` | `0` | Force phone chrome on any width |

## Your own data (chart only)

Skip Binance / Forex feeds and plot **only your OHLC**.

### Option A — JSON URL (`dataUrl`)

```
https://goldanil.ir/charts/?embed=1&source=external&symbol=MYASSET&name=My%20Asset&interval=15&theme=dark&dataUrl=https://goldanil.ir/charts/sample-ohlc.json
```

| Param | Description |
| --- | --- |
| `source=external` | Chart-only mode (also implied if `dataUrl` is set) |
| `dataUrl` / `data` / `ohlc` | HTTPS JSON endpoint. Supports `{symbol}` and `{interval}` placeholders |
| `dataRefresh` | Poll every N seconds (`0` = once) |
| `name` | Display name |
| `precision` | Price decimals |
| `parentOrigin` | Optional: only accept `postMessage` from this origin |

**JSON shapes accepted:**

```json
{
  "symbol": "MYASSET",
  "interval": "15",
  "live": false,
  "bars": [
    { "time": 1710000000, "open": 1, "high": 2, "low": 0.5, "close": 1.5, "volume": 100 }
  ]
}
```

Also accepted: top-level array of bars, `data` / `candles` arrays, compact tuples `[t,o,h,l,c,v]`, and `t/o/h/l/c/v` keys. `time` may be unix seconds, ms, or ISO string.

> Your `dataUrl` must allow browser CORS from the chart origin (or use Option B).

Sample file on the VPS: `https://goldanil.ir/charts/sample-ohlc.json`

### Option B — push bars from your app (`postMessage`)

Best when data lives in your app / WebView (no CORS):

```html
<iframe id="chart" src="https://goldanil.ir/charts/?embed=1&source=external&symbol=MYASSET&interval=15&theme=dark"></iframe>
<script>
  const iframe = document.getElementById("chart");
  window.addEventListener("message", (ev) => {
    if (ev.data?.source !== "forge-charts") return;
    if (ev.data.type === "ready" || ev.data.type === "requestData") {
      iframe.contentWindow.postMessage({
        source: "forge-charts",
        type: "setData",
        symbol: "MYASSET",
        interval: "15",
        live: true,
        bars: [
          { time: 1710000000, open: 10, high: 11, low: 9.5, close: 10.5, volume: 1200 },
          // …more OHLC bars
        ],
      }, "*");
    }
  });

  // Live tick later:
  // iframe.contentWindow.postMessage({ source: "forge-charts", type: "upsertBar", bar: { time, open, high, low, close, volume } }, "*");
</script>
```

**Parent → chart**

| `type` | Purpose |
| --- | --- |
| `setData` | Replace series (`bars` / `data`, optional `symbol`, `interval`, `live`) |
| `setBars` | Replace bars only |
| `upsertBar` | Update / append one live candle |
| `setSymbol` / `setInterval` / `setTheme` | Control chrome |
| `ping` | Health check → `pong` |

**Chart → parent:** `ready`, `requestData`, `dataApplied`, `interval`, `pong`.

## iframe snippet (mobile app size)

```html
<iframe
  src="https://goldanil.ir/charts/?embed=1&symbol=BTCUSDT&exchange=BINANCE&interval=15&theme=dark"
  title="Forge Chart"
  style="width:100%;max-width:430px;height:780px;border:0;border-radius:12px;overflow:hidden;display:block;background:#131722;"
  allow="fullscreen; clipboard-write"
  loading="lazy"
  referrerpolicy="no-referrer-when-downgrade"
></iframe>
```

React Native / Capacitor / Flutter WebView: load the same HTTPS URL; the chart uses `100dvh` and ResizeObserver so it matches the WebView bounds. For custom series in a WebView, prefer **postMessage** (`setData` / `upsertBar`).

## Optional chrome

```
...?embed=1&symbol=EURUSD&exchange=FOREXCOM&interval=60&drawings=1&toolbar=1
```

## Programmatic helper

```ts
import { buildEmbedUrl } from "./embed";

const src = buildEmbedUrl({
  symbol: "MYASSET",
  source: "external",
  interval: "15",
  theme: "dark",
  dataUrl: "https://api.example.com/ohlc/{symbol}.json",
});
```

Prefer **HTTPS** (`https://goldanil.ir/charts/…`) so WebViews and iframes load assets reliably.
