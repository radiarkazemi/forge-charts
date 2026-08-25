# Free TRH Alerts (No TradingView Payment)

TradingView **mobile/system alerts require a paid plan**. Use this free monitor instead.

## Option A — ntfy.sh (easiest, 100% free)

### Phone setup (2 minutes)

1. Install **ntfy** app: [Android](https://play.google.com/store/apps/details?id=io.heckel.ntfy) · [iOS](https://apps.apple.com/app/ntfy/id1625396347)
2. Tap **+** → **Subscribe to topic**
3. Pick a **secret topic name** only you know, e.g. `trh-gold-kazemi-8472`
4. Allow notifications

### Run the monitor

On any PC, VPS, or Raspberry Pi (must stay online):

```bash
export NTFY_TOPIC="trh-gold-kazemi-8472"   # your secret topic
export TRH_PRICE_OFFSET="56"               # FxPro vs GC=F (~56 pts); use 0 for futures prices

node indicators/trh-free-alert.mjs
```

You get a push like:

```
TRH LONG Hunt
XAUUSD 1m | TRH LONG SETUP
ENTRY 4627.84
SL 4620.23
TP 4645.99
```

### Keep it running 24/7

**Linux/Mac (tmux):**
```bash
tmux new -s trh-alert
export NTFY_TOPIC="your-topic"
node indicators/trh-free-alert.mjs
# Ctrl+B then D to detach
```

**Windows:** run in a terminal you leave open, or use Task Scheduler.

**Free cloud:** GitHub Actions cron (every 5 min) — see below.

---

## Option B — Telegram (free)

1. Message [@BotFather](https://t.me/BotFather) → `/newbot` → copy **token**
2. Message [@userinfobot](https://t.me/userinfobot) → copy your **chat id**
3. Run:

```bash
export TELEGRAM_BOT_TOKEN="123456:ABC..."
export TELEGRAM_CHAT_ID="987654321"
export TRH_PRICE_OFFSET="56"
node indicators/trh-free-alert.mjs
```

---

## Environment variables

| Variable | Default | Meaning |
|---|---|---|
| `NTFY_TOPIC` | — | ntfy topic (required for ntfy) |
| `NTFY_SERVER` | `https://ntfy.sh` | ntfy server URL |
| `TELEGRAM_BOT_TOKEN` | — | Telegram bot token |
| `TELEGRAM_CHAT_ID` | — | Your Telegram chat id |
| `TRH_POLL_SEC` | `60` | Check every N seconds |
| `TRH_PRICE_OFFSET` | `0` | Subtract from GC=F to match FxPro (~56) |
| `TRH_SYMBOL` | `XAUUSD` | Label in messages |

---

## TradingView free account

Keep using the **TRH indicator on the chart** for visuals.  
Use this **free monitor** for phone alarms — same TRH sweep logic.

---

## Test push now

```bash
curl -d "TRH test — alerts work!" \
  -H "Title: TRH Test" \
  -H "Priority: high" \
  https://ntfy.sh/YOUR-TOPIC-NAME
```

You should get a notification on your phone instantly.
