# Apex Watch — cloud / remote MT5 bridge

## Important truth

A cloud server **cannot open your MetaTrader**.
Your local MT5 must **push** events out with `WebRequest` to a public dashboard URL.

Flow:

```
Local MT5 (Apex_AutoTrade + WatchBridge)
        │  POST /api/event
        ▼
Public dashboard URL (tunnel or VPS)
        │
        ▼
Browser opens /apex.html
```

## Right now (this cloud agent session)

Dashboard is running in the agent VM and exposed with a temporary tunnel.

1. Open cockpit:  
   `https://debf11e6d32bcd.lhr.life/apex.html`
2. In MT5: **Tools → Options → Expert Advisors → Allow WebRequest for listed URL**  
   add exactly:  
   `https://debf11e6d32bcd.lhr.life`
3. On Apex_AutoTrade / WatchBridge inputs set:  
   `InpWatchUrl = https://debf11e6d32bcd.lhr.life/api/event`
4. Compile/reattach EA, wait for heartbeat on the dashboard.

This tunnel dies when the cloud agent stops. For a stable setup use the local one-liner below.

## Stable option (recommended): run on your PC

In PowerShell next to the repo (or the pack WebDashboard folder):

```powershell
cd D:\Apex_Brain\Apex_Complete_Pack\WebDashboard   # or repo mt5-watch
$env:MT5_WATCH_HOST="0.0.0.0"
$env:MT5_WATCH_PORT="8787"
Start-Process node -ArgumentList "server.mjs" -WindowStyle Minimized
# optional public share from THIS PC:
cloudflared tunnel --url http://127.0.0.1:8787
```

Then allow that printed `https://….trycloudflare.com` in MT5 WebRequest, and point WatchBridge to  
`https://….trycloudflare.com/api/event`.

For pure local use (no public URL): allow `http://127.0.0.1:8787` and keep WatchBridge on localhost.
