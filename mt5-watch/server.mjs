#!/usr/bin/env node
/**
 * MT5 Watch — local webapp that receives TRH / ICT / CRT events from MT5.
 *
 *   npm run mt5:watch
 *   open http://127.0.0.1:8787
 *
 * Agent / API:
 *   GET  /api/health
 *   GET  /api/snapshot   — models + latest events (what the agent polls)
 *   GET  /api/events?limit=100
 *   GET  /api/stream     — SSE live feed
 *   POST /api/event      — MT5 WatchBridge posts here
 */

import { createServer } from "http";
import { readFileSync, writeFileSync, existsSync, mkdirSync, watch, appendFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dir = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.MT5_WATCH_PORT || 8787);
const HOST = process.env.MT5_WATCH_HOST || "127.0.0.1";
const STATE_FILE = join(__dir, ".watch-state.json");
const LOG_FILE = join(__dir, "events.jsonl");
const PUBLIC = join(__dir, "public");
const MAX_EVENTS = 500;

/** Optional: Common/Files path so file-fallback from MT5 is picked up */
const MT5_JSONL = process.env.MT5_WATCH_JSONL || "";

const MODELS = ["TRH", "ICT", "CRT"];

function blankModel(name) {
  return {
    model: name,
    online: false,
    lastSeenAt: 0,
    lastHeartbeatAt: 0,
    status: "offline",
    side: "",
    mode: "",
    symbol: "",
    tf: "",
    entry: null,
    sl: null,
    tp: null,
    message: "",
    setupsSeen: 0,
    lastSetupAt: 0,
    lastSetup: null,
  };
}

function loadState() {
  const base = {
    startedAt: Date.now(),
    events: [],
    models: Object.fromEntries(MODELS.map((m) => [m, blankModel(m)])),
  };
  if (!existsSync(STATE_FILE)) return base;
  try {
    const s = JSON.parse(readFileSync(STATE_FILE, "utf8"));
    for (const m of MODELS) {
      s.models[m] = { ...blankModel(m), ...(s.models?.[m] || {}) };
    }
    s.events = Array.isArray(s.events) ? s.events.slice(-MAX_EVENTS) : [];
    return s;
  } catch {
    return base;
  }
}

