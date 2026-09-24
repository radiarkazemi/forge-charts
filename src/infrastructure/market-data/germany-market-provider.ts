import { intervalSeconds, parseInterval, isMarketSessionOpen, type Bar, type BarRange, type Interval, type Quote, type SymbolInfo } from "@/domain";
import type { MarketDataProvider, Unsubscribe } from "@/application";
import { buildUrl, fetchJson } from "../http/fetch-json";
import { startPolling } from "./polling";
import { fetchCpChartHistory, mongoHistoryPlan } from "./cp-chart-history";

/**
 * Germany Market Price API via `/market-api/` + browser Binance tick streams.
 * History: VPS Mongo via `/crypto-chart/history` (deep 20k/10k/5k) with Germany
 * `/ohlc/` fallback for the recent window / seconds synth.
 * Realtime: Binance trade+bookTicker (crypto & PAXG), VPS `/market-ticks`
 * (TradingView quote feed + Germany/Mongo fallback), `/crypto-ws` (cp_fetcher).
 */
const BASE = "/market-api";
const REQUEST_TIMEOUT_MS = 15_000;
const HEALTH_TTL_MS = 60_000;
const TICK_POLL_MS = 120;
/** Browser forex HTTP is fallback only — VPS /market-ticks owns the Germany budget. */
const FOREX_POLL_MS = 3_500;
const BAR_RECONCILE_MS = 12_000;
/** Germany `/ohlc/` hard ceiling (API truncates above this). Deep history uses Mongo. */
const MAX_BARS = 1_000;

/** Full TradingView-style resolution set we advertise and serve. */
export const GERMANY_NATIVE_INTERVALS: readonly Interval[] = [
  "1S",
  "5S",
  "10S",
  "15S",
  "30S",
  "45S",
  "1",
  "2",
  "3",
  "5",
  "10",
  "15",
  "30",
  "45",
  "60",
  "120",
  "180",
  "240",
  "360",
  "480",
  "720",
  "1D",
  "1W",
  "1M",
];


/** Map any TV interval → OHLC request interval + optional aggregate step. */
function ohlcPlan(interval: Interval): { request: string; aggregateStep: number } {
  const { unit, count, seconds } = parseInterval(interval);
  if (unit === "seconds") return { request: "1", aggregateStep: 60 }; // parents for synth
  if (unit === "minutes") {
    if (count === 1) return { request: "1", aggregateStep: 0 };
    if (count === 5) return { request: "5", aggregateStep: 0 };
    if (count === 15) return { request: "15", aggregateStep: 0 };
    if (count === 60) return { request: "60", aggregateStep: 0 };
    if (count === 240) return { request: "240", aggregateStep: 0 };
    if (count < 5) return { request: "1", aggregateStep: seconds };
    if (count < 15) return { request: "5", aggregateStep: seconds };
    if (count < 60) return { request: "15", aggregateStep: seconds };
    if (count < 240) return { request: "60", aggregateStep: seconds };
    return { request: "240", aggregateStep: seconds };
  }
  if (unit === "days" && count === 1) return { request: "1D", aggregateStep: 0 };
  if (unit === "weeks" || unit === "months" || unit === "days") {
    return { request: "1D", aggregateStep: seconds };
  }
  return { request: "15", aggregateStep: 0 };
}

type Route = {
  apiSymbol: string;
  exchange: "BINANCE" | "FOREXCOM" | "FXPRO";
  kind: "crypto" | "metal";
  /** Binance stream symbol for tick proxy (e.g. PAXGUSDT for XAUUSD). */
  tickSymbol?: string;
};

