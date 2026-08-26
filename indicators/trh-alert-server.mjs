#!/usr/bin/env node
/**
 * TRH Alert Server — runs on VPS, zero user config.
 * Mobile: ntfy email → Gmail push
 * Desktop: Chrome extension polls GET /api/latest or SSE /events
 */

import { createServer } from "http";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { createCipheriv, randomBytes, timingSafeEqual } from "crypto";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { WebSocketServer } from "ws";
import { scanTrhSetups } from "./trh-engine.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = join(__dir, ".trh-server-state.json");
const SECRETS_FILE = join(__dir, ".trh-secrets.json");
const PORT = Number(process.env.TRH_PORT || 3921);
const POLL_SEC = Number(process.env.TRH_POLL_SEC || 60);
const NTFY_TOPIC = process.env.NTFY_TOPIC || "trh-forge-radiarkazemi-bc13";
const NTFY_SERVER = process.env.NTFY_SERVER || "https://ntfy.sh";
const ALERT_EMAIL = process.env.TRH_ALERT_EMAIL || "radiarkazemi@gmail.com";
const PRICE_OFFSET = Number(process.env.TRH_PRICE_OFFSET || 56);
const SYMBOL = process.env.TRH_SYMBOL || "XAUUSD";

function loadSecrets() {
  if (!existsSync(SECRETS_FILE)) {
    console.error("Missing", SECRETS_FILE, "— run: node scripts/generate-trh-secrets.mjs");
    process.exit(1);
  }
  return JSON.parse(readFileSync(SECRETS_FILE, "utf8"));
}

const SECRETS = loadSecrets();
const SECRET_KEY = Buffer.from(SECRETS.secretKey, "hex");
const APP_TOKEN = SECRETS.appToken;

function encryptPayload(obj) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", SECRET_KEY, iv);
  const plain = Buffer.from(JSON.stringify(obj), "utf8");
  const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    type: "alert",
    iv: iv.toString("base64"),
    data: enc.toString("base64"),
    tag: tag.toString("base64"),
  };
}

function safeTokenMatch(got) {
  try {
    const a = Buffer.from(got || "", "utf8");
    const b = Buffer.from(APP_TOKEN, "utf8");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// TRH engine: indicators/trh-engine.mjs

async function fetchGold1m() {
  const url = "https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF?interval=1m&range=1d";
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 TRH-Server" } });
  if (!res.ok) throw new Error(`Yahoo ${res.status}`);
  const j = await res.json();
  const r = j.chart.result[0];
  const bars = [];
  for (let i = 0; i < r.timestamp.length; i++) {
    const o = r.indicators.quote[0].open[i];
    if (o == null) continue;
    bars.push({
      time: r.timestamp[i],
      open: o - PRICE_OFFSET,
      high: r.indicators.quote[0].high[i] - PRICE_OFFSET,
      low: r.indicators.quote[0].low[i] - PRICE_OFFSET,
      close: r.indicators.quote[0].close[i] - PRICE_OFFSET,
    });
  }
  return bars;
}

function loadState() {
  if (!existsSync(STATE_FILE)) return { lastAlertTime: 0, latest: null };
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf8"));
  } catch {
    return { lastAlertTime: 0, latest: null };
  }
}

function saveState(s) {
  writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
}

function fmt(n) {
  return n.toFixed(2);
}

function setupPayload(s) {
  const side = s.dir === 1 ? "LONG" : "SHORT";
  return {
    side,
    symbol: SYMBOL,
    entry: s.entry,
    sl: s.sl,
    tp: s.tp,
    barTime: s.barTime,
    message: `${SYMBOL} 1m | TRH ${side} SETUP\nENTRY ${fmt(s.entry)}\nSL ${fmt(s.sl)}\nTP ${fmt(s.tp)}`,
    title: `TRH ${side} Hunt`,
  };
}

async function pushNotify(payload) {
  // Encrypted envelope → ntfy (phone app decrypts). Plain title stays readable.
  const envelope = encryptPayload(payload);
  await fetch(`${NTFY_SERVER}/${NTFY_TOPIC}`, {
    method: "POST",
    headers: {
      Title: payload.title,
      Priority: "urgent",
      Tags: "chart_with_upwards_trend,moneybag",
      "X-TRH-Encrypted": "aes-256-gcm",
    },
    body: JSON.stringify(envelope),
  }).catch((e) => console.error("[ntfy encrypted]", e.message));

  // Plaintext backup for anyone watching the topic in the free ntfy app
  await fetch(`${NTFY_SERVER}/${NTFY_TOPIC}`, {
    method: "POST",
    headers: {
      Title: payload.title,
      Priority: "default",
      Tags: "lock_with_ink_pen",
    },
    body: payload.message,
  }).catch(() => {});

  if (process.env.GITHUB_TOKEN) {
    await fetch(`https://api.github.com/repos/radiarkazemi/forge-charts/issues`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: `🔔 ${payload.title} — ${new Date().toISOString().slice(0, 16)} UTC`,
        body: payload.message + "\n\n_Auto TRH alert from VPS monitor_",
      }),
    }).catch((e) => console.error("[github issue]", e.message));
  }
}

let latestSetup = null;
let lastScanAt = 0;
const sseClients = new Set();
const wsClients = new Set();

