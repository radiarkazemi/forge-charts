# TRH Alerts — Fully Automated (Zero Setup From You)

Everything is pre-configured for **radiarkazemi@gmail.com** / **forge-charts** repo.

## What runs automatically

| Channel | How | You do |
|---|---|---|
| **Android phone push** | VPS → encrypted WebSocket → TRH Alert app | Install APK once |
| **Phone + desktop email** | GitHub Actions every 5 min → creates issue → GitHub emails you | Nothing |
| **Desktop Chrome popup** | Chrome extension scans gold locally every 1 min | Load extension once (see below) |
| **VPS monitor** | Cloud agent runs `trh-alert-server` + Cloudflare tunnel | Nothing |

---

## Android app (recommended — instant push)

Install **TRH Alert** APK on your phone. The app connects to your VPS over an **encrypted private tunnel** (Cloudflare) and shows a notification when a TRH hunt appears.

**Security:**
- WebSocket auth token (HMAC-derived)
- Alert payloads encrypted with **AES-256-GCM**
- Secrets baked into APK at build time — nothing to type

**Install:** download `trh-alert.apk` from the latest agent run artifacts, enable "Install unknown apps", open once, allow notifications. Done.

The app runs as a foreground service and auto-starts on boot.

See `android-trh-alert/README.md` for details.

---

## Phone alerts via email (already live after push)

GitHub Actions workflow `.github/workflows/trh-alerts.yml` scans XAUUSD on a schedule.

**Note:** GitHub cron often runs late (30–60+ min). Alerts now keep a **90-bar** window and dedupe by setup time so late jobs still fire once. For near-instant phone push use the **Android app + VPS** path above.

When TRH finds a setup, it opens a GitHub issue like:

> TRH Gold Setup — 2026-08-25 21:30 UTC  
> XAUUSD 1m | TRH LONG SETUP  
> ENTRY 4627.84 / SL 4620.23 / TP 4645.99

GitHub sends that to **radiarkazemi@gmail.com** (same email on your GitHub account).

**Make sure:** GitHub → Settings → Notifications → enable **Issues** email.

---

## Desktop Chrome notifications

The extension scans gold **locally** — no TradingView payment, no API keys.

### One-time load (30 seconds)

1. Open Chrome → `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked**
4. Select folder: `chrome-extension/` in this repo

Or on Linux run:
```bash
bash scripts/install-chrome-extension.sh
```

After that it runs forever in the background and pops Chrome notifications when TRH setups appear.

---

## VPS server + secure tunnel

```bash
bash scripts/start-trh-stack.sh   # starts server + Cloudflare tunnel + embeds Android config
```

Local health: http://127.0.0.1:3921/health  
Encrypted WebSocket: `/ws` (token auth + AES-256-GCM alerts)

---

## Test GitHub alert pipeline now

```bash
node indicators/trh-free-alert.mjs --once
```

If a recent setup exists in the last 3 bars, the next GitHub Actions run will email you.
