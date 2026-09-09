import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { openNewsDb } from "./db.mjs";
import { fetchStory, fetchSymbolNews } from "./tv.mjs";
import { allForgeTickers, forgeTickerFromTv, tvAliasesFor, tvSymbolFor } from "./symbols.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));

export function createNewsService(opts = {}) {
  const dbPath = opts.dbPath || process.env.NEWS_DB_PATH || join(ROOT, "data", "news.sqlite");
  const pollMs = Number(opts.pollMs || process.env.NEWS_POLL_MS || 15_000);
  const sweepMs = Number(opts.sweepMs || process.env.NEWS_SWEEP_MS || 5 * 60_000);
  const lang = opts.lang || process.env.NEWS_LANG || "en";
  const db = openNewsDb(dbPath);
  const listeners = new Set();
  const hotTickers = new Map();
  let pollTimer = null;
  let sweepTimer = null;
  let ingestChain = Promise.resolve();
  let stopped = false;

  function touchHot(ticker) {
    hotTickers.set(ticker.toUpperCase(), Date.now());
  }

  function hotList() {
    const now = Date.now();
    for (const [ticker, at] of hotTickers) {
      if (now - at > 30 * 60_000) hotTickers.delete(ticker);
    }
    const list = [...hotTickers.keys()];
    return list.length ? list : ["XAUUSD"];
  }

  function tickersForItem(item, queriedTicker, tvSymbol) {
    const out = new Map();
    if (queriedTicker) out.set(queriedTicker, tvSymbol);
    for (const related of item.relatedSymbols || []) {
      const forge = forgeTickerFromTv(related);
      if (forge) out.set(forge, related);
    }
    return [...out.entries()].map(([ticker, mapped]) => ({ ticker, tvSymbol: mapped }));
  }

  async function ingestTvSymbol(tvSymbol, queriedTicker) {
    const items = await fetchSymbolNews(tvSymbol, lang);
    const added = [];
    for (const item of items) {
      const links = tickersForItem(item, queriedTicker, tvSymbol);
      const isNew = db.upsert(item, links);
      if (isNew) added.push(db.get(item.id));
    }
    db.markPoll(tvSymbol, items.length, null);
    return { items, added };
  }

  async function fillStories(added) {
    const pending = added.filter((item) => item && !item.shortDescription).slice(0, 8);
    for (const item of pending) {
      try {
        const story = await fetchStory(item.id, lang);
        if (story.shortDescription) db.setDescription(item.id, story.shortDescription);
      } catch {
        /* preview/paywall stories may 400 */
      }
    }
  }

  function broadcast(added) {
    if (!added.length) return;
    for (const listener of listeners) {
      try {
        listener(added);
      } catch {
        /* drop */
      }
    }
  }

  function ingestTicker(ticker) {
    const upper = ticker.toUpperCase();
    touchHot(upper);
    const aliases = tvAliasesFor(upper);
    if (!aliases.length) return Promise.resolve({ ticker: upper, added: [], items: [] });
    ingestChain = ingestChain.then(async () => {
      if (stopped) return { ticker: upper, added: [], items: [] };
      const added = [];
      let items = [];
      for (const tvSymbol of aliases) {
        try {
          const result = await ingestTvSymbol(tvSymbol, upper);
          items = result.items;
          added.push(...result.added.filter(Boolean));
        } catch (err) {
          db.markPoll(tvSymbol, 0, String(err.message || err));
        }
      }
      const uniqueAdded = uniqueById(added);
      await fillStories(uniqueAdded);
      const hydrated = uniqueAdded.map((item) => db.get(item.id)).filter(Boolean);
      broadcast(hydrated);
      return { ticker: upper, added: hydrated, items };
    });
    return ingestChain;
  }

  async function pollHot() {
    for (const ticker of hotList()) {
      if (stopped) return;
      await ingestTicker(ticker);
    }
  }

  async function sweepAll() {
    for (const ticker of allForgeTickers()) {
      if (stopped) return;
      await ingestTicker(ticker);
    }
  }

  function start() {
    if (pollTimer) return;
    stopped = false;
    void pollHot();
    pollTimer = setInterval(() => void pollHot(), pollMs);
    sweepTimer = setInterval(() => void sweepAll(), sweepMs);
    if (typeof pollTimer.unref === "function") pollTimer.unref();
    if (typeof sweepTimer.unref === "function") sweepTimer.unref();
  }

  function stop() {
    stopped = true;
    if (pollTimer) clearInterval(pollTimer);
    if (sweepTimer) clearInterval(sweepTimer);
    pollTimer = null;
    sweepTimer = null;
    db.close();
  }

  function listNews(ticker, limit) {
    touchHot(ticker);
    const mapped = tvSymbolFor(ticker);
    if (!mapped) return [];
    const stale = Date.now() / 1000 - db.lastPoll(mapped) > pollMs / 1000;
    if (stale) void ingestTicker(ticker);
    return db.list(ticker, limit);
  }

  return {
    dbPath,
    start,
    stop,
    ingestTicker,
    listNews,
    getNews: (id) => db.get(id),
    stats: () => db.stats(),
    onNews(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    handleRequest(req, res) {
      return route(req, res, {
        listNews,
        getNews: (id) => db.get(id),
        ingestTicker,
        stats: () => db.stats(),
        onNews: (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        dbPath,
      });
    },
  };
}

function uniqueById(items) {
  const map = new Map();
  for (const item of items) {
    if (item?.id) map.set(item.id, item);
  }
  return [...map.values()];
}

async function route(req, res, svc) {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const path = url.pathname.replace(/^\/news-api/, "") || "/";
  cors(res);
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    if (path === "/health" || path === "/") {
      return json(res, {
        status: "ok",
        source: "tradingview-news-flow",
        db: svc.dbPath,
        ...svc.stats(),
      });
    }
    if (path === "/news/stream") {
      const ticker = (url.searchParams.get("symbol") || "XAUUSD").toUpperCase();
      return sse(req, res, ticker, svc);
    }
    if (path === "/news") {
      const ticker = (url.searchParams.get("symbol") || "XAUUSD").toUpperCase();
      const limit = clampInt(url.searchParams.get("limit"), 200, 1, 500);
      const items = svc.listNews(ticker, limit);
      return json(res, { symbol: ticker, count: items.length, items });
    }
    const story = path.match(/^\/news\/(.+)$/);
    if (story) {
      const id = decodeURIComponent(story[1]);
      const item = svc.getNews(id);
      if (!item) return json(res, { error: "not found" }, 404);
      return json(res, item);
    }
    if (path === "/ingest" && (req.method === "POST" || req.method === "GET")) {
      const ticker = (url.searchParams.get("symbol") || "XAUUSD").toUpperCase();
      const result = await svc.ingestTicker(ticker);
      return json(res, {
        symbol: ticker,
        added: result.added.length,
        count: svc.listNews(ticker, 500).length,
        items: result.added,
      });
    }
    json(res, { error: "not found" }, 404);
  } catch (err) {
    json(res, { error: String(err.message || err) }, 500);
  }
}

function sse(req, res, ticker, svc) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });
  const send = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };
  send("hello", { symbol: ticker, items: svc.listNews(ticker, 200) });
  const unsub = svc.onNews((added) => {
    const matched = added.filter((item) => item.tickers?.includes(ticker));
    if (matched.length) send("news", { symbol: ticker, added: matched, items: svc.listNews(ticker, 200) });
  });
  const ping = setInterval(() => send("ping", { t: Date.now() }), 25_000);
  req.on("close", () => {
    clearInterval(ping);
    unsub();
  });
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function json(res, body, status = 200) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(payload);
}

function clampInt(raw, fallback, min, max) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

const running = new Map();

export async function startNewsServer(opts = {}) {
  const port = Number(opts.port || process.env.NEWS_PORT || 8787);
  const host = opts.host || process.env.NEWS_HOST || "127.0.0.1";
  if (running.has(port)) return running.get(port);
  const existing = await probe(host, port);
  if (existing) {
    const ctl = { port, host, alreadyRunning: true, stop() {} };
    running.set(port, ctl);
    return ctl;
  }
  const service = createNewsService(opts);
  service.start();
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
      service.stop();
      server.close();
      running.delete(port);
    },
  };
  running.set(port, ctl);
  return ctl;
}

async function probe(host, port) {
  try {
    const res = await fetch(`http://${host}:${port}/health`, { signal: AbortSignal.timeout(400) });
    return res.ok;
  } catch {
    return false;
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const ctl = await startNewsServer();
  console.log(`Forge TV news server http://${ctl.host}:${ctl.port}  db=${ctl.service?.dbPath ?? "existing"}`);
}