function broadcastWsEncrypted(payload) {
  const envelope = encryptPayload(payload);
  const raw = JSON.stringify(envelope);
  for (const ws of wsClients) {
    if (ws.authed && ws.readyState === 1) {
      try {
        ws.send(raw);
      } catch {
        wsClients.delete(ws);
      }
    }
  }
}

function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(msg);
    } catch {
      sseClients.delete(res);
    }
  }
}

async function scanOnce() {
  const bars = await fetchGold1m();
  lastScanAt = Date.now();
  if (bars.length < 100) return;

  const setups = scanTrhSetups(bars);
  if (setups.length === 0) return;

  const s = setups[setups.length - 1];
  const barsSince = bars.length - 1 - s.barIndex;
  // Live VPS polls every ~60s — only alert fresh setups.
  if (barsSince > 3) {
    console.log(
      `[${new Date().toISOString()}] setup found but stale (${barsSince} bars ago) ${s.dir === 1 ? "LONG" : "SHORT"} ENTRY ${fmt(s.entry)}`,
    );
    return;
  }

  const risk = Math.abs(s.entry - s.sl);
  const minRisk = Number(process.env.TRH_MIN_RISK || 2.5);
  if (risk < minRisk) {
    console.log(`[${new Date().toISOString()}] risk ${risk.toFixed(2)} < ${minRisk} — skip`);
    return;
  }

  // Match phone alerts to cleaner chart hunts: SWEEP only by default.
  const modes = (process.env.TRH_ALERT_MODES || "sweep").split(",").map((x) => x.trim());
  const mode = s.mode || "sweep";
  if (!modes.includes(mode)) {
    console.log(`[${new Date().toISOString()}] mode ${mode} skipped (alert modes: ${modes})`);
    return;
  }

  const state = loadState();
  if (state.lastAlertTime === s.barTime) return;

  const payload = setupPayload(s);
  latestSetup = { ...payload, at: Date.now() };

  console.log(`[${new Date().toISOString()}] NEW ${payload.side}`, payload.message);

  try {
    await pushNotify(payload);
    console.log(`[${new Date().toISOString()}] pushed email→${ALERT_EMAIL} ntfy→${NTFY_TOPIC}`);
  } catch (e) {
    console.error("[push failed]", e.message);
  }

  state.lastAlertTime = s.barTime;
  state.latest = latestSetup;
  saveState(state);
  broadcast("setup", latestSetup);
  broadcastWsEncrypted(payload);
}

const server = createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, lastScanAt, latest: latestSetup }));
    return;
  }

  if (req.url === "/api/latest") {
    const state = loadState();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ latest: latestSetup || state.latest, lastScanAt }));
    return;
  }

  if (req.url === "/api/test-alert" && req.method === "GET") {
    const payload = {
      side: "LONG",
      symbol: SYMBOL,
      entry: 0,
      sl: 0,
      tp: 0,
      barTime: Math.floor(Date.now() / 1000),
      message: `${SYMBOL} 1m | TRH TEST ALERT\nIf you see this on your phone, encrypted tunnel works.`,
      title: "TRH Test Alert",
    };
    latestSetup = { ...payload, at: Date.now() };
    broadcast("setup", latestSetup);
    broadcastWsEncrypted(payload);
    pushNotify(payload).catch(() => {});
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, sent: true }));
    return;
  }

  if (req.url === "/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write(": connected\n\n");
    sseClients.add(res);
    req.on("close", () => sseClients.delete(res));
    return;
  }

  if (req.url === "/" || req.url === "/install") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>TRH Alerts</title></head>
<body style="font-family:system-ui;background:#111;color:#eee;padding:2rem">
<h1>TRH Alert Server ✓</h1>
<p>Android: install TRH Alert APK — encrypted WebSocket tunnel</p>
<p>Last scan: <span id="t">…</span></p>
<pre id="s"></pre>
<script>
fetch('/api/latest').then(r=>r.json()).then(d=>{
  document.getElementById('t').textContent=new Date(d.lastScanAt||0).toLocaleString();
  document.getElementById('s').textContent=JSON.stringify(d.latest,null,2)||'waiting…';
});
if(Notification.permission!=='granted')Notification.requestPermission();
</script></body></html>`);
    return;
  }

  res.writeHead(404);
  res.end("not found");
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`TRH secure server http://0.0.0.0:${PORT} | encrypted WS /ws`);
  scanOnce().catch(console.error);
  setInterval(() => scanOnce().catch(console.error), POLL_SEC * 1000);
});

const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws) => {
  ws.authed = false;
  wsClients.add(ws);
  ws.send(JSON.stringify({ type: "hello", secure: true, algo: "aes-256-gcm" }));

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === "auth" && safeTokenMatch(msg.token)) {
        ws.authed = true;
        ws.send(JSON.stringify({ type: "auth_ok" }));
        if (latestSetup) ws.send(JSON.stringify(encryptPayload(latestSetup)));
        return;
      }
      if (!ws.authed) {
        ws.send(JSON.stringify({ type: "auth_fail" }));
        ws.close();
      }
    } catch {
      ws.close();
    }
  });

  ws.on("close", () => wsClients.delete(ws));
});
