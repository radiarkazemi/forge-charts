# TRH Chrome Extension (Manifest V3)

Standard Chrome extension for **classic TRH SWEEP** alerts on **FOREXCOM:XAUUSD**.

Uses your VPS Mongo feed (same candles as TradingView `cp_fetcher`), **not Yahoo**.

## Install (unpacked)

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** → select this `chrome-extension/` folder
4. Allow notifications when Chrome prompts
5. Pin **TRH | Trading Room Hunter** to the toolbar

Popup shows Armed status, last FOREXCOM price, and the latest setup (ENTRY / SL / TP).

## Data source (priority)

| # | Endpoint |
|---|----------|
| 1 | `https://goldanil.ir/trh-api/bars?limit=500` — fast FOREXCOM + live tip |
| 2 | `http://185.222.163.116/trh-api/bars?limit=500` |
| 3–4 | `/crypto-chart/history?...` fallbacks on the same hosts |

Bars come from Mongo `historical_data.xauusd_1m` + live `last.1` tip (`ex: forexcom`).

## Behavior

- Scans every **1 minute** (`chrome.alarms`)
- Classic SWEEP engine (matches Pine + VPS `trh-mongo-alert`)
- Desktop notification on a fresh setup
- **Scan now** button in the popup

## Requirements

- Chrome **110+**
- PC / browser must be open (service worker + alarms)
- For phone alerts with PC off: use VPS `trh-alert` + Android / ntfy (see `indicators/TRH-VPS-ALERTS.md`)

## Files

```
chrome-extension/
  manifest.json      # MV3
  background.js      # scanner + notifications
  popup.html / .js   # status UI
  icons/             # 16 / 48 / 128
```
