import type { Bar, Interval, SymbolInfo } from "../engine/types";
import { chartApiBase, chartApiWsUrl } from "./config";

export type Quote = { price: number; change: number };

type UdfHistory = {
  s?: string;
  t?: number[];
  o?: number[];
  h?: number[];
  l?: number[];
  c?: number[];
  v?: number[];
};

const IV: Record<Interval, { rest: string; udf: string }> = {
  "1": { rest: "1m", udf: "1" },
  "5": { rest: "5m", udf: "5" },
  "15": { rest: "15m", udf: "15" },
  "30": { rest: "30m", udf: "30" },
  "60": { rest: "1h", udf: "60" },
  "120": { rest: "2h", udf: "120" },
  "240": { rest: "4h", udf: "240" },
  "1D": { rest: "1d", udf: "1D" },
  "1W": { rest: "1w", udf: "1W" },
  "1M": { rest: "1M", udf: "1M" },
};

function tvSymbol(symbol: SymbolInfo): string {
  return `${symbol.exchange}:${symbol.ticker}`;
}

async function getJson(path: string, timeoutMs = 4000): Promise<unknown> {
  const ctrl = new AbortController();
  const t = window.setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${chartApiBase()}${path}`, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`${path} ${res.status}`);
    return await res.json();
  } finally {
    window.clearTimeout(t);
  }
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function asBars(payload: unknown): Bar[] {
  if (!payload || typeof payload !== "object") return [];
  const p = payload as Record<string, unknown>;

  const udf = p as UdfHistory;
  if (Array.isArray(udf.t) && (udf.s === "ok" || udf.o || udf.c)) {
    return udf.t
      .map((t, i) => ({
        time: t > 1e12 ? Math.floor(t / 1000) : t,
        open: num(udf.o?.[i]),
        high: num(udf.h?.[i]),
        low: num(udf.l?.[i]),
        close: num(udf.c?.[i]),
        volume: num(udf.v?.[i]) || 0,
      }))
      .filter((b) => Number.isFinite(b.open) && Number.isFinite(b.close));
  }

  const rows =
    (Array.isArray(p.bars) && p.bars) ||
    (Array.isArray(p.data) && p.data) ||
    (Array.isArray(p.candles) && p.candles) ||
    (Array.isArray(p.result) && p.result) ||
    (Array.isArray(payload) ? payload : null);

  if (!Array.isArray(rows) || !rows.length) return [];

  return rows
    .map((row) => {
      if (Array.isArray(row)) {
        const t = num(row[0]);
        return {
          time: t > 1e12 ? Math.floor(t / 1000) : t,
          open: num(row[1]),
          high: num(row[2]),
          low: num(row[3]),
          close: num(row[4]),
          volume: num(row[5]) || 0,
        };
      }
      const r = row as Record<string, unknown>;
      const t = num(r.time ?? r.t ?? r.timestamp ?? r.openTime);
      return {
        time: t > 1e12 ? Math.floor(t / 1000) : t,
        open: num(r.open ?? r.o),
        high: num(r.high ?? r.h),
        low: num(r.low ?? r.l),
        close: num(r.close ?? r.c),
        volume: num(r.volume ?? r.v) || 0,
      };
    })
    .filter((b) => Number.isFinite(b.time) && Number.isFinite(b.open) && Number.isFinite(b.close));
}

function asSymbols(payload: unknown, fallbackExchange: string): SymbolInfo[] {
  const rows =
    (payload && typeof payload === "object" && "symbols" in payload && Array.isArray((payload as { symbols: unknown }).symbols)
      ? (payload as { symbols: unknown[] }).symbols
      : null) ||
    (payload && typeof payload === "object" && "data" in payload && Array.isArray((payload as { data: unknown }).data)
      ? (payload as { data: unknown[] }).data
      : null) ||
    (Array.isArray(payload) ? payload : []);

  const out: SymbolInfo[] = [];
  for (const row of rows) {
    if (typeof row === "string") {
      const [ex, ticker] = row.includes(":") ? row.split(":") : [fallbackExchange, row];
      out.push({
        ticker,
        name: ticker,
        exchange: ex || fallbackExchange,
        type: (ex || fallbackExchange) === "BINANCE" ? "crypto" : "fx",
        pricePrecision: (ex || fallbackExchange) === "BINANCE" ? 2 : 5,
      });
      continue;
    }
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const full = String(r.full_name ?? r.fullName ?? r.tv ?? "");
    const [exFromFull, tickerFromFull] = full.includes(":") ? full.split(":") : ["", ""];
    const ticker = String(r.ticker ?? r.symbol ?? r.name ?? tickerFromFull ?? "").replace(/^.*:/, "");
    if (!ticker) continue;
    const exchange = String(r.exchange ?? r.provider ?? exFromFull ?? fallbackExchange);
    const typeRaw = String(r.type ?? r.assetType ?? "").toLowerCase();
    const type: SymbolInfo["type"] =
      typeRaw.includes("crypto") || exchange === "BINANCE"
        ? "crypto"
        : typeRaw.includes("metal") || ticker.startsWith("XAU") || ticker.startsWith("XAG")
          ? "metal"
          : typeRaw.includes("index")
            ? "index"
            : typeRaw.includes("stock")
              ? "stock"
              : "fx";
    const scale = num(r.pricescale ?? r.priceScale);
    const precision = Number.isFinite(num(r.pricePrecision ?? r.precision))
      ? Math.max(0, Math.round(num(r.pricePrecision ?? r.precision)))
      : Number.isFinite(scale) && scale > 0
        ? Math.round(Math.log10(scale))
        : type === "fx"
          ? 5
          : 2;
    out.push({
      ticker,
      name: String(r.description ?? r.name ?? r.full_name ?? ticker),
      exchange,
      type,
      pricePrecision: precision,
    });
  }
  return out;
}

function asQuotes(payload: unknown): Record<string, Quote> {
  const out: Record<string, Quote> = {};
  if (!payload || typeof payload !== "object") return out;
  const p = payload as Record<string, unknown>;

  const udf = p.d;
  if (Array.isArray(udf)) {
    for (const row of udf) {
      if (!row || typeof row !== "object") continue;
      const r = row as { n?: string; v?: { lp?: number; chp?: number } };
      const ticker = String(r.n ?? "").replace(/^.*:/, "");
      if (ticker && r.v && Number.isFinite(r.v.lp)) out[ticker] = { price: r.v.lp as number, change: num(r.v.chp) || 0 };
    }
  }

  const rows =
    (Array.isArray(p.quotes) && p.quotes) ||
    (Array.isArray(p.data) && p.data) ||
    (Array.isArray(p.result) && p.result) ||
    (Array.isArray(payload) ? payload : null);

  if (Array.isArray(rows)) {
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const ticker = String(r.ticker ?? r.symbol ?? r.n ?? "").replace(/^.*:/, "");
      const price = num(r.price ?? r.last ?? r.lp ?? r.close);
      if (!ticker || !Number.isFinite(price)) continue;
      out[ticker] = { price, change: num(r.change ?? r.chp ?? r.changePercent ?? r.priceChangePercent) || 0 };
    }
  }

  for (const [key, val] of Object.entries(p)) {
    if (!val || typeof val !== "object" || Array.isArray(val)) continue;
    const v = val as Record<string, unknown>;
    const price = num(v.price ?? v.last ?? v.lp ?? v.close);
    if (!Number.isFinite(price)) continue;
    out[key.replace(/^.*:/, "")] = { price, change: num(v.change ?? v.chp) || 0 };
  }
  return out;
}

function barFromWs(msg: unknown): Bar | null {
  if (!msg || typeof msg !== "object") return null;
  const m = msg as Record<string, unknown>;
  const k = (m.k ?? m.bar ?? m.candle ?? m.data ?? m) as Record<string, unknown>;
  if (!k || typeof k !== "object") return null;
  const time = num(k.t ?? k.time ?? k.timestamp ?? k.openTime);
  const open = num(k.o ?? k.open);
  const close = num(k.c ?? k.close);
  if (!Number.isFinite(time) || !Number.isFinite(open) || !Number.isFinite(close)) return null;
  return {
    time: time > 1e12 ? Math.floor(time / 1000) : time,
    open,
    high: num(k.h ?? k.high) || Math.max(open, close),
    low: num(k.l ?? k.low) || Math.min(open, close),
    close,
    volume: num(k.v ?? k.volume) || 0,
  };
}

export async function chartApiHealth(): Promise<boolean> {
  for (const path of ["/health", "/config", "/api/health", "/openapi.json"]) {
    try {
      const ctrl = new AbortController();
      const t = window.setTimeout(() => ctrl.abort(), 2500);
      const res = await fetch(`${chartApiBase()}${path}`, { signal: ctrl.signal });
      window.clearTimeout(t);
      if (!res.ok) continue;
      const type = res.headers.get("content-type") ?? "";
      if (type.includes("json") || type.includes("text/plain") || path.endsWith("health")) return true;
    } catch {
      /* try next */
    }
  }
  return false;
}

export async function fetchChartApiSymbols(exchanges: string[]): Promise<SymbolInfo[]> {
  const out: SymbolInfo[] = [];
  for (const exchange of exchanges) {
    const paths = [
      `/symbols?exchange=${encodeURIComponent(exchange)}`,
      `/api/symbols?exchange=${encodeURIComponent(exchange)}`,
      `/search?query=&exchange=${encodeURIComponent(exchange)}&limit=5000`,
      `/symbol_info?group=${encodeURIComponent(exchange)}`,
    ];
    for (const path of paths) {
      try {
        const json = await getJson(path, 5000);
        const rows = asSymbols(json, exchange).filter((s) => !s.exchange || s.exchange.toUpperCase() === exchange);
        if (rows.length) {
          out.push(...rows.map((s) => ({ ...s, exchange })));
          break;
        }
      } catch {
        /* next path */
      }
    }
  }
  return out;
}

export async function fetchChartApiHistory(symbol: SymbolInfo, interval: Interval): Promise<Bar[]> {
  const now = Math.floor(Date.now() / 1000);
  const span: Record<Interval, number> = {
    "1": 60 * 4000,
    "5": 300 * 4000,
    "15": 900 * 4000,
    "30": 1800 * 4000,
    "60": 3600 * 4000,
    "120": 7200 * 3000,
    "240": 14400 * 2500,
    "1D": 86400 * 2500,
    "1W": 604800 * 800,
    "1M": 2592000 * 400,
  };
  const from = now - span[interval];
  const tv = tvSymbol(symbol);
  const { rest, udf } = IV[interval];
  const paths = [
    `/history?exchange=${symbol.exchange}&symbol=${symbol.ticker}&interval=${rest}&limit=4000`,
    `/api/history?exchange=${symbol.exchange}&symbol=${symbol.ticker}&interval=${rest}&limit=4000`,
    `/api/candles?exchange=${symbol.exchange}&symbol=${symbol.ticker}&interval=${rest}&limit=4000`,
    `/history?symbol=${encodeURIComponent(tv)}&resolution=${udf}&from=${from}&to=${now}`,
    `/udf/history?symbol=${encodeURIComponent(tv)}&resolution=${udf}&from=${from}&to=${now}`,
  ];
  for (const path of paths) {
    try {
      const bars = asBars(await getJson(path, 12000));
      if (bars.length) return bars.sort((a, b) => a.time - b.time);
    } catch {
      /* next */
    }
  }
  throw new Error("chart api history unavailable");
}

export async function fetchChartApiQuotes(symbols: SymbolInfo[]): Promise<Record<string, Quote>> {
  if (!symbols.length) return {};
  const listed = symbols.map(tvSymbol).join(",");
  const paths = [
    `/quotes?symbols=${encodeURIComponent(listed)}`,
    `/api/quotes?symbols=${encodeURIComponent(listed)}`,
    `/quotes?exchange=BINANCE`,
    `/quotes?exchange=FOREXCOM`,
  ];
  const out: Record<string, Quote> = {};
  for (const path of paths) {
    try {
      Object.assign(out, asQuotes(await getJson(path, 6000)));
    } catch {
      /* next */
    }
  }
  return out;
}

export function subscribeChartApi(
  symbol: SymbolInfo,
  interval: Interval,
  onBar: (bar: Bar) => void,
): () => void {
  const { rest, udf } = IV[interval];
  const payloads = [
    { op: "subscribe", exchange: symbol.exchange, symbol: symbol.ticker, interval: rest },
    { action: "subscribe", exchange: symbol.exchange, symbol: symbol.ticker, interval: rest },
    { type: "subscribe", symbol: tvSymbol(symbol), resolution: udf },
  ];
  const paths = ["/ws", "/ws/stream", "/stream"];
  let ws: WebSocket | null = null;
  let closed = false;
  let pathIndex = 0;
  let timer = 0;

  const connect = () => {
    if (closed) return;
    const url = chartApiWsUrl(paths[pathIndex % paths.length]);
    try {
      ws = new WebSocket(url);
    } catch {
      pathIndex += 1;
      timer = window.setTimeout(connect, 1200);
      return;
    }
    ws.onopen = () => {
      for (const body of payloads) {
        try {
          ws?.send(JSON.stringify(body));
        } catch {
          /* ignore */
        }
      }
    };
    ws.onmessage = (ev) => {
      if (closed) return;
      try {
        const data = JSON.parse(String(ev.data));
        const bar = barFromWs(data);
        if (bar) onBar(bar);
      } catch {
        /* ignore non-json */
      }
    };
    ws.onclose = () => {
      if (closed) return;
      pathIndex += 1;
      timer = window.setTimeout(connect, 1500);
    };
    ws.onerror = () => ws?.close();
  };

  connect();
  return () => {
    closed = true;
    window.clearTimeout(timer);
    ws?.close();
  };
}