const ROUTES: Readonly<Record<string, Route>> = {
  BTCUSD: { apiSymbol: "BTCUSDT", exchange: "BINANCE", kind: "crypto", tickSymbol: "BTCUSDT" },
  BTCUSDT: { apiSymbol: "BTCUSDT", exchange: "BINANCE", kind: "crypto", tickSymbol: "BTCUSDT" },
  ETHUSD: { apiSymbol: "ETHUSDT", exchange: "BINANCE", kind: "crypto", tickSymbol: "ETHUSDT" },
  ETHUSDT: { apiSymbol: "ETHUSDT", exchange: "BINANCE", kind: "crypto", tickSymbol: "ETHUSDT" },
  SOLUSD: { apiSymbol: "SOLUSDT", exchange: "BINANCE", kind: "crypto", tickSymbol: "SOLUSDT" },
  SOLUSDT: { apiSymbol: "SOLUSDT", exchange: "BINANCE", kind: "crypto", tickSymbol: "SOLUSDT" },
  BNBUSDT: { apiSymbol: "BNBUSDT", exchange: "BINANCE", kind: "crypto", tickSymbol: "BNBUSDT" },
  XRPUSD: { apiSymbol: "XRPUSDT", exchange: "BINANCE", kind: "crypto", tickSymbol: "XRPUSDT" },
  XRPUSDT: { apiSymbol: "XRPUSDT", exchange: "BINANCE", kind: "crypto", tickSymbol: "XRPUSDT" },
  ADAUSDT: { apiSymbol: "ADAUSDT", exchange: "BINANCE", kind: "crypto", tickSymbol: "ADAUSDT" },
  DOGEUSDT: { apiSymbol: "DOGEUSDT", exchange: "BINANCE", kind: "crypto", tickSymbol: "DOGEUSDT" },
  AVAXUSDT: { apiSymbol: "AVAXUSDT", exchange: "BINANCE", kind: "crypto", tickSymbol: "AVAXUSDT" },
  DOTUSDT: { apiSymbol: "DOTUSDT", exchange: "BINANCE", kind: "crypto", tickSymbol: "DOTUSDT" },
  LINKUSDT: { apiSymbol: "LINKUSDT", exchange: "BINANCE", kind: "crypto", tickSymbol: "LINKUSDT" },
  LTCUSDT: { apiSymbol: "LTCUSDT", exchange: "BINANCE", kind: "crypto", tickSymbol: "LTCUSDT" },
  MATICUSDT: { apiSymbol: "MATICUSDT", exchange: "BINANCE", kind: "crypto", tickSymbol: "MATICUSDT" },
  ATOMUSDT: { apiSymbol: "ATOMUSDT", exchange: "BINANCE", kind: "crypto", tickSymbol: "ATOMUSDT" },
  NEARUSDT: { apiSymbol: "NEARUSDT", exchange: "BINANCE", kind: "crypto", tickSymbol: "NEARUSDT" },
  UNIUSDT: { apiSymbol: "UNIUSDT", exchange: "BINANCE", kind: "crypto", tickSymbol: "UNIUSDT" },
  AAVEUSDT: { apiSymbol: "AAVEUSDT", exchange: "BINANCE", kind: "crypto", tickSymbol: "AAVEUSDT" },
  SUIUSDT: { apiSymbol: "SUIUSDT", exchange: "BINANCE", kind: "crypto", tickSymbol: "SUIUSDT" },
  APTUSDT: { apiSymbol: "APTUSDT", exchange: "BINANCE", kind: "crypto", tickSymbol: "APTUSDT" },
  ARBUSDT: { apiSymbol: "ARBUSDT", exchange: "BINANCE", kind: "crypto", tickSymbol: "ARBUSDT" },
  OPUSDT: { apiSymbol: "OPUSDT", exchange: "BINANCE", kind: "crypto", tickSymbol: "OPUSDT" },
  XAUUSD: { apiSymbol: "XAUUSD", exchange: "FOREXCOM", kind: "metal" },
  PAXGUSDT: { apiSymbol: "PAXGUSDT", exchange: "BINANCE", kind: "crypto", tickSymbol: "PAXGUSDT" },
  "GC1!": { apiSymbol: "XAUUSD", exchange: "FOREXCOM", kind: "metal" },
};

interface OhlcResponse {
  symbol?: string;
  interval?: string;
  source?: string;
  live?: boolean;
  count?: number;
  bars?: unknown[];
  detail?: string;
}

interface CryptoLatest {
  symbol: string;
  exchange?: string;
  price: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  price_change?: number;
  bar_close_time?: number;
  updated_at?: string;
}


interface ForexXau {
  symbol?: string;
  source?: string;
  price: number;
  open?: number;
  high?: number;
  low?: number;
  change_pct?: number;
  updated_at?: string;
}

function routeFor(symbol: SymbolInfo): Route | null {
  const byTicker = ROUTES[symbol.ticker.toUpperCase()];
  if (byTicker) {
    const ex = symbol.exchange.toUpperCase();
    if (ex === "FXPRO" && byTicker.kind === "metal") return { ...byTicker, exchange: "FXPRO" };
    if (ex === "FOREXCOM" && byTicker.kind === "metal") return { ...byTicker, exchange: "FOREXCOM" };
    if (ex === "BINANCE" && byTicker.kind === "metal") {
      // Explicit Binance gold listing uses PAXG, not XAU CFD.
      return { ...byTicker, exchange: "BINANCE", apiSymbol: "PAXGUSDT", tickSymbol: "PAXGUSDT", kind: "crypto" };
    }
    return byTicker;
  }
  const ex = symbol.exchange.toUpperCase();
  if (ex === "BINANCE") {
    const t = symbol.ticker.toUpperCase();
    const api = t.endsWith("USDT") ? t : t.endsWith("USD") ? `${t.slice(0, -3)}USDT` : `${t}USDT`;
    return { apiSymbol: api, exchange: "BINANCE", kind: "crypto", tickSymbol: api };
  }
  if (ex === "FXPRO" || ex === "FOREXCOM") {
    const t = symbol.ticker.toUpperCase();
    if (t === "XAUUSD" || t === "PAXGUSDT" || t === "GC1!") {
      return {
        apiSymbol: "XAUUSD",
        exchange: ex === "FXPRO" ? "FXPRO" : "FOREXCOM",
        kind: "metal",
      };
    }
  }
  return null;
}

