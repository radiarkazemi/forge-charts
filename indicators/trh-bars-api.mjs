#!/usr/bin/env node
/**
 * Fast FOREXCOM XAUUSD bars API for Chrome extension / local tools.
 * GET /bars?limit=800  -> { symbol, feed, bars: [[t,o,h,l,c], ...] }
 * GET /health
 */
import { createServer } from "http";
import { MongoClient } from "mongodb";

const PORT = Number(process.env.TRH_BARS_PORT || 8011);
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017";
const LIMIT_DEFAULT = 800;
const LIMIT_MAX = 2000;
const LIMIT_MIN = 50;

const client = new MongoClient(MONGO_URI, { maxPoolSize: 4 });
await client.connect();

/** CORS is also set by nginx; keep here for direct :8011 access. */
function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

async function loadBars(limit) {
  const hist = client.db("historical_data").collection("xauusd_1m");
  const docs = await hist
    .find({}, { projection: { data: 1 } })
    .sort({ _id: -1 })
    .limit(limit)
    .toArray();
  docs.reverse();
  const bars = docs
    .filter((d) => d?.data?.open != null)
    .map((d) => {
      const t = Math.floor(new Date(d.data.time).getTime() / 1000);
      return [t, d.data.open, d.data.high, d.data.low, d.data.close];
    });

  const live = await client.db("last").collection("1").findOne({ _id: "xauusd" });
  if (live?.po != null && live.bct) {
    const tip = [Number(live.bct), live.po, live.pmax, live.pmin, live.pl];
    if (!bars.length || tip[0] > bars[bars.length - 1][0]) bars.push(tip);
    else if (tip[0] === bars[bars.length - 1][0]) bars[bars.length - 1] = tip;
  }
  return bars;
}

const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Length": 0,
    });
    res.end();
    return;
  }

  const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);
  try {
    if (url.pathname === "/health") {
      sendJson(res, 200, { ok: true, mongo: true });
      return;
    }
    if (url.pathname === "/bars") {
      const limit = Math.min(
        LIMIT_MAX,
        Math.max(LIMIT_MIN, Number(url.searchParams.get("limit") || LIMIT_DEFAULT) || LIMIT_DEFAULT),
      );
      const bars = await loadBars(limit);
      sendJson(res, 200, {
        symbol: "xauusd",
        feed: "forexcom",
        timeframe: "1m",
        count: bars.length,
        bars,
      });
      return;
    }
    sendJson(res, 404, { error: "not found" });
  } catch (e) {
    sendJson(res, 500, { error: String(e.message || e) });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[trh-bars-api] listening on 127.0.0.1:${PORT}`);
});
