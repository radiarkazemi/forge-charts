# Forge Charts

Original Super Chart–style trading terminal. **Not** TradingView’s library — our own TypeScript canvas engine, MIT licensed.

The UI follows Super Chart layout: product header, dense chart toolbar, drawing flyouts, widget dock, range presets, replay, and a Pine pane.

## Run

```bash
npm install
npm run dev
```

Open http://127.0.0.1:5173

## Production (VPS)

Prefer HTTPS (full assets + live Mongo/`crypto-chart` data):

- https://goldanil.ir/charts/

HTTP fallbacks (if TLS is blocked on your VPN):

- http://185.222.163.116/charts/
- http://185.222.163.116:8089/charts/

Hard-refresh after updates: Ctrl+Shift+R (clears truncated JS caches).