function parseBar(row: unknown): Bar | null {
  if (Array.isArray(row) && row.length >= 5) {
    const time = Number(row[0]);
    const open = Number(row[1]);
    const high = Number(row[2]);
    const low = Number(row[3]);
    const close = Number(row[4]);
    const volume = Number(row[5] ?? 0);
    if (![time, open, high, low, close].every(Number.isFinite)) return null;
    return {
      time: time > 1e12 ? Math.floor(time / 1000) : time,
      open,
      high,
      low,
      close,
      volume: Number.isFinite(volume) ? volume : 0,
    };
  }
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const timeRaw = r.time ?? r.open_time ?? r.t;
  let time = typeof timeRaw === "number" ? timeRaw : Number(timeRaw);
  if (typeof timeRaw === "string" && !Number.isFinite(time)) {
    const ms = Date.parse(timeRaw.endsWith("Z") || timeRaw.includes("+") ? timeRaw : `${timeRaw}Z`);
    time = Number.isFinite(ms) ? Math.floor(ms / 1000) : NaN;
  }
  if (time > 1e12) time = Math.floor(time / 1000);
  const open = Number(r.open ?? r.o);
  const high = Number(r.high ?? r.h);
  const low = Number(r.low ?? r.l);
  const close = Number(r.close ?? r.c ?? r.price);
  const volume = Number(r.volume ?? r.v ?? 0);
  if (![time, open, high, low, close].every(Number.isFinite)) return null;
  return { time, open, high, low, close, volume: Number.isFinite(volume) ? volume : 0 };
}

function alignTime(tsSec: number, step: number): number {
  // step<=0 would make `%` yield NaN and crash the Charting Library (`Invalid time value`).
  if (!Number.isFinite(tsSec) || !Number.isFinite(step) || step <= 0) {
    return Number.isFinite(tsSec) ? Math.floor(tsSec) : Math.floor(Date.now() / 1000);
  }
  return tsSec - (tsSec % step);
}

/**
 * cp_fetcher chart_ws / Mongo `bct` is bar CLOSE time. TradingView bars + countdown
 * need period OPEN — otherwise 1m countdown runs ~2:00 or freezes.
 */
function closeTimeToOpen(closeSec: number, step: number): number {
  if (!Number.isFinite(closeSec) || !Number.isFinite(step) || step <= 0) {
    return alignTime(closeSec, step);
  }
  return Math.floor((closeSec - 1) / step) * step;
}

function parseUpdatedAt(raw?: string): number {
  if (!raw) return Math.floor(Date.now() / 1000);
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : Math.floor(Date.now() / 1000);
}

function applyTick(current: Bar | null, price: number, tsSec: number, step: number, volumeDelta = 0): Bar {
  const t = alignTime(tsSec, step);
  if (!current || current.time < t) {
    return { time: t, open: price, high: price, low: price, close: price, volume: Math.max(0, volumeDelta) };
  }
  if (current.time > t) return current;
  return {
    time: t,
    open: current.open,
    high: Math.max(current.high, price),
    low: Math.min(current.low, price),
    close: price,
    volume: Math.max(0, current.volume + (volumeDelta > 0 ? volumeDelta : 0)),
  };
}

/** Aggregate lower-TF bars into `stepSec` candles (standard OHLCV rollup). */
function aggregateBars(bars: readonly Bar[], stepSec: number): Bar[] {
  if (stepSec <= 1 || bars.length === 0) return [...bars];
  const out: Bar[] = [];
  let cur: Bar | null = null;
  let bucket = -1;
  for (const bar of bars) {
    const start = alignTime(bar.time, stepSec);
    if (!cur || start !== bucket) {
      if (cur) out.push(cur);
      bucket = start;
      cur = { time: start, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume };
    } else {
      cur = {
        time: start,
        open: cur.open,
        high: Math.max(cur.high, bar.high),
        low: Math.min(cur.low, bar.low),
        close: bar.close,
        volume: cur.volume + bar.volume,
      };
    }
  }
  if (cur) out.push(cur);
  return out;
}


/**
 * Reconstruct second bars from a 1m OHLC parent using the standard path:
 * bullish: O → L → H → C ; bearish: O → H → L → C
 * (avoids the linear open→close staircase that looks fake on charts).
 */
