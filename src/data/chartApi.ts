import type { Bar, Interval, SymbolInfo } from "../engine/types";
import { chartApiBase, chartApiWsUrl, chartFastBase } from "./config";

export type Quote = { price: number; change: number };

/** Chart interval -> cp_fetcher Mongo timeframe + aggregation group. */
const HISTORY_TF: Record<Interval, { tf: "1m" | "1h" | "1d"; group: number }> = {
  "1": { tf: "1m", group: 1 },
  "5": { tf: "1m", group: 5 },
  "15": { tf: "1m", group: 15 },
  "30": { tf: "1m", group: 30 },
  "60": { tf: "1h", group: 1 },
  "120": { tf: "1h", group: 2 },
  "240": { tf: "1h", group: 4 },
  "1D": { tf: "1d", group: 1 },
  "1W": { tf: "1d", group: 7 },
  "1M": { tf: "1d", group: 30 },
};

const LIVE_TF: Record<Interval, "1m" | "1h" | "1d"> = {
  "1": "1m",
  "5": "1m",
  "15": "1m",
  "30": "1m",
  "60": "1h",
  "120": "1h",
  "240": "1h",
  "1D": "1d",
  "1W": "1d",
  "1M": "1d",
};

/** Target candles on screen — server aggregates, so payload stays tiny. */
const DISPLAY_BARS = 350;

const historyCache = new Map<string, { at: number; bars: Bar[] }>();
const HISTORY_CACHE_MS = 15_000;

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : NaN;
}

async function getJson(url: string, timeoutMs = 8000): Promise<unknown> {
  const ctrl = new AbortController();
  const t = window.setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`${url} ${res.status}`);
    return await res.json();
  } finally {
    window.clearTimeout(t);
  }
}

async function getApiJson(path: string, timeoutMs = 8000): Promise<unknown> {
  const base = chartApiBase().replace(/\/+$/, "");
  return getJson(`${base}${path}`, timeoutMs);
}

function parseCandleTime(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw > 1e12 ? Math.floor(raw / 1000) : raw;
  if (typeof raw === "string" && raw) {
    const ms = Date.parse(raw.endsWith("Z") || raw.includes("+") ? raw : `${raw}Z`);
    if (Number.isFinite(ms)) return Math.floor(ms / 1000);
  }
  return NaN;
}

function historyToBars(results: unknown[]): Bar[] {
  const bars: Bar[] = [];
  for (const row of results) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const time = parseCandleTime(r.time ?? r.id);
    const open = num(r.open);
    const close = num(r.close);
    if (!Number.isFinite(time) || !Number.isFinite(open) || !Number.isFinite(close)) continue;
    bars.push({
      time,
      open,
      high: num(r.high) || Math.max(open, close),
      low: num(r.low) || Math.min(open, close),
      close,
      volume: num(r.volume) || 0,
    });
  }
  return bars.sort((a, b) => a.time - b.time);
}

function compactToBars(rows: unknown[]): Bar[] {
  const bars: Bar[] = [];
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 5) continue;
    const time = num(row[0]);
    const open = num(row[1]);
    const high = num(row[2]);
    const low = num(row[3]);
    const close = num(row[4]);
    const volume = num(row[5]) || 0;
    if (!Number.isFinite(time) || !Number.isFinite(open) || !Number.isFinite(close)) continue;
    bars.push({
      time: time > 1e12 ? Math.floor(time / 1000) : time,
      open,
      high: Number.isFinite(high) ? high : Math.max(open, close),
      low: Number.isFinite(low) ? low : Math.min(open, close),
      close,
      volume,
    });
  }
  return bars;
}

function aggregateBars(bars: Bar[], group: number, stepSec: number): Bar[] {
  if (group <= 1 || bars.length === 0) return bars;
  const bucket = stepSec * group;
  const out: Bar[] = [];
  let cur: Bar | null = null;
  let bucketStart = -1;
  for (const b of bars) {
    const start = Math.floor(b.time / bucket) * bucket;
    if (!cur || start !== bucketStart) {
      if (cur) out.push(cur);
      bucketStart = start;
      cur = { time: start, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume };
    } else {
      cur.high = Math.max(cur.high, b.high);
      cur.low = Math.min(cur.low, b.low);
      cur.close = b.close;
      cur.volume += b.volume;
    }
  }
  if (cur) out.push(cur);
  return out;
}

