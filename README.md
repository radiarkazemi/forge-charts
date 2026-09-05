# Forge Charts

Original Super Chart–style trading terminal. **Not** TradingView’s library — our own TypeScript canvas engine, MIT licensed.

The UI follows Super Chart layout: product header, dense chart toolbar, drawing flyouts, widget dock, range presets, replay, and a Pine pane.

## Run

```bash
npm install
npm run dev
```

Open http://127.0.0.1:5173

## Embed in your app (iframe / WebView)

Market data:

```
https://goldanil.ir/charts/?embed=1&symbol=BTCUSDT&exchange=BINANCE&interval=15&theme=dark
```

**Your own OHLC** (chart only — no Binance/Forex):

```
https://goldanil.ir/charts/?embed=1&source=external&symbol=MYASSET&dataUrl=https://goldanil.ir/charts/sample-ohlc.json
```

Or push bars from the parent app with `postMessage` (`setData` / `upsertBar`).

**App team handoff:** [CHART-APP-INTEGRATION.md](./CHART-APP-INTEGRATION.md) · full notes: [EMBED.md](./EMBED.md)

```html
<iframe
  src="https://goldanil.ir/charts/?embed=1&symbol=BTCUSDT&exchange=BINANCE&interval=15"
  style="width:100%;max-width:430px;height:780px;border:0"
  title="Forge Chart"
></iframe>
```

## Production (VPS)

Prefer HTTPS (full assets + live Mongo/`crypto-chart` data):

- https://goldanil.ir/charts/

HTTP fallbacks (if TLS is blocked on your VPN):

- http://185.222.163.116/charts/
- http://185.222.163.116:8089/charts/

Hard-refresh after updates: Ctrl+Shift+R (clears truncated JS caches).