function synthesizeSecondsFromMinute(parent: Bar): Bar[] {
  const slots = 60;
  const bullish = parent.close >= parent.open;
  const p1 = parent.open;
  const p2 = bullish ? parent.low : parent.high;
  const p3 = bullish ? parent.high : parent.low;
  const p4 = parent.close;
  const out: Bar[] = [];
  let hiIdx = 0;
  let loIdx = 0;
  for (let i = 0; i < slots; i += 1) {
    const t = parent.time + i;
    let frac: number;
    let a: number;
    let b: number;
    if (i < 20) {
      frac = i / 20;
      a = p1;
      b = p2;
    } else if (i < 40) {
      frac = (i - 20) / 20;
      a = p2;
      b = p3;
    } else {
      frac = (i - 40) / 20;
      a = p3;
      b = p4;
    }
    const px = a + (b - a) * Math.min(1, Math.max(0, frac));
    const prev = i === 0 ? parent.open : out[i - 1]!.close;
    const bar: Bar = {
      time: t,
      open: prev,
      high: Math.max(prev, px),
      low: Math.min(prev, px),
      close: i === slots - 1 ? parent.close : px,
      volume: parent.volume / slots,
    };
    out.push(bar);
    if (bar.high >= out[hiIdx]!.high) hiIdx = i;
    if (bar.low <= out[loIdx]!.low) loIdx = i;
  }
  out[hiIdx] = { ...out[hiIdx]!, high: parent.high };
  out[loIdx] = { ...out[loIdx]!, low: parent.low };
  return out;
}

function synthesizeFromMinuteBars(parents: readonly Bar[], stepSec: number): Bar[] {
  const ones: Bar[] = [];
  for (const parent of parents) ones.push(...synthesizeSecondsFromMinute(parent));
  return stepSec <= 1 ? ones : aggregateBars(ones, stepSec);
}

/** Combined trade + bookTicker stream for near-broker tick latency. */
function openBinanceTickSocket(
  streamSymbol: string,
  onTrade: (price: number, qty: number, tsSec: number) => void,
): Unsubscribe {
  let closed = false;
  let socket: WebSocket | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let attempt = 0;
  const sym = streamSymbol.toLowerCase();

  const endpoints = [
    `wss://stream.binance.com:9443/stream?streams=${sym}@trade/${sym}@bookTicker`,
    `wss://data-stream.binance.vision/stream?streams=${sym}@trade/${sym}@bookTicker`,
    `wss://stream.binance.com:9443/ws/${sym}@trade`,
  ];

  const connect = (endpointIndex = 0) => {
    if (closed) return;
    const url = endpoints[Math.min(endpointIndex, endpoints.length - 1)]!;
    try {
      socket = new WebSocket(url);
    } catch {
      scheduleRetry(endpointIndex);
      return;
    }

    socket.onmessage = (event) => {
      try {
        const raw = JSON.parse(String(event.data)) as Record<string, unknown>;
        const msg = (raw.data && typeof raw.data === "object" ? raw.data : raw) as Record<string, unknown>;
        const stream = String(raw.stream ?? "");
        if (stream.includes("bookTicker") || (msg.b != null && msg.a != null && msg.p == null)) {
          const bid = Number(msg.b);
          const ask = Number(msg.a);
          if (Number.isFinite(bid) && Number.isFinite(ask) && ask > 0) {
            onTrade((bid + ask) / 2, 0, Math.floor(Date.now() / 1000));
            attempt = 0;
          }
          return;
        }
        const price = Number(msg.p ?? msg.c);
        const qty = Number(msg.q ?? 0);
        const ts = msg.T ? Math.floor(Number(msg.T) / 1000) : Math.floor(Date.now() / 1000);
        if (!Number.isFinite(price)) return;
        onTrade(price, Number.isFinite(qty) ? qty : 0, ts);
        attempt = 0;
      } catch {
        /* ignore */
      }
    };

    socket.onclose = () => {
      socket = null;
      if (!closed) scheduleRetry(endpointIndex + 1);
    };

    socket.onerror = () => {
      try {
        socket?.close();
      } catch {
        /* ignore */
      }
    };
  };

  const scheduleRetry = (nextEndpoint = 0) => {
    if (closed || retryTimer) return;
    const delay = Math.min(8_000, 250 * 2 ** Math.min(attempt, 5));
    attempt += 1;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      connect(nextEndpoint % endpoints.length);
    }, delay);
  };

  connect(0);

  return () => {
    closed = true;
    if (retryTimer) clearTimeout(retryTimer);
    try {
      socket?.close();
    } catch {
      /* ignore */
    }
  };
}

/** VPS-side tick push (Germany polled server-side → browser). */
function openMarketTicksSocket(
  channel: string,
  onTick: (price: number, tsSec: number, volume?: number) => void,
): Unsubscribe {
  let closed = false;
  let socket: WebSocket | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const connect = () => {
    if (closed || typeof window === "undefined") return;
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${proto}//${window.location.host}/market-ticks`;
    try {
      socket = new WebSocket(url);
    } catch {
      return;
    }
    socket.onopen = () => {
      socket?.send(JSON.stringify({ op: "subscribe", channel }));
    };
    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(String(event.data)) as Record<string, unknown>;
        if (String(msg.type ?? "") !== "tick") return;
        if (String(msg.channel ?? "") !== channel && msg.channel != null) return;
        const price = Number(msg.price);
        if (!Number.isFinite(price)) return;
        const ts = msg.ts ? Number(msg.ts) : Math.floor(Date.now() / 1000);
        onTick(price, ts, Number(msg.volume ?? 0));
      } catch {
        /* ignore */
      }
    };
    socket.onclose = () => {
      socket = null;
      if (!closed) {
        retryTimer = setTimeout(() => {
          retryTimer = null;
          connect();
        }, 600);
      }
    };
  };

  connect();
  return () => {
    closed = true;
    if (retryTimer) clearTimeout(retryTimer);
    try {
      socket?.close();
    } catch {
      /* ignore */
    }
  };
}

