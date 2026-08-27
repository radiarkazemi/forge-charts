# TRH Alert — Android App

Zero-config encrypted push notifications from your VPS TRH monitor.

## How it works

1. **VPS** runs `trh-alert-server.mjs` — scans XAUUSD 1m for TRH setups every 60s
2. **Cloudflare Tunnel** exposes the server securely (no open firewall ports)
3. **Android app** connects via encrypted WebSocket (`AES-256-GCM` + token auth)
4. When a new hunt is found, you get a **phone notification** with ENTRY / SL / TP

## Install (one step)

Download the latest APK from GitHub Actions artifacts, or build locally:

```bash
bash scripts/start-trh-stack.sh          # starts server + tunnel, embeds URL
cd android-trh-alert && ./gradlew assembleDebug
```

Install `app/build/outputs/apk/debug/app-debug.apk` on your phone.

Grant notification permission when prompted. The app auto-starts on boot.

## Security

- WebSocket auth token (HMAC-derived from shared secret)
- Alert payloads encrypted with AES-256-GCM
- Secrets baked into APK at build time (not in git)
- Tunnel URL is HTTPS/WSS via Cloudflare

## Files

| File | Purpose |
|------|---------|
| `TrhAlertService.kt` | Foreground service, WebSocket client |
| `Crypto.kt` | AES-256-GCM decrypt (matches VPS server) |
| `Config.kt` | Auto-generated — WS URL + secrets |

Regenerate config after tunnel restart:

```bash
node scripts/embed-android-config.mjs
```

## v1.3.2

UI refreshes hunt details when an alert arrives while the app is open in the background (no force-close needed). Still shows exact **ENTRY TIME** / **EXPIRY TIME**; VPS poll **3s**.
