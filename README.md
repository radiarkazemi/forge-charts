# Forge Charts

Original Super Chart–style trading terminal. **Not** TradingView’s library — our own TypeScript canvas engine, MIT licensed.

The UI follows Super Chart layout: product header, dense chart toolbar, drawing flyouts, widget dock, range presets, replay, and a Pine pane.

## Run

```bash
npm install
npm start
```

Open **http://localhost:5173**

`npm start` binds `127.0.0.1:5173` for a local browser. Cloud Agents use `npm run dev` (all interfaces) and Cursor forwards that same port to your machine as `http://localhost:5173`.

## Production (VPS)

Deployed next to `cp_fetcher` on the VPS:

- Chart UI: `http://<vps>/charts/`
- REST (Mongo history/quotes): `http://<vps>/crypto-api/`
- WebSocket live bars: `ws://<vps>/crypto-ws`

Nginx injects the API key server-side so the browser never needs credentials. The chart reads cached historical candles from MongoDB and streams the current bar over WebSocket.