function openCpFetcherSocket(apiSymbol: string, interval: Interval, onBar: (bar: Bar) => void): Unsubscribe {
  let closed = false;
  let socket: WebSocket | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const connect = () => {
    if (closed || typeof window === "undefined") return;
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${proto}//${window.location.host}/crypto-ws`;
    try {
      socket = new WebSocket(url);
    } catch {
      return;
    }
    socket.onopen = () => {
      // cp_fetcher chart_ws accepts any symbol id present in Mongo `last`
      // (btcusdt, xauusd, eurusd, …) — interval aliases map to 1m/1h/1d.
      socket?.send(JSON.stringify({ op: "subscribe", symbol: apiSymbol, interval }));
    };
    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(String(event.data)) as Record<string, unknown>;
        const src = (msg.bar && typeof msg.bar === "object" ? msg.bar : msg) as Record<string, unknown>;
        if (String(msg.type ?? src.type ?? "") !== "bar" && src.t == null && src.c == null) return;
        const bar = parseBar({
          time: src.t ?? src.time,
          open: src.o ?? src.open,
          high: src.h ?? src.high,
          low: src.l ?? src.low,
          close: src.c ?? src.close,
          volume: src.v ?? src.volume,
        });
        if (bar) onBar(bar);
      } catch {
        /* ignore */
      }
    };
    socket.onclose = () => {
      socket = null;
      if (!closed) {
        retryTimer = setTimeout(() => {
          retryTimer = null;
          connect();
        }, 1_200);
      }
    };
  };

  connect();
  return () => {
    closed = true;
    if (retryTimer) clearTimeout(retryTimer);
    try {
      socket?.close();
    } catch {
      /* ignore */
    }
  };
}


async function fetchOhlc(apiSymbol: string, exchange: string, interval: string, limit: number): Promise<Bar[]> {
  const json = await fetchJson<OhlcResponse>(
    buildUrl(`${BASE}/ohlc/`, {
      symbol: apiSymbol,
      interval,
      limit: Math.min(MAX_BARS, Math.max(1, limit)),
      compat: "forge",
      exchange,
    }),
    { timeoutMs: REQUEST_TIMEOUT_MS },
  );
  if (json.source === "offline" || json.detail) {
    throw new Error(json.detail || `germany-market offline for ${apiSymbol}`);
  }
  return (json.bars ?? [])
    .map(parseBar)
    .filter((b): b is Bar => b !== null)
    .sort((a, b) => a.time - b.time);
}

export class GermanyMarketProvider implements MarketDataProvider {
  readonly id = "germany-market";
  readonly isSynthetic = false;

  private health: { ok: boolean; checkedAt: number } | null = null;
  /** Share the Germany forex 1 req/s budget across quotes + bar fallback. */
  private forexCache: { at: number; data: ForexXau } | null = null;

  private async fetchForexXau(force = false): Promise<ForexXau> {
    const now = Date.now();
    if (!force && this.forexCache && now - this.forexCache.at < 1_000) return this.forexCache.data;
    try {
      const fx = await fetchJson<ForexXau>(`${BASE}/forex/xauusd/`, { timeoutMs: 1_500 });
      this.forexCache = { at: now, data: fx };
      return fx;
    } catch (error) {
      // Keep serving last good FOREXCOM tick through Germany 429 windows.
      if (this.forexCache && now - this.forexCache.at < 15_000) return this.forexCache.data;
      throw error;
    }
  }

  supports(symbol: SymbolInfo, interval: Interval): boolean {
    if (routeFor(symbol) === null) return false;
    const { unit, count } = parseInterval(interval);
    if (unit === "seconds") return count >= 1 && count <= 45;
    if (unit === "minutes") return count >= 1 && count <= 720;
    if (unit === "days" || unit === "weeks" || unit === "months") return count >= 1;
    return false;
  }

  nativeIntervals(_symbol?: SymbolInfo): readonly Interval[] {
    return GERMANY_NATIVE_INTERVALS;
  }