function precisionFromPrice(price: number, exchange: string): number {
  if (!Number.isFinite(price) || price === 0) return exchange === "FOREXCOM" ? 5 : 4;
  if (price >= 1000) return 2;
  if (price >= 1) return exchange === "FOREXCOM" ? 5 : 4;
  if (price >= 0.01) return 6;
  return 8;
}

function symbolType(ticker: string, exchange: string): SymbolInfo["type"] {
  if (exchange === "BINANCE") return "crypto";
  if (ticker.startsWith("XAU") || ticker.startsWith("XAG")) return "metal";
  return "fx";
}

export async function chartApiHealth(): Promise<boolean> {
  try {
    const fast = (await getJson(`${chartFastBase()}/health`, 1500)) as { status?: string; mongo?: boolean };
    if (fast?.status === "ok" || fast?.mongo === true) return true;
  } catch {
    /* fall through to django health */
  }
  try {
    const json = (await getApiJson("/health/", 2500)) as { status?: string; mongo?: boolean };
    return json?.status === "ok" || json?.mongo === true;
  } catch {
    return false;
  }
}

export async function fetchChartApiSymbols(exchanges: string[]): Promise<SymbolInfo[]> {
  const out: SymbolInfo[] = [];
  for (const exchange of exchanges) {
    const ex = exchange.toLowerCase();
    try {
      const json = (await getApiJson(
        `/prices/?timeframe=1m&exchange=${encodeURIComponent(ex)}&page_size=80`,
        5000,
      )) as { results?: Array<Record<string, unknown>> };
      for (const row of json.results ?? []) {
        const ticker = String(row.symbol ?? "").toUpperCase();
        if (!ticker) continue;
        const price = num(row.price);
        out.push({
          ticker,
          name: ticker,
          exchange: exchange.toUpperCase() === "FOREXCOM" ? "FOREXCOM" : "BINANCE",
          type: symbolType(ticker, exchange.toUpperCase()),
          pricePrecision: precisionFromPrice(price, exchange.toUpperCase()),
        });
      }
    } catch {
      /* next exchange */
    }
  }
  return out;
}

async function fetchCompactHistory(symbol: SymbolInfo, interval: Interval): Promise<Bar[] | null> {
  const { tf, group } = HISTORY_TF[interval];
  const limit = DISPLAY_BARS;
  const url =
    `${chartFastBase()}/history?symbol=${encodeURIComponent(symbol.ticker.toLowerCase())}` +
    `&timeframe=${tf}&limit=${limit}&group=${group}`;
  const json = (await getJson(url, 6000)) as { bars?: unknown[] };
  const bars = compactToBars(json.bars ?? []);
  return bars.length ? bars : null;
}

async function fetchVerboseHistory(symbol: SymbolInfo, interval: Interval): Promise<Bar[]> {
  const { tf, group } = HISTORY_TF[interval];
  // Keep verbose fallback small — never pull 2000 raw bars over the wire.
  const limit = Math.min(500, DISPLAY_BARS * Math.min(group, 4));
  const json = (await getApiJson(
    `/prices/${encodeURIComponent(symbol.ticker.toLowerCase())}/history/?timeframe=${tf}&limit=${limit}`,
    8000,
  )) as { results?: unknown[] };
  const raw = historyToBars(json.results ?? []);
  const step = tf === "1m" ? 60 : tf === "1h" ? 3600 : 86400;
  return aggregateBars(raw, group, step);
}

export async function fetchChartApiHistory(symbol: SymbolInfo, interval: Interval): Promise<Bar[]> {
  const cacheKey = `${symbol.exchange}:${symbol.ticker}:${interval}`;
  const cached = historyCache.get(cacheKey);
  if (cached && Date.now() - cached.at < HISTORY_CACHE_MS) return cached.bars;

  let bars: Bar[] = [];
  try {
    bars = (await fetchCompactHistory(symbol, interval)) ?? [];
  } catch {
    bars = [];
  }
  if (!bars.length) {
    bars = await fetchVerboseHistory(symbol, interval);
  }
  if (bars.length) historyCache.set(cacheKey, { at: Date.now(), bars });
  return bars;
}

