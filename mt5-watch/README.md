# MT5 Watch — local webapp bridge

Live dashboard so you (and the cloud agent) can see **TRH · ICT · CRT** on gold as they fire.

```
MT5 EAs  --HTTP POST-->  mt5-watch server (:8787)  -->  browser dashboard
                \--file-->  Common/Files/mt5-watch/events.jsonl
```

## 1) Start the webapp (on the PC that runs MT5)

```bash
cd forge-charts
npm run mt5:watch
```

Open: **http://127.0.0.1:8787**

Agent API: **http://127.0.0.1:8787/api/snapshot**

### Optional — expose for cloud agent

```bash
# example with cloudflared
cloudflared tunnel --url http://127.0.0.1:8787
```

Paste the public URL here and the agent can poll `/api/snapshot` until `allHaveSetup: true`.

### Optional — file fallback (no WebRequest)

```bash
# Windows PowerShell example — adjust Terminal Common Files path:
$env:MT5_WATCH_JSONL="$env:APPDATA\MetaQuotes\Terminal\Common\Files\mt5-watch\events.jsonl"
npm run mt5:watch
```

## 2) MT5 setup (once)

1. Copy updated EA folders (include `WatchBridge.mqh` beside each AutoTrade):
   - `mt5/TRH_Trading_Room_Hunter/`
   - `mt5/ICT_Liquidity_Expansion/`
   - `mt5/CRT_OrderFlow/`
2. MetaEditor → Compile each `*_AutoTrade.mq5`
3. **Tools → Options → Expert Advisors**
   - ☑ Allow algorithmic trading
   - ☑ Allow WebRequest for listed URL  
   - Add: `http://127.0.0.1:8787`
4. Attach all 3 EAs on **XAUUSD** (same charts you already use)
5. Inputs group **MT5 Watch**: leave Enable + File on

## 3) What you will see

| Card | Meaning |
|------|---------|
| live / offline | Heartbeat in last ~90s |
| SCANNING / LIVE | Current EA comment state |
| setups N | Count of fresh closed-bar setups since server start |
| Goal row | Turns green when **all 3** have ≥1 setup |

## API

| Method | Path | Use |
|--------|------|-----|
| GET | `/api/health` | Liveness |
| GET | `/api/snapshot` | Full state + `allHaveSetup` |
| GET | `/api/events` | Recent events |
| GET | `/api/stream` | SSE live feed |
| POST | `/api/event` | MT5 WatchBridge |

## Files

```
mt5-watch/
  server.mjs
  public/index.html
  README.md
mt5/MT5_WatchBridge/WatchBridge.mqh   # master copy
mt5/*/WatchBridge.mqh                 # beside each EA
mt5/*/ * _AutoTrade.mq5               # hooked emitters
```