  async fetchBars(symbol: SymbolInfo, interval: Interval, range: BarRange): Promise<Bar[]> {
    const route = routeFor(symbol);
    if (!route) throw new Error(`germany-market: unsupported ${symbol.ticker}`);
    const { unit } = parseInterval(interval);
    const step = intervalSeconds(interval);
    const germanyLimit = Math.min(MAX_BARS, Math.max(50, range.countBack + 20));

    let bars: Bar[] = [];
    if (unit === "seconds") {
      await this.assertHealthy();
      bars = await this.fetchSecondBars(route, step, germanyLimit, range);
    } else {
      // Prefer VPS Mongo deep history (20k/10k/5k + `before` paging). Germany `/ohlc/`
      // only returns the latest ~1–2k and cannot page older windows.
      if (mongoHistoryPlan(interval)) {
        try {
          bars = await fetchCpChartHistory(route.apiSymbol, interval, range);
        } catch {
          bars = [];
        }
      }
      if (!bars.length) {
        await this.assertHealthy();
        bars = await this.fetchOhlcBars(route, interval, germanyLimit);
      } else if (bars.length < Math.min(range.countBack, 50)) {
        // Mongo thin on this page — splice in recent Germany bars if available.
        try {
          await this.assertHealthy();
          const recent = await this.fetchOhlcBars(route, interval, germanyLimit);
          const byTime = new Map<number, Bar>();
          for (const b of [...bars, ...recent]) byTime.set(b.time, b);
          bars = [...byTime.values()].sort((a, b) => a.time - b.time);
        } catch {
          /* keep mongo bars */
        }
      }
    }

    if (!bars.length) {
      throw new Error(`germany-market: empty history for ${route.apiSymbol} @ ${interval}`);
    }

    // Exclusive `to`: bars at/after `to` belong to already-loaded pages.
    // Return [] (noData) — do NOT throw, or synthetic would invent fake history
    // and TradingView would keep paging forever.
    const filtered = bars.filter((b) => b.time < range.to).sort((a, b) => a.time - b.time);
    if (!filtered.length) return [];
    return filtered.slice(-Math.max(range.countBack, 1));
  }