export async function fetchChartApiQuotes(symbols: SymbolInfo[]): Promise<Record<string, Quote>> {
  const out: Record<string, Quote> = {};
  const byEx = new Map<string, SymbolInfo[]>();
  for (const s of symbols) {
    const ex = s.exchange.toLowerCase();
    const list = byEx.get(ex) ?? [];
    list.push(s);
    byEx.set(ex, list);
  }
  await Promise.all(
    [...byEx.entries()].map(async ([ex, rows]) => {
      try {
        const json = (await getApiJson(
          `/prices/?timeframe=1m&exchange=${encodeURIComponent(ex)}&page_size=80`,
          5000,
        )) as { results?: Array<Record<string, unknown>> };
        const wanted = new Set(rows.map((r) => r.ticker.toLowerCase()));
        for (const row of json.results ?? []) {
          const ticker = String(row.symbol ?? "").toLowerCase();
          if (!wanted.has(ticker)) continue;
          const price = num(row.price);
          if (!Number.isFinite(price)) continue;
          out[ticker.toUpperCase()] = { price, change: num(row.price_change) || 0 };
        }
      } catch {
        /* ignore */
      }
    }),
  );
  return out;
}

function barFromWs(msg: unknown): Bar | null {
  if (!msg || typeof msg !== "object") return null;
  const m = msg as Record<string, unknown>;
  const src = (m.bar && typeof m.bar === "object" ? m.bar : m) as Record<string, unknown>;
  if (String(src.type ?? m.type ?? "") === "bar" || src.t != null || src.c != null) {
    const time = num(src.t ?? src.time);
    const open = num(src.o ?? src.open);
    const close = num(src.c ?? src.close ?? src.price);
    if (!Number.isFinite(time) || !Number.isFinite(close)) return null;
    const o = Number.isFinite(open) ? open : close;
    return {
      time: time > 1e12 ? Math.floor(time / 1000) : time,
      open: o,
      high: num(src.h ?? src.high) || Math.max(o, close),
      low: num(src.l ?? src.low) || Math.min(o, close),
      close,
      volume: num(src.v ?? src.volume) || 0,
    };
  }
  return null;
}

export function subscribeChartApi(
  symbol: SymbolInfo,
  interval: Interval,
  onBar: (bar: Bar) => void,
): () => void {
  const tf = LIVE_TF[interval];
  let ws: WebSocket | null = null;
  let closed = false;
  let retry = 0;
  let timer = 0;
  let poll = 0;

  const startPoll = () => {
    window.clearInterval(poll);
    const tick = async () => {
      if (closed) return;
      try {
        const json = (await getApiJson(
          `/prices/${encodeURIComponent(symbol.ticker.toLowerCase())}/?timeframe=${tf}`,
          4000,
        )) as Record<string, unknown>;
        const time = num(json.bar_close_time);
        const close = num(json.price);
        if (!Number.isFinite(time) || !Number.isFinite(close)) return;
        const open = num(json.open);
        onBar({
          time,
          open: Number.isFinite(open) ? open : close,
          high: num(json.high) || Math.max(open || close, close),
          low: num(json.low) || Math.min(open || close, close),
          close,
          volume: num(json.volume) || 0,
        });
      } catch {
        /* ignore */
      }
    };
    poll = window.setInterval(tick, 1000);
    void tick();
  };

  const connect = () => {
    if (closed) return;
    try {
      ws = new WebSocket(chartApiWsUrl());
    } catch {
      return;
    }
    ws.onopen = () => {
      retry = 0;
      ws?.send(
        JSON.stringify({
          op: "subscribe",
          exchange: symbol.exchange,
          symbol: symbol.ticker,
          interval: tf,
        }),
      );
    };
    ws.onmessage = (ev) => {
      if (closed) return;
      try {
        const data = JSON.parse(String(ev.data));
        const bar = barFromWs(data);
        if (bar) onBar(bar);
      } catch {
        /* ignore */
      }
    };
    ws.onclose = () => {
      if (closed) return;
      const wait = Math.min(10000, 500 * 2 ** retry++);
      timer = window.setTimeout(connect, wait);
    };
    ws.onerror = () => ws?.close();
  };

  // Always poll at 1s so the last candle stays fresh even when the WS is quiet.
  startPoll();
  connect();
  return () => {
    closed = true;
    window.clearTimeout(timer);
    window.clearInterval(poll);
    try {
      ws?.send(JSON.stringify({ op: "unsubscribe" }));
    } catch {
      /* ignore */
    }
    ws?.close();
  };
}
