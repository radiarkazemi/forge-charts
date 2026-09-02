# Embed API — full chart in your app

Host the **entire Forge Superchart** inside a mobile app WebView or any site via iframe. The chart fills the container, scales to phone sizes, and stays responsive.

## Embed URL

```
https://goldanil.ir/charts/?embed=1&symbol=BTCUSDT&exchange=BINANCE&interval=15&theme=dark
```

| Param | Default (`embed=1`) | Description |
| --- | --- | --- |
| `embed` | — | `1` enables embed / iframe mode |
| `symbol` / `ticker` | `XAUUSD` | Instrument ticker |
| `exchange` / `ex` | auto | `BINANCE` or `FOREXCOM` |
| `interval` / `resolution` | `15` | Bar size (`1`, `5`, `15`, `60`, `1D`, …) |
| `theme` | saved / dark | `dark` or `light` |
| `header` | `0` | Product header |
| `toolbar` | `1` | Chart toolbar (symbol, interval, …) |
| `drawings` / `draw` | `0` | Left drawing tools |
| `widgets` / `dock` | `0` | Right widget dock |
| `bottom` | `0` | Pine / bottom dock |
| `mobile` | `0` | Force phone chrome on any width |

Full desktop chrome (no embed) still becomes phone-sized under **720px** width: side rails collapse to FAB overlays, toolbar densifies, chart stays full-bleed.

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

React Native / Capacitor / Flutter WebView: load the same HTTPS URL; the chart uses `100dvh` and ResizeObserver so it matches the WebView bounds.

## Optional chrome

Keep drawing tools in an in-app chart:

```
...?embed=1&symbol=EURUSD&exchange=FOREXCOM&interval=60&drawings=1&toolbar=1
```

## Programmatic helper

```ts
import { buildEmbedUrl } from "./embed";

const src = buildEmbedUrl({
  symbol: "BTCUSDT",
  exchange: "BINANCE",
  interval: "15",
  theme: "dark",
});
```

Prefer **HTTPS** (`https://goldanil.ir/charts/…`) so WebViews and iframes load assets reliably.