  subscribeBars(symbol: SymbolInfo, interval: Interval, onBar: (bar: Bar) => void): Unsubscribe {
    const route = routeFor(symbol);
    if (!route) return () => {};
    const step = intervalSeconds(interval);
    const disposers: Unsubscribe[] = [];
    let current: Bar | null = null;
    let lastEmittedClose = Number.NaN;
    let lastEmittedTime = -1;
    let lastTickMs = 0;
    let readyForTicks = false;
    const pendingTicks: Array<{ price: number; tsSec: number; volumeDelta: number }> = [];

    const emit = (bar: Bar) => {
      current = bar;
      if (bar.time === lastEmittedTime && bar.close === lastEmittedClose) return;
      lastEmittedTime = bar.time;
      lastEmittedClose = bar.close;
      onBar(bar);
    };

    const onTick = (price: number, tsSec: number, volumeDelta = 0) => {
      // Market closed → no new forming candles (TradingView freezes the series).
      if (!isMarketSessionOpen(symbol)) return;
      // Stale timestamps must not roll the series into empty future candles.
      const maxAgeSec = Math.max(45, step * 3);
      if (Math.abs(Date.now() / 1000 - tsSec) > maxAgeSec) return;
      lastTickMs = Date.now();
      if (!readyForTicks) {
        pendingTicks.push({ price, tsSec, volumeDelta });
        if (pendingTicks.length > 50) pendingTicks.shift();
        return;
      }
      emit(applyTick(current, price, tsSec, step, volumeDelta));
    };

    // Seed forming bar from real OHLC before applying live ticks (avoids flat O=H=L=C).
    void (async () => {
      try {
        const seed = await this.fetchBars(symbol, interval, {
          from: Math.floor(Date.now() / 1000) - step * 5,
          to: Math.floor(Date.now() / 1000) + 1,
          countBack: 3,
        });
        const last = seed[seed.length - 1];
        if (last) emit({ ...last, time: alignTime(last.time, step) });
      } catch {
        /* ticks will create */
      } finally {
        readyForTicks = true;
        if (isMarketSessionOpen(symbol)) {
          for (const tick of pendingTicks.splice(0)) {
            emit(applyTick(current, tick.price, tick.tsSec, step, tick.volumeDelta));
          }
        } else {
          pendingTicks.length = 0;
        }
      }
    })();

    // Seconds charts: only carry the series forward while live ticks are flowing.
    // Never invent candles when the market is closed or the feed is quiet.
    if (parseInterval(interval).unit === "seconds" && typeof window !== "undefined") {
      const quietMs = Math.max(2_000, step * 2_000);
      const clock = window.setInterval(() => {
        if (!isMarketSessionOpen(symbol)) return;
        if (Date.now() - lastTickMs > quietMs) return;
        const lastPrice = current?.close;
        if (!Number.isFinite(lastPrice)) return;
        const tsSec = Math.floor(Date.now() / 1000);
        const bucket = alignTime(tsSec, step);
        if (!current || current.time < bucket) {
          emit({ time: bucket, open: lastPrice!, high: lastPrice!, low: lastPrice!, close: lastPrice!, volume: 0 });
        }
      }, Math.min(250, Math.max(50, (step * 1000) / 4)));
      disposers.push(() => clearInterval(clock));
    }

    // Binance tick stream (crypto + PAXG proxy for gold/FXPRO/FOREXCOM XAU).
    if (route.tickSymbol) {
      disposers.push(
        openBinanceTickSocket(route.tickSymbol, (price, qty, ts) => {
          onTick(price, ts, qty);
        }),
      );
    }

    // VPS market-ticks (TradingView quote feed primary; Germany/Mongo fallback).
    const channel =
      route.kind === "metal" ? `forex:xauusd:${route.exchange}` : `crypto:${route.apiSymbol.toLowerCase()}`;
    disposers.push(
      openMarketTicksSocket(channel, (price, ts, vol) => {
        onTick(price, ts, vol ?? 0);
      }),
    );

    // cp_fetcher chart_ws — crypto + metals (xauusd etc. live in Mongo from TV).
    // lastTickMs is owned by real ticks only — Mongo must never fake "liveness"
    // or the series would keep minting empty candles when the feed is quiet.
    disposers.push(
      openCpFetcherSocket(route.apiSymbol, interval, (bar) => {
        if (!isMarketSessionOpen(symbol)) return;
        // chart_ws `t` is bar_close_time — convert to period open for countdown.
        const openTime = closeTimeToOpen(bar.time, step);
        const aligned = { ...bar, time: openTime };
        const quietMs = Math.max(5_000, step * 1_000);
        const quiet = lastTickMs === 0 || Date.now() - lastTickMs > quietMs;
        const wallBucket = alignTime(Math.floor(Date.now() / 1000), step);

        const mergeSame = (base: Bar, next: Bar, closeFrom: "tick" | "mongo"): Bar => ({
          time: next.time,
          open: base.open || next.open,
          high: Math.max(base.high, next.high, closeFrom === "tick" ? base.close : next.close),
          low: Math.min(base.low, next.low, closeFrom === "tick" ? base.close : next.close),
          close: closeFrom === "tick" ? base.close : next.close,
          volume: Math.max(base.volume, next.volume),
        });

        // Prefer raw ticks when they are fresh.
        if (lastTickMs > 0 && Date.now() - lastTickMs < 400) {
          if (current && aligned.time === current.time) {
            emit(mergeSame(current, aligned, "tick"));
          }
          return;
        }

        // Feed quiet → freeze like TradingView: update the printed bar only, never roll.
        if (quiet) {
          if (current && aligned.time === current.time) {
            emit(mergeSame(current, aligned, "mongo"));
          }
          return;
        }

        if (aligned.time > wallBucket) return;
        if (!current || aligned.time > current.time) {
          emit(aligned);
          return;
        }
        if (aligned.time === current.time) {
          emit(mergeSame(current, aligned, "mongo"));
        }
      }),
    );

    // HTTP poll fallback — only when WS paths have been quiet.
    if (route.kind === "crypto") {
      disposers.push(
        startPolling(async () => {
          if (!isMarketSessionOpen(symbol)) return;
          if (Date.now() - lastTickMs < 450) return;
          const latest = await fetchJson<CryptoLatest>(
            buildUrl(`${BASE}/crypto/prices/${encodeURIComponent(route.apiSymbol.toLowerCase())}/`, {
              timeframe: "1s",
            }),
            { timeoutMs: 1_200 },
          );
          const price = +latest.price;
          if (!Number.isFinite(price)) return;
          const ts = parseUpdatedAt(latest.updated_at);
          // Ignore stale API snapshots (weekend / halted feed).
          if (Math.abs(Date.now() / 1000 - ts) > Math.max(30, step * 2)) return;
          onTick(price, ts, 0);
        }, TICK_POLL_MS),
      );
    } else {
      disposers.push(
        startPolling(async () => {
          if (!isMarketSessionOpen(symbol)) return;
          if (Date.now() - lastTickMs < 1_800) return;
          const fx = await this.fetchForexXau();
          const price = +fx.price;
          if (!Number.isFinite(price)) return;
          const ts = parseUpdatedAt(fx.updated_at);
          if (Math.abs(Date.now() / 1000 - ts) > Math.max(30, step * 2)) return;
          onTick(price, ts, 0);
        }, FOREX_POLL_MS),
      );
    }

    disposers.push(
      startPolling(async () => {
        try {
          if (!isMarketSessionOpen(symbol)) return;
          const seed = await this.fetchBars(symbol, interval, {
            from: Math.floor(Date.now() / 1000) - step * 3,
            to: Math.floor(Date.now() / 1000) + 1,
            countBack: 2,
          });
          const last = seed[seed.length - 1];
          if (!last) return;
          const aligned = { ...last, time: alignTime(last.time, step) };
          // Without live ticks, never roll into a new candle from history reconcile.
          const quietMs = Math.max(5_000, step * 1_000);
          const quiet = lastTickMs === 0 || Date.now() - lastTickMs > quietMs;
          if (quiet) return;
          if (!current || aligned.time > current.time) {
            emit(aligned);
            return;
          }
          if (aligned.time === current.time) {
            emit({
              time: aligned.time,
              open: aligned.open,
              high: Math.max(aligned.high, current.high, current.close),
              low: Math.min(aligned.low, current.low, current.close),
              close: current.close,
              volume: Math.max(aligned.volume, current.volume),
            });
          }
        } catch {
          /* ignore */
        }
      }, BAR_RECONCILE_MS),
    );

    return () => {
      for (const stop of disposers) stop();
    };
  }