function saveState() {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

const state = loadState();
const sseClients = new Set();

function broadcast(obj) {
  const raw = `data: ${JSON.stringify(obj)}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(raw);
    } catch {
      sseClients.delete(res);
    }
  }
}

function normalizeEvent(body) {
  const model = String(body.model || "UNK").toUpperCase();
  const kind = String(body.kind || "info");
  const now = Date.now();
  return {
    id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
    recvAt: now,
    ts: Number(body.ts) || now,
    model,
    kind,
    symbol: body.symbol || "",
    tf: body.tf || "",
    side: body.side || "",
    status: body.status || "",
    entry: body.entry != null ? Number(body.entry) : null,
    sl: body.sl != null ? Number(body.sl) : null,
    tp: body.tp != null ? Number(body.tp) : null,
    mode: body.mode || "",
    message: body.message || "",
    barTime: body.barTime != null ? Number(body.barTime) : 0,
    bid: body.bid != null ? Number(body.bid) : null,
    ask: body.ask != null ? Number(body.ask) : null,
    account: body.account != null ? Number(body.account) : null,
    balance: body.balance != null ? Number(body.balance) : null,
    equity: body.equity != null ? Number(body.equity) : null,
  };
}

function applyEvent(ev) {
  if (!MODELS.includes(ev.model)) {
    state.models[ev.model] = state.models[ev.model] || blankModel(ev.model);
  }
  const m = state.models[ev.model] || blankModel(ev.model);
  m.online = true;
  m.lastSeenAt = ev.recvAt;
  if (ev.kind === "heartbeat") m.lastHeartbeatAt = ev.recvAt;
  if (ev.status) m.status = ev.status;
  if (ev.side) m.side = ev.side;
  if (ev.mode) m.mode = ev.mode;
  if (ev.symbol) m.symbol = ev.symbol;
  if (ev.tf) m.tf = ev.tf;
  if (ev.message) m.message = ev.message;
  if (ev.entry != null && !Number.isNaN(ev.entry) && ev.entry !== 0) m.entry = ev.entry;
  if (ev.sl != null && !Number.isNaN(ev.sl) && ev.sl !== 0) m.sl = ev.sl;
  if (ev.tp != null && !Number.isNaN(ev.tp) && ev.tp !== 0) m.tp = ev.tp;

  if (ev.kind === "setup") {
    m.setupsSeen = (m.setupsSeen || 0) + 1;
    m.lastSetupAt = ev.recvAt;
    m.lastSetup = {
      side: ev.side,
      entry: ev.entry,
      sl: ev.sl,
      tp: ev.tp,
      mode: ev.mode,
      barTime: ev.barTime,
      at: ev.recvAt,
      message: ev.message,
    };
    m.status = "SETUP";
  }
  state.models[ev.model] = m;

  const keepInFeed = ["setup", "entry", "exit", "error", "info"].includes(ev.kind);
  if (keepInFeed) {
    state.events.push(ev);
    if (state.events.length > MAX_EVENTS) state.events = state.events.slice(-MAX_EVENTS);
    try {
      appendFileSync(LOG_FILE, JSON.stringify(ev) + "\n");
    } catch {
      /* ignore */
    }
  }

  saveState();
  broadcast({ type: "event", event: ev, models: state.models });
  return ev;
}

function snapshot() {
  const now = Date.now();
  const models = {};
  for (const [k, v] of Object.entries(state.models)) {
    const age = v.lastSeenAt ? now - v.lastSeenAt : null;
    models[k] = {
      ...v,
      online: v.lastSeenAt ? age < 90_000 : false,
      ageMs: age,
    };
  }
  const need = MODELS.map((name) => ({
    model: name,
    hasSetup: (models[name]?.setupsSeen || 0) > 0,
    setupsSeen: models[name]?.setupsSeen || 0,
    lastSetup: models[name]?.lastSetup || null,
    online: models[name]?.online || false,
  }));
  const allHaveSetup = need.every((n) => n.hasSetup);
  return {
    ok: true,
    serverTime: now,
    startedAt: state.startedAt,
    allHaveSetup,
    need,
    models,
    events: state.events.slice(-100),
    recentSetups: state.events.filter((e) => e.kind === "setup").slice(-20),
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj, null, 2);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function contentType(p) {
  if (p.endsWith(".html")) return "text/html; charset=utf-8";
  if (p.endsWith(".css")) return "text/css; charset=utf-8";
  if (p.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (p.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

const seenFileLines = new Set();

function ingestJsonlFile(path) {
  if (!path || !existsSync(path)) return;
  let text = "";
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return;
  }
  const lines = text.split(/\r?\n/).filter(Boolean);
  // only last 50 new lines
  for (const line of lines.slice(-50)) {
    if (seenFileLines.has(line)) continue;
    seenFileLines.add(line);
    if (seenFileLines.size > 2000) {
      const arr = [...seenFileLines].slice(-1000);
      seenFileLines.clear();
      for (const x of arr) seenFileLines.add(x);
    }
    try {
      applyEvent(normalizeEvent(JSON.parse(line)));
    } catch {
      /* skip bad line */
    }
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    return res.end();
  }

  try {
    if (req.method === "GET" && url.pathname === "/api/health") {
      return sendJson(res, 200, { ok: true, port: PORT, models: MODELS });
    }
    if (req.method === "GET" && url.pathname === "/api/snapshot") {
      return sendJson(res, 200, snapshot());
    }
    if (req.method === "GET" && url.pathname === "/api/events") {
      const limit = Math.min(500, Number(url.searchParams.get("limit") || 100));
      return sendJson(res, 200, { ok: true, events: state.events.slice(-limit) });
    }
    if (req.method === "POST" && (url.pathname === "/api/event" || url.pathname === "/api/events")) {
      const body = await readBody(req);
      const ev = applyEvent(normalizeEvent(body));
      return sendJson(res, 200, { ok: true, id: ev.id });
    }
    if (req.method === "POST" && url.pathname === "/api/reset-setups") {
      for (const m of Object.values(state.models)) {
        m.setupsSeen = 0;
        m.lastSetup = null;
        m.lastSetupAt = 0;
      }
      saveState();
      broadcast({ type: "reset", models: state.models });
      return sendJson(res, 200, { ok: true });
    }
    if (req.method === "GET" && url.pathname === "/api/stream") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      });
      res.write(`data: ${JSON.stringify({ type: "hello", snapshot: snapshot() })}\n\n`);
      sseClients.add(res);
      req.on("close", () => sseClients.delete(res));
      return;
    }

    // static
    let path = url.pathname === "/" ? "/index.html" : url.pathname;
    path = path.replace(/\.\./g, "");
    const file = join(PUBLIC, path);
    if (!file.startsWith(PUBLIC) || !existsSync(file)) {
      return sendJson(res, 404, { ok: false, error: "not found" });
    }
    res.writeHead(200, { "Content-Type": contentType(file) });
    res.end(readFileSync(file));
  } catch (e) {
    sendJson(res, 400, { ok: false, error: String(e.message || e) });
  }
});

if (!existsSync(PUBLIC)) mkdirSync(PUBLIC, { recursive: true });

server.listen(PORT, HOST, () => {
  console.log(`MT5 Watch listening on http://${HOST}:${PORT}`);
  console.log(`Dashboard:  http://${HOST}:${PORT}/`);
  console.log(`Snapshot:   http://${HOST}:${PORT}/api/snapshot`);
  console.log(`MT5 POST:   http://${HOST}:${PORT}/api/event`);
  console.log(`Allow WebRequest URL in MT5: http://${HOST}:${PORT}`);
  if (MT5_JSONL) {
    console.log(`Watching MT5 JSONL: ${MT5_JSONL}`);
    ingestJsonlFile(MT5_JSONL);
    try {
      watch(MT5_JSONL, () => ingestJsonlFile(MT5_JSONL));
    } catch (e) {
      console.warn("JSONL watch failed:", e.message);
      setInterval(() => ingestJsonlFile(MT5_JSONL), 2000);
    }
  }
});

// Mark models offline if silent
setInterval(() => {
  broadcast({ type: "tick", snapshot: snapshot() });
}, 5000);
