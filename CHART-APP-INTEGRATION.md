# Forge Chart — App Integration Guide

Drop the full Forge chart into a mobile/web app via **iframe** or **WebView**.

**Base URL:** `https://goldanil.ir/charts/`

---

## 1. Quick start (market data)

```html
<iframe
  src="https://goldanil.ir/charts/?embed=1&symbol=BTCUSDT&exchange=BINANCE&interval=15&theme=dark"
  title="Forge Chart"
  style="width:100%;height:100%;border:0;display:block;background:#131722"
  allow="fullscreen; clipboard-write"
></iframe>
```

**Mobile / React Native / Flutter / Capacitor:** load the same HTTPS URL in a WebView. Prefer a full-height container; the chart fills `100dvh`.

---

## 2. URL parameters

| Param | Example | Notes |
| --- | --- | --- |
| `embed` | `1` | **Required** for in-app chrome (hides product header / side docks) |
| `symbol` | `BTCUSDT` | Ticker |
| `exchange` | `BINANCE` \| `FOREXCOM` \| `CUSTOM` | Market exchange, or `CUSTOM` for your data |
| `interval` | `1` `5` `15` `30` `60` `240` `1D` `1W` `1M` | Bar size |
| `theme` | `dark` \| `light` | Chart theme |
| `toolbar` | `1` (default) / `0` | Top chart toolbar |
| `drawings` | `0` (default) / `1` | Left drawing tools |
| `widgets` | `0` (default) / `1` | Right widget dock |
| `header` | `0` (default) / `1` | Product header |
| `bottom` | `0` (default) / `1` | Bottom Pine dock |
| `mobile` | `1` | Force phone layout on any width |
| `source` | `external` | **Your OHLC only** (no Binance/Forex) |
| `dataUrl` | `https://api…/ohlc.json` | JSON candles for `source=external` |
| `dataRefresh` | `30` | Poll `dataUrl` every N seconds |
| `name` | `My Asset` | Display name (external) |
| `precision` | `4` | Price decimals (external) |

Example with drawings enabled:

```
https://goldanil.ir/charts/?embed=1&symbol=EURUSD&exchange=FOREXCOM&interval=60&drawings=1
```

---

## 3. Your own data (chart only)

Use this when the app already has OHLC and should **not** use Binance/Forex.

### Option A — JSON URL

```
https://goldanil.ir/charts/?embed=1&source=external&symbol=MYASSET&interval=15&theme=dark&dataUrl=https://YOUR-API/ohlc.json
```

`dataUrl` may include `{symbol}` and `{interval}` placeholders.

**Accepted JSON:**

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

Also accepted: a bare array of bars, `data` / `candles`, compact `[t,o,h,l,c,v]`, or `t/o/h/l/c/v` keys.  
`time` = unix **seconds**, ms, or ISO string.

> `dataUrl` must allow **CORS** from `https://goldanil.ir`. If it can’t, use Option B.

**Sample:** `https://goldanil.ir/charts/sample-ohlc.json`

### Option B — `postMessage` (recommended inside apps)

```html
<iframe id="chart"
  src="https://goldanil.ir/charts/?embed=1&source=external&symbol=MYASSET&interval=15&theme=dark">
</iframe>
<script>
  const frame = document.getElementById("chart");

  window.addEventListener("message", (ev) => {
    if (ev.data?.source !== "forge-charts") return;
    if (ev.data.type === "ready" || ev.data.type === "requestData") {
      frame.contentWindow.postMessage({
        source: "forge-charts",
        type: "setData",
        symbol: "MYASSET",
        interval: "15",
        live: true,
        bars: [
          { time: 1710000000, open: 10, high: 11, low: 9.5, close: 10.5, volume: 1200 }
          // …more bars
        ],
      }, "*");
    }
  });

  // Live candle update:
  // frame.contentWindow.postMessage({
  //   source: "forge-charts", type: "upsertBar",
  //   bar: { time, open, high, low, close, volume }
  // }, "*");
</script>
```

| Direction | `type` | Purpose |
| --- | --- | --- |
| App → chart | `setData` | Replace series (`bars`, optional `symbol` / `interval` / `live`) |
| App → chart | `setBars` | Replace bars only |
| App → chart | `upsertBar` | Update/append one live candle |
| App → chart | `setTheme` | `"dark"` \| `"light"` |
| App → chart | `setSymbol` / `setInterval` | Change symbol / interval |
| Chart → app | `ready` | Chart booted |
| Chart → app | `requestData` | Needs bars (e.g. after interval change) |

All messages use `source: "forge-charts"`.

---

## 4. Layout tips

- Use **HTTPS** only (`https://goldanil.ir/charts/…`).
- Make the iframe/WebView **full width + full height** of the chart screen.
- Phone-friendly size example: `max-width: 430px; height: 780px` (or `height: 100%` in a full-screen route).
- Do not set `X-Frame-Options: DENY` on your side for the parent page; the chart host already allows framing.

---

## 5. Checklist for the app team

1. Add a chart screen with a full-bleed WebView/iframe.
2. Load `embed=1` URL (market **or** `source=external`).
3. If using your data: ship `setData` on `ready` / `requestData`, then `upsertBar` for live ticks.
4. Confirm candles render (toolbar shows symbol + LIVE/CUSTOM).
5. Hard-refresh after chart updates if a stale bundle is cached.

Questions / full notes: `EMBED.md` in the forge-charts repo. Live chart: https://goldanil.ir/charts/
