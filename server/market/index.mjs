import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { fetchTvHistory, fetchTvQuote, subscribeTv } from "./tvFeed.mjs";
import { tvResolution } from "./interval.mjs";
import { FXPRO_TV, fxproTvSymbol } from "./symbols.mjs";

const running = new Map();

export function createMarketService() {
  const listeners = new Set();

  async function history(ticker, interval, limit = 400) {
    const tv = fxproTvSymbol(ticker);
    if (!tv) throw new Error(`no FXPro mapping for ${ticker}`);
    const bars = await fetchTvHistory(tv, tvResolution(interval), limit);
    return { source: "fxpro", symbol: ticker.toUpperCase(), tvSymbol: tv, interval, count: bars.length, items: bars };
  }

  async function quote(ticker) {
    const tv = fxproTvSymbol(ticker);
    if (!tv) throw new Error(`no FXPro mapping for ${ticker}`);
    const q = await fetchTvQuote(tv);
    return { source: "fxpro", symbol: ticker.toUpperCase(), tvSymbol: tv, ...q };
  }

  function watch(ticker, interval, onBar) {
    const tv = fxproTvSymbol(ticker);
    if (!tv) throw new Error(`no FXPro mapping for ${ticker}`);
    return subscribeTv(tv, tvResolution(interval), (bar) => {
      onBar(bar);
      for (const listener of listeners) listener({ ticker: ticker.toUpperCase(), interval, bar });
    });
  }

  async function handleRequest(req, res) {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const path = url.pathname.replace(/^\/market-api/, "") || "/";
    cors(res);
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    try {
      if (path === "/health" || path === "/") {
        return json(res, { status: "ok", source: "fxpro", symbols: Object.keys(FXPRO_TV) });
      }
      if (path === "/symbols") {
        return json(res, {
          source: "fxpro",
          items: Object.entries(FXPRO_TV).map(([ticker, tvSymbol]) => ({ ticker, tvSymbol })),
        });
      }
      if (path === "/history") {
        const ticker = (url.searchParams.get("symbol") || "XAUUSD").toUpperCase();
        const interval = url.searchParams.get("interval") || "15";
        const limit = clamp(url.searchParams.get("limit"), 400, 50, 2000);
        return json(res, await history(ticker, interval, limit));
      }
      if (path === "/quote") {
        const ticker = (url.searchParams.get("symbol") || "XAUUSD").toUpperCase();
        return json(res, await quote(ticker));
      }
      if (path === "/stream") {
        return sse(req, res, url, watch);
      }
      json(res, { error: "not found" }, 404);
    } catch (err) {
      json(res, { error: String(err.message || err) }, 500);
    }
  }

  return { history, quote, watch, handleRequest, onBar: (fn) => (listeners.add(fn), () => listeners.delete(fn)) };
}

function sse(req, res, url, watch) {
  const ticker = (url.searchParams.get("symbol") || "XAUUSD").toUpperCase();
  const interval = url.searchParams.get("interval") || "15";
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });
  const send = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };
  send("hello", { source: "fxpro", symbol: ticker, interval, tvSymbol: fxproTvSymbol(ticker) });
  const stop = watch(ticker, interval, (bar) => send("bar", { symbol: ticker, bar }));
  const ping = setInterval(() => send("ping", { t: Date.now() }), 25_000);
  req.on("close", () => {
    clearInterval(ping);
    stop();
  });
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function json(res, body, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function clamp(raw, fallback, min, max) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

async function probe(host, port) {
  try {
    const res = await fetch(`http://${host}:${port}/health`, { signal: AbortSignal.timeout(400) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function startMarketServer(opts = {}) {
  const port = Number(opts.port || process.env.MARKET_PORT || 8788);
  const host = opts.host || process.env.MARKET_HOST || "127.0.0.1";
  if (running.has(port)) return running.get(port);
  if (await probe(host, port)) {
    const ctl = { port, host, alreadyRunning: true, stop() {} };
    running.set(port, ctl);
    return ctl;
  }
  const service = createMarketService();
  const server = createServer((req, res) => {
    void service.handleRequest(req, res);
  });
  await new Promise((resolve, reject) => {
    server.listen(port, host, resolve);
    server.on("error", reject);
  });
  const ctl = {
    port,
    host,
    alreadyRunning: false,
    service,
    stop() {
      server.close();
      running.delete(port);
    },
  };
  running.set(port, ctl);
  return ctl;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const ctl = await startMarketServer();
  console.log(`Forge FXPro market server http://${ctl.host}:${ctl.port}`);
}
