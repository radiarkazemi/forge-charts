# TRH VPS alerts (PC can be off)

24/7 classic SWEEP scanner on the VPS using **FOREXCOM:XAUUSD** candles already stored in MongoDB by `cp_fetcher` (TradingView data).

## Why

GitHub Actions / local PC miss setups when the machine is asleep. This service polls Mongo every 30s on the VPS and pushes ntfy (+ encrypted payload for the Android app).

## Data

| Item | Value |
|------|--------|
| Mongo | `mongodb://127.0.0.1:27017` |
| DB / collection | `historical_data.xauusd_1m` |
| Symbol | FOREXCOM:XAUUSD (matches TradingView FxPro-scale gold) |
| Engine | classic TRH SWEEP (`trh-engine.mjs`) |

Verified against chart LONG ~ENTRY **4602.87** / SL **4599.63** / TP **4610.64** @ **2026-08-27 06:13 UTC**.

## Service

```bash
systemctl status trh-alert
journalctl -u trh-alert -f
# or
tail -f /var/log/trh-alert.log
```

Files live in `/opt/trh-alert/` on the VPS (`trh-mongo-alert.mjs`, `trh-engine.mjs`, secrets, systemd unit).

## Local / repo

```bash
node indicators/trh-mongo-alert.mjs --once
```

Requires `mongodb` npm package and access to the VPS Mongo port (or tunnel).