  async fetchQuotes(symbols: readonly SymbolInfo[]): Promise<Quote[]> {
    if (!(await this.isHealthy())) return [];
    const now = Math.floor(Date.now() / 1000);
    const out: Quote[] = [];
    const cryptoWanted = new Map<string, string>();
    const xauTickers: string[] = [];

    for (const s of symbols) {
      const route = routeFor(s);
      if (!route) continue;
      if (route.kind === "metal") xauTickers.push(s.ticker);
      else cryptoWanted.set(route.apiSymbol.toLowerCase(), s.ticker);
    }

    if (cryptoWanted.size) {
      if (cryptoWanted.size > 4) {
        try {
          const json = await fetchJson<{ results?: CryptoLatest[] }>(
            buildUrl(`${BASE}/crypto/prices/`, { timeframe: "1s", exchange: "binance", page_size: 100 }),
            { timeoutMs: 2_000 },
          );
          for (const row of json.results ?? []) {
            const ticker = cryptoWanted.get(String(row.symbol ?? "").toLowerCase());
            if (!ticker) continue;
            out.push({
              ticker,
              price: +row.price,
              changePercent: +(row.price_change ?? 0),
              updatedAt: now,
              synthetic: false,
            });
          }
        } catch {
          /* fall through */
        }
      }
      if (out.length === 0) {
        const settled = await Promise.allSettled(
          [...cryptoWanted.entries()].map(async ([apiSym, ticker]) => {
            const latest = await fetchJson<CryptoLatest>(
              buildUrl(`${BASE}/crypto/prices/${encodeURIComponent(apiSym)}/`, { timeframe: "1s" }),
              { timeoutMs: 1_500 },
            );
            return {
              ticker,
              price: +latest.price,
              changePercent: +(latest.price_change ?? 0),
              updatedAt: now,
              synthetic: false,
            } satisfies Quote;
          }),
        );
        for (const result of settled) {
          if (result.status === "fulfilled" && Number.isFinite(result.value.price)) out.push(result.value);
        }
      }
    }

    if (xauTickers.length) {
      try {
        const fx = await this.fetchForexXau();
        if (Number.isFinite(+fx.price)) {
          for (const ticker of xauTickers) {
            out.push({
              ticker,
              price: +fx.price,
              changePercent: +(fx.change_pct ?? 0),
              updatedAt: now,
              synthetic: false,
            });
          }
        }
      } catch {
        /* ignore */
      }
    }

    return out;
  }

  /** Fresh minute+ history from Germany `/ohlc/` (never the stale crypto /history/ archive). */
  private async fetchOhlcBars(route: Route, interval: Interval, limit: number): Promise<Bar[]> {
    const plan = ohlcPlan(interval);
    const requestLimit =
      plan.aggregateStep > 0 ? Math.min(MAX_BARS, Math.max(limit * 12, limit + 30)) : Math.min(MAX_BARS, limit);
    const raw = await fetchOhlc(route.apiSymbol, route.exchange, plan.request, requestLimit);
    if (plan.aggregateStep > 0) return aggregateBars(raw, plan.aggregateStep);
    return raw;
  }

  /**
   * Seconds history: synthesize from fresh 1m `/ohlc/` only.
   * Do not splice Germany `/history/?timeframe=1s` — that archive lags by many minutes
   * and produced gaps + staircase garbage when mixed with live ticks.
   */
  private async fetchSecondBars(
    route: Route,
    step: number,
    limit: number,
    range: BarRange,
  ): Promise<Bar[]> {
    const parentNeed = Math.min(MAX_BARS, Math.ceil((limit * step) / 60) + 10);
    const parents = await fetchOhlc(route.apiSymbol, route.exchange, "1", parentNeed);
    if (!parents.length) throw new Error(`germany-market: no 1m parents for ${route.apiSymbol}`);
    const bars = synthesizeFromMinuteBars(parents, step);
    return bars.filter((b) => b.time < range.to).slice(-Math.max(limit, 1));
  }

  private async isHealthy(): Promise<boolean> {
    const now = Date.now();
    if (this.health && now - this.health.checkedAt < HEALTH_TTL_MS) return this.health.ok;
    try {
      const data = await fetchJson<{ status?: string }>(`${BASE}/health/`, { timeoutMs: 2_000 });
      this.health = { ok: data.status === "ok", checkedAt: now };
    } catch {
      this.health = { ok: false, checkedAt: now };
    }
    return this.health.ok;
  }

  private async assertHealthy(): Promise<void> {
    if (!(await this.isHealthy())) throw new Error("germany-market is unavailable");
  }
}
