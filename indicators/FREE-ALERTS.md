# TRH Alerts

**Phone alerts = VPS FOREXCOM only** (`trh-mongo-alert.mjs` on the VPS → ntfy → Android app).

Yahoo / GitHub Actions publishers are **disabled** — they caused false alarms that did not match the FOREXCOM chart and used the old message format (no ENTRY TIME / EXPIRY).

| Channel | Status |
|---|---|
| **VPS Mongo FOREXCOM** (`trh-alert` systemd) | **Active** — only source for phone |
| **Android TRH Alert app** | Install latest APK (v1.3.3+) |
| **Chrome extension** | Desktop only (polls VPS `/trh-api`) |
| Yahoo `trh-free-alert` / `trh-alert-server` | Disabled (no default ntfy topic) |
| GitHub Actions `trh-alerts.yml` | Disabled |

## Android

Download: https://goldanil.ir/trh-alert.apk

Must show **ENTRY TIME** + **EXPIRY TIME**. If you still see old format without those lines, uninstall and install v1.3.3+.

## VPS

```bash
systemctl status trh-alert
journalctl -u trh-alert -f
```

Alerts fire only on **closed** 1m bars (`TRH_REQUIRE_CLOSED=1`, `TRH_MAX_AGE_BARS=1`).
