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

const CFG = {
  pivotPeriod: 5,
  minContextAtr: 1.2,
  minSweepAtr: 0.05,
  baseConfirmBars: 8,
  maxBaseBars: 40,
  minRoomAtr: 0.8,
  maxRoomAtr: 3.5,
  cooldownBars: 50,
  slPadAtr: 0.02,
  riskReward: 2.4,
};

// ── TRH engine (inline) ──
function atr(bars, i, len = 14) {
  let sum = 0;
  const start = Math.max(1, i - len + 1);
  for (let j = start; j <= i; j++) {
    sum += Math.max(
      bars[j].high - bars[j].low,
      Math.abs(bars[j].high - bars[j - 1].close),
      Math.abs(bars[j].low - bars[j - 1].close),
    );
  }
  return sum / (i - start + 1);
}

function pivotLow(bars, i, p) {
  if (i < p || i >= bars.length - p) return null;
  const v = bars[i].low;
  for (let j = i - p; j <= i + p; j++) if (j !== i && bars[j].low <= v) return null;
  return v;
}

function pivotHigh(bars, i, p) {
  if (i < p || i >= bars.length - p) return null;
  const v = bars[i].high;
  for (let j = i - p; j <= i + p; j++) if (j !== i && bars[j].high >= v) return null;
  return v;
}

function lastPivot(pivots, i, maxAge, p, lowSide) {
  let best = null;
  for (const pv of pivots) {
    const age = i - pv.bar;
    if (age >= p && age <= maxAge) {
      if (best === null || (lowSide ? pv.price <= best : pv.price >= best)) best = pv.price;
    }
  }
  return best;
}

function levels(dir, proximal, distal, a) {
  const entry = (proximal + distal) / 2;
  const pad = a * CFG.slPadAtr;
  const sl = dir === 1 ? distal - pad : distal + pad;
  const risk = Math.abs(entry - sl);
  const tp = dir === 1 ? entry + risk * CFG.riskReward : entry - risk * riskReward;
  return { entry, sl, tp };
}

function validRoom(dir, proximal, distal, a) {
  const w = Math.abs(proximal - distal);
  if (w <= 0) return false;
  if (dir === 1 && distal >= proximal) return false;
  if (dir === -1 && distal <= proximal) return false;
  return w >= a * CFG.minRoomAtr && w <= a * CFG.maxRoomAtr;
}

function scanTrhSetups(bars) {
  const setups = [];
  const p = CFG.pivotPeriod;
  const pivLo = [];
  const pivHi = [];
  let pending = null;
  let lastSetupBar = -9999;

  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const a = atr(bars, i);
    const pl = pivotLow(bars, i - p, p);
    const ph = pivotHigh(bars, i - p, p);
    if (pl !== null) {
      pivLo.push({ price: pl, bar: i - p });
      if (pivLo.length > 30) pivLo.shift();
    }
    if (ph !== null) {
      pivHi.push({ price: ph, bar: i - p });
      if (pivHi.length > 30) pivHi.shift();
    }

    const huntLo = lastPivot(pivLo, i, 80, p, true);
    const huntHi = lastPivot(pivHi, i, 80, p, false);
    const slice = bars.slice(Math.max(0, i - 40), i);
    const priorHigh = slice.length ? Math.max(...slice.map((x) => x.high)) : b.high;
    const priorLow = slice.length ? Math.min(...slice.map((x) => x.low)) : b.low;

    const bullSweep =
      huntLo !== null &&
      b.low < huntLo - a * CFG.minSweepAtr &&
      b.close > huntLo &&
      b.close > b.open &&
      priorHigh - b.low >= a * CFG.minContextAtr;
    const bearSweep =
      huntHi !== null &&
      b.high > huntHi + a * CFG.minSweepAtr &&
      b.close < huntHi &&
      b.close < b.open &&
      b.high - priorLow >= a * CFG.minContextAtr;

    if (!pending && i - lastSetupBar >= CFG.cooldownBars) {
      if (bullSweep) pending = { dir: 1, distal: b.low, bar: i, baseHigh: b.high, baseLow: b.low };
      else if (bearSweep) pending = { dir: -1, distal: b.high, bar: i, baseHigh: b.high, baseLow: b.low };
    }

    if (pending) {
      pending.baseHigh = Math.max(pending.baseHigh, b.high);
      pending.baseLow = Math.min(pending.baseLow, b.low);
      if (pending.dir === 1 && b.low < pending.distal) pending.distal = b.low;
      if (pending.dir === -1 && b.high > pending.distal) pending.distal = b.high;
      const age = i - pending.bar;
      if (age > CFG.maxBaseBars) {
        pending = null;
        continue;
      }
      if (age >= CFG.baseConfirmBars) {
        let ok = false;
        if (pending.dir === 1) {
          const distal = pending.distal;
          const proximal = pending.baseHigh;
          const width = proximal - distal;
          const prevBaseHigh = i > pending.bar ? bars[i - 1].high : proximal;
          const microBreak = b.close > b.open && (b.high >= prevBaseHigh || b.close >= distal + width * 0.7);
          if (validRoom(1, proximal, distal, a) && microBreak) {
            setups.push({ dir: 1, ...levels(1, proximal, distal, a), barTime: b.time, barIndex: i });
            ok = true;
          }
        } else {
          const distal = pending.distal;
          const proximal = pending.baseLow;
          const width = distal - proximal;
          const prevBaseLow = i > pending.bar ? bars[i - 1].low : proximal;
          const microBreak = b.close < b.open && (b.low <= prevBaseLow || b.close <= distal - width * 0.7);
          if (validRoom(-1, proximal, distal, a) && microBreak) {
            setups.push({ dir: -1, ...levels(-1, proximal, distal, a), barTime: b.time, barIndex: i });
            ok = true;
          }
        }
        if (ok) {
          lastSetupBar = i;
          pending = null;
        }
      }
    }
  }
  return setups;
}

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
  // ntfy topic publish (works anonymously)
  await fetch(`${NTFY_SERVER}/${NTFY_TOPIC}`, {
    method: "POST",
    headers: { Title: payload.title, Priority: "urgent", Tags: "chart_with_upwards_trend,moneybag" },
    body: payload.message,
  }).catch(() => {});

  // GitHub issue → emails repo owner (radiarkazemi@gmail.com via GitHub notifications)
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
  if (barsSince > 3) return;

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
