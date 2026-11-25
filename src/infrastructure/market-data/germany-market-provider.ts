import { intervalSeconds, parseInterval, isFxDailyBreak, isMarketSessionOpen, SESSION_FX, type Bar, type BarRange, type Interval, type Quote, type SymbolInfo } from "@/domain";
import type { MarketDataProvider, Unsubscribe } from "@/application";
import { buildUrl, fetchJson } from "../http/fetch-json";
import { startPolling } from "./polling";
import {
  alignFxDailyBars,
  alignFxSessionDailyTime,
  fetchCpChartHistory,
  mongoHistoryPlan,
} from "./cp-chart-history";
import { isLiveHistoryPage } from "./history-page";
import { densifySessionBars, liveCarryBars } from "./session-fill";
import { aggregateBars, synthesizeFromMinuteBars } from "./synthesize-seconds";
import { volumeDelta, type VolumeCursor } from "./volume-delta";

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
const FOREX_POLL_MS = 400;
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
  exchange: "BINANCE" | "FOREXCOM" | "FXPRO" | "FXCM";
  /** metal/crypto use Germany `/ohlc/`; forex is Mongo-only (`/crypto-chart`). */
  kind: "crypto" | "metal" | "forex";
  /** Binance stream symbol for tick proxy (e.g. PAXGUSDT for XAUUSD). */
  tickSymbol?: string;
};

/** FX majors mirrored in VPS Mongo — keep charts alive when `/tv-history` 502s. */
const MONGO_FX_TICKERS = new Set([
  "EURUSD",
  "GBPUSD",
  "USDJPY",
  "AUDUSD",
  "USDCHF",
  "USDCAD",
  "NZDUSD",
  "EURGBP",
  "EURJPY",
  "GBPJPY",
  "USOIL",
  "XAGUSD",
]);

function metalBrokerTag(ex: string): "FOREXCOM" | "FXPRO" | "FXCM" {
  const u = ex.toUpperCase();
  if (u === "FXPRO") return "FXPRO";
  if (u === "FXCM") return "FXCM";
  return "FOREXCOM";
}

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

/** Brokers that share the Germany FOREXCOM gold book (labels only for CFD venues). */
const METAL_CFD_EXCHANGES = new Set([
  "FOREXCOM",
  "FXPRO",
  "FXCM",
  "OANDA",
  "PEPPERSTONE",
  "IG",
  "CAPITALCOM",
]);

function routeFor(symbol: SymbolInfo): Route | null {
  const byTicker = ROUTES[symbol.ticker.toUpperCase()];
  if (byTicker) {
    const ex = symbol.exchange.toUpperCase();
    if (byTicker.kind === "metal") {
      if (ex === "BINANCE") {
        // Explicit Binance gold listing uses PAXG, not XAU CFD.
        return {
          ...byTicker,
          exchange: "BINANCE",
          apiSymbol: "PAXGUSDT",
          tickSymbol: "PAXGUSDT",
          kind: "crypto",
        };
      }
      if (!ex || METAL_CFD_EXCHANGES.has(ex)) {
        return { ...byTicker, exchange: metalBrokerTag(ex || "FOREXCOM") };
      }
      return null;
    }
    if (byTicker.kind === "crypto") {
      if (ex && ex !== "BINANCE") return null;
      return byTicker;
    }
    return byTicker;
  }
  const ex = symbol.exchange.toUpperCase();
  if (ex === "BINANCE") {
    const t = symbol.ticker.toUpperCase();
    const api = t.endsWith("USDT") ? t : t.endsWith("USD") ? `${t.slice(0, -3)}USDT` : `${t}USDT`;
    return { apiSymbol: api, exchange: "BINANCE", kind: "crypto", tickSymbol: api };
  }
  if (METAL_CFD_EXCHANGES.has(ex)) {
    const t = symbol.ticker.toUpperCase();
    if (t === "XAUUSD" || t === "PAXGUSDT" || t === "GC1!") {
      return {
        apiSymbol: "XAUUSD",
        exchange: metalBrokerTag(ex),
        kind: "metal",
      };
    }
    // FX majors / oil / silver live in Mongo alongside gold. Prefer that path so
    // a market_ticks restart (which takes `/tv-history` down) does not blank the chart.
    if (MONGO_FX_TICKERS.has(t)) {
      return {
        apiSymbol: t,
        exchange: metalBrokerTag(ex),
        kind: "forex",
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

function parseUpdatedAt(raw?: string): number {
  if (!raw) return Math.floor(Date.now() / 1000);
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : Math.floor(Date.now() / 1000);
}

function applyTick(
  current: Bar | null,
  price: number,
  tsSec: number,
  step: number,
  volumeDelta = 0,
  /** FX 1D must sit on 22:00 UTC — midnight floor invents a premature daily candle. */
  fxDaily = false,
): Bar {
  const nowSec = Math.floor(Date.now() / 1000);
  const wallBucket = fxDaily ? alignFxSessionDailyTime(nowSec) : alignTime(nowSec, step);
  void tsSec;
  const vol = Math.max(0, volumeDelta);
  // Always the wall-clock forming bar. Quote `t` is often the previous period
  // or a future period-close; Charting Library ignores those updates.
  if (!current || current.time !== wallBucket) {
    const open = current && current.time < wallBucket ? current.close : price;
    return {
      time: wallBucket,
      open,
      high: Math.max(open, price),
      low: Math.min(open, price),
      close: price,
      volume: vol,
    };
  }
  return {
    time: wallBucket,
    open: current.open,
    high: Math.max(current.high, price),
    low: Math.min(current.low, price),
    close: price,
    volume: Math.max(0, current.volume + vol),
  };
}

const BROKER_HISTORY = "/tv-history";

/**
 * A missing stretch the broker still printed. The one-hour New York pause and
 * the weekend are real closes, so those stay empty.
 */
function isFillableHole(prevSec: number, nextSec: number, stepSec: number): boolean {
  const gap = nextSec - prevSec;
  if (!(gap > stepSec * 1.5)) return false;
  if (gap >= 12 * 3_600) return false;
  if (gap <= 90 * 60 && isFxDailyBreak(prevSec + Math.floor(gap / 2))) return false;
  return true;
}

/**
 * Mid-session holes in Mongo (live writer outages) look like empty space on the chart.
 * The broker series stays continuous through those minutes.
 */
function hasMidSessionHoles(bars: readonly Bar[], stepSec: number): boolean {
  if (bars.length < 2 || stepSec <= 0 || stepSec >= 86_400) return false;
  for (let i = 1; i < bars.length; i += 1) {
    if (isFillableHole(bars[i - 1]!.time, bars[i]!.time, stepSec)) return true;
  }
  return false;
}

/** Keep the stored candle. Insert a broker candle only where that store skipped the time. */
export function fillInsideHoles(primary: readonly Bar[], fill: readonly Bar[], stepSec: number): Bar[] {
  if (primary.length < 2 || fill.length === 0) return [...primary];
  const holes: Array<[number, number]> = [];
  for (let i = 1; i < primary.length; i += 1) {
    const prev = primary[i - 1]!.time;
    const next = primary[i]!.time;
    if (isFillableHole(prev, next, stepSec)) holes.push([prev, next]);
  }
  if (!holes.length) return [...primary];
  const extra = fill.filter((bar) => holes.some(([start, end]) => bar.time > start && bar.time < end));
  if (!extra.length) return [...primary];
  return mergeBarsPreferPrimary(primary, extra);
}

async function fetchBrokerMinutes(apiSymbol: string, fromSec: number, toSec: number): Promise<Bar[]> {
  const count = Math.min(10_000, Math.ceil(Math.max(60, toSec - fromSec) / 60) + 30);
  const json = await fetchJson<OhlcResponse>(
    buildUrl(BROKER_HISTORY, {
      symbol: `FOREXCOM:${apiSymbol}`,
      resolution: "1",
      count,
      before: toSec,
    }),
    { timeoutMs: 20_000 },
  );
  return (json.bars ?? [])
    .map(parseBar)
    .filter((bar): bar is Bar => bar !== null)
    .filter((bar) => bar.time >= fromSec - 60 && bar.time < toSec)
    .sort((a, b) => a.time - b.time);
}

/**
 * Stored candles whose ranges do not meet. The broker printed the prices in
 * between; the live writer dropped them, so the chart shows a gap.
 */
export function brokerGapWindows(bars: readonly Bar[], stepSec: number): Array<[number, number]> {
  if (bars.length < 2 || stepSec <= 0 || stepSec >= 86_400) return [];
  const windows: Array<[number, number]> = [];
  for (let i = 1; i < bars.length; i += 1) {
    const prev = bars[i - 1]!;
    const next = bars[i]!;
    const dt = next.time - prev.time;
    // Weekend and the 17:00 New York pause are real closes. Leave those.
    if (dt <= 0 || dt >= 12 * 3_600) continue;
    if (dt <= 90 * 60 && isFxDailyBreak(prev.time + Math.floor(dt / 2))) continue;
    const scale = Math.max(Math.abs(prev.close), Math.abs(next.close), 1);
    const eps = scale * 1e-8;
    const disjoint = next.low > prev.high + eps || prev.low > next.high + eps;
    if (!disjoint) continue;
    const from = bars[Math.max(0, i - 2)]!.time;
    const to = bars[Math.min(bars.length - 1, i + 1)]!.time + stepSec;
    const last = windows[windows.length - 1];
    if (last && from <= last[1] + 6 * 3_600) last[1] = Math.max(last[1], to);
    else windows.push([from, to]);
  }
  return windows.slice(-6);
}

/**
 * Copy the broker candle onto a stored candle that left a price gap.
 * High and low keep whichever print went further. Open and close follow the broker.
 * Times the store never had are not added here.
 */
export function overlayBrokerCandles(
  primary: readonly Bar[],
  broker: readonly Bar[],
  fromSec: number,
  toSec: number,
): Bar[] {
  if (broker.length === 0) return [...primary];
  const byTime = new Map<number, Bar>();
  for (const bar of broker) {
    if (bar.time >= fromSec && bar.time < toSec) byTime.set(bar.time, bar);
  }
  if (byTime.size === 0) return [...primary];
  return primary.map((bar) => {
    const src = byTime.get(bar.time);
    if (!src) return bar;
    return {
      time: bar.time,
      open: src.open,
      high: Math.max(bar.high, src.high),
      low: Math.min(bar.low, src.low),
      close: src.close,
      volume: bar.volume > 0 ? bar.volume : src.volume,
    };
  });
}

/** Copy broker candles into Mongo holes. Stored prices stay as they are. */
async function spliceBrokerHoles(apiSymbol: string, bars: Bar[], stepSec: number): Promise<Bar[]> {
  if (!hasMidSessionHoles(bars, stepSec)) return bars;
  let from = Number.POSITIVE_INFINITY;
  let to = 0;
  for (let i = 1; i < bars.length; i += 1) {
    if (!isFillableHole(bars[i - 1]!.time, bars[i]!.time, stepSec)) continue;
    from = Math.min(from, bars[i - 1]!.time);
    to = Math.max(to, bars[i]!.time);
  }
  if (to <= from) return bars;
  try {
    let fill = await fetchBrokerMinutes(apiSymbol, from, to + stepSec);
    if (stepSec > 60) fill = aggregateBars(fill, stepSec);
    return fillInsideHoles(bars, fill, stepSec);
  } catch {
    return bars;
  }
}

/** Replace gapped candles with the broker's own range so the chart meets where the broker meets. */
async function repairBrokerPriceGaps(apiSymbol: string, bars: Bar[], stepSec: number): Promise<Bar[]> {
  const windows = brokerGapWindows(bars, stepSec);
  if (!windows.length) return bars;
  let out = bars;
  for (const [from, to] of windows) {
    try {
      let fill = await fetchBrokerMinutes(apiSymbol, from, to);
      if (stepSec > 60) fill = aggregateBars(fill, stepSec);
      out = overlayBrokerCandles(out, fill, from, to);
    } catch {
      /* keep the stored candles */
    }
  }
  return out;
}

function mergeBarsPreferPrimary(primary: readonly Bar[], fill: readonly Bar[]): Bar[] {
  const byTime = new Map<number, Bar>();
  for (const b of fill) byTime.set(b.time, b);
  for (const b of primary) byTime.set(b.time, b);
  return [...byTime.values()].sort((a, b) => a.time - b.time);
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

/**
 * One `/market-ticks` socket for every pane. A multi-chart layout used to open
 * a socket per layer; the host caps those connections, and the 30s pane (opened
 * last) never received a price.
 */
type MarketTickFn = (price: number, tsSec: number, volume?: number) => void;
const marketTickListeners = new Map<string, Set<MarketTickFn>>();
let marketTickSocket: WebSocket | null = null;
let marketTickRetry: ReturnType<typeof setTimeout> | null = null;

function marketTickUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/market-ticks`;
}

function sendMarketTickSubscribes(): void {
  const socket = marketTickSocket;
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  for (const channel of marketTickListeners.keys()) {
    socket.send(JSON.stringify({ op: "subscribe", channel }));
  }
}

function ensureMarketTickSocket(): void {
  if (typeof window === "undefined") return;
  if (
    marketTickSocket &&
    (marketTickSocket.readyState === WebSocket.OPEN || marketTickSocket.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }
  let socket: WebSocket;
  try {
    socket = new WebSocket(marketTickUrl());
  } catch {
    scheduleMarketTickRetry();
    return;
  }
  marketTickSocket = socket;
  socket.onopen = () => sendMarketTickSubscribes();
  socket.onmessage = (event) => {
    try {
      const msg = JSON.parse(String(event.data)) as Record<string, unknown>;
      if (String(msg.type ?? "") !== "tick") return;
      const price = Number(msg.price);
      if (!Number.isFinite(price)) return;
      let ts = Number(msg.ts);
      if (ts > 1e12) ts = Math.floor(ts / 1000);
      if (!Number.isFinite(ts) || ts <= 0) ts = Math.floor(Date.now() / 1000);
      const volume = Number(msg.volume ?? 0);
      const channel = String(msg.channel ?? "");
      const targets = channel ? marketTickListeners.get(channel) : null;
      const listeners = targets ?? (channel ? null : new Set([...marketTickListeners.values()].flatMap((set) => [...set])));
      if (!listeners) return;
      for (const fn of listeners) fn(price, ts, volume);
    } catch {
      /* ignore */
    }
  };
  socket.onclose = () => {
    if (marketTickSocket === socket) marketTickSocket = null;
    if (marketTickListeners.size > 0) scheduleMarketTickRetry();
  };
}

function scheduleMarketTickRetry(): void {
  if (marketTickRetry) return;
  marketTickRetry = setTimeout(() => {
    marketTickRetry = null;
    if (marketTickListeners.size > 0) ensureMarketTickSocket();
  }, 600);
}

function openMarketTicksSocket(channel: string, onTick: MarketTickFn): Unsubscribe {
  let set = marketTickListeners.get(channel);
  if (!set) {
    set = new Set();
    marketTickListeners.set(channel, set);
  }
  set.add(onTick);
  ensureMarketTickSocket();
  if (marketTickSocket?.readyState === WebSocket.OPEN) {
    marketTickSocket.send(JSON.stringify({ op: "subscribe", channel }));
  }
  return () => {
    set?.delete(onTick);
    if (set && set.size === 0) marketTickListeners.delete(channel);
    if (marketTickListeners.size === 0) {
      if (marketTickRetry) clearTimeout(marketTickRetry);
      marketTickRetry = null;
      try {
        marketTickSocket?.close();
      } catch {
        /* ignore */
      }
      marketTickSocket = null;
    }
  };
}

/**
 * chart_ws keeps one symbol/interval per connection, so panes on the same
 * book share a socket and a different timeframe opens its own.
 */
type CpBarFn = (bar: Bar) => void;
interface CpHub {
  socket: WebSocket | null;
  listeners: Set<CpBarFn>;
  retry: ReturnType<typeof setTimeout> | null;
  symbol: string;
  interval: string;
}
const cpHubs = new Map<string, CpHub>();

function connectCpHub(key: string, hub: CpHub): void {
  if (typeof window === "undefined" || hub.listeners.size === 0) return;
  if (hub.socket && (hub.socket.readyState === WebSocket.OPEN || hub.socket.readyState === WebSocket.CONNECTING)) {
    return;
  }
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  let socket: WebSocket;
  try {
    socket = new WebSocket(`${proto}//${window.location.host}/crypto-ws`);
  } catch {
    return;
  }
  hub.socket = socket;
  socket.onopen = () => {
    socket.send(JSON.stringify({ op: "subscribe", symbol: hub.symbol, interval: hub.interval }));
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
      if (!bar) return;
      for (const fn of hub.listeners) fn(bar);
    } catch {
      /* ignore */
    }
  };
  socket.onclose = () => {
    if (hub.socket === socket) hub.socket = null;
    if (!cpHubs.has(key) || hub.listeners.size === 0 || hub.retry) return;
    hub.retry = setTimeout(() => {
      hub.retry = null;
      connectCpHub(key, hub);
    }, 1_200);
  };
}

function openCpFetcherSocket(apiSymbol: string, interval: Interval, onBar: CpBarFn): Unsubscribe {
  const key = `${apiSymbol}|${interval}`;
  let hub = cpHubs.get(key);
  if (!hub) {
    hub = { socket: null, listeners: new Set(), retry: null, symbol: apiSymbol, interval: String(interval) };
    cpHubs.set(key, hub);
    connectCpHub(key, hub);
  }
  hub.listeners.add(onBar);
  return () => {
    const current = cpHubs.get(key);
    if (!current) return;
    current.listeners.delete(onBar);
    if (current.listeners.size > 0) return;
    if (current.retry) clearTimeout(current.retry);
    try {
      current.socket?.close();
    } catch {
      /* ignore */
    }
    cpHubs.delete(key);
  };
}


async function fetchOhlc(
  apiSymbol: string,
  exchange: string,
  interval: string,
  limit: number,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<Bar[]> {
  const json = await fetchJson<OhlcResponse>(
    buildUrl(`${BASE}/ohlc/`, {
      symbol: apiSymbol,
      interval,
      limit: Math.min(MAX_BARS, Math.max(1, limit)),
      compat: "forge",
      exchange,
    }),
    { timeoutMs },
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
    if (!force && this.forexCache && now - this.forexCache.at < 400) return this.forexCache.data;
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
    const { unit, count } = parseInterval(interval);
    const step = intervalSeconds(interval);
    const germanyLimit = Math.min(MAX_BARS, Math.max(50, range.countBack + 20));

    let bars: Bar[] = [];
    if (unit === "seconds") {
      bars = await this.fetchSecondBars(route, step, germanyLimit, range);
    } else {
      // Mongo only on the paint path (~0.5s). Waiting on `/ohlc/` (1–3s, often 499)
      // made every TF switch slower than before. In-session holes are filled
      // locally in presentCandleSeries.
      if (mongoHistoryPlan(interval)) {
        try {
          bars = await fetchCpChartHistory(route.apiSymbol, interval, range, {
            fxSession: route.kind === "forex" || route.kind === "metal",
          });
        } catch {
          bars = [];
        }
      }
      if (!bars.length && route.kind !== "forex") {
        bars = await this.fetchOhlcBars(route, interval, germanyLimit, 800).catch(() => [] as Bar[]);
      }
    }

    if (!bars.length) {
      // Forex: soft-miss so the provider chain can try `/tv-history` / Yahoo.
      if (route.kind === "forex") return [];
      throw new Error(`germany-market: empty history for ${route.apiSymbol} @ ${interval}`);
    }

    // Exclusive `to`: bars at/after `to` belong to already-loaded pages.
    // Return [] (noData) — do NOT throw, or synthetic would invent fake history
    // and TradingView would keep paging forever.
    // `to <= 0` means “latest window” (TV first request sometimes sends 0).
    const before = range.to > 0 ? range.to : Number.POSITIVE_INFINITY;
    let filtered = bars.filter((b) => b.time < before).sort((a, b) => a.time - b.time);
    // Germany `/ohlc/` 1D is midnight UTC — snap FX/metals onto the 22:00 grid.
    // Crypto and other 24h books stay on midnight so they match the live candle.
    if (unit === "days" && count === 1 && (route.kind === "forex" || route.kind === "metal")) {
      filtered = alignFxDailyBars(filtered).filter((b) => b.time < before);
    }
    if (!filtered.length) return [];
    return filtered.slice(-Math.max(range.countBack, 1));
  }

  subscribeBars(symbol: SymbolInfo, interval: Interval, onBar: (bar: Bar) => void): Unsubscribe {
    const route = routeFor(symbol);
    if (!route) return () => {};
    const step = intervalSeconds(interval);
    const { unit, count } = parseInterval(interval);
    // History already snaps 1D onto 22:00 UTC; live ticks must use the same grid
    // or `alignTime(..., 86400)` opens a midnight candle that looks "new" on Daily.
    // Seconds history is the 1m candle drawn as a clean path. Raw ticks, and the
    // 1m bar the socket sends for a "30S" subscribe, were painted onto the
    // forming slot — a wick from the whole minute on a 30s body. Refresh
    // replaced that with the path. Live updates use the same path.
    if (unit === "seconds") {
      return this.subscribeSecondBars(symbol, route, step, onBar);
    }
    const fxDaily =
      unit === "days" && count === 1 && (route.kind === "forex" || route.kind === "metal");
    const disposers: Unsubscribe[] = [];
    let current: Bar | null = null;
    let lastEmittedClose = Number.NaN;
    let lastEmittedTime = -1;
    let lastTickMs = 0;
    let lastSocketMs = 0;
    // TV quote volume is the session total. Keep only the increment so a busy
    // 5m print is not copied, at the same size, onto the 4h candle.
    const quoteVolume: VolumeCursor = { last: null };

    const emit = (bar: Bar) => {
      const wall = wallBucketAt(Math.floor(Date.now() / 1000));
      const next = bar.time > wall ? { ...bar, time: wall } : bar;
      current = next;
      if (next.time === lastEmittedTime && next.close === lastEmittedClose) return;
      lastEmittedTime = next.time;
      lastEmittedClose = next.close;
      onBar(next);
    };

    const wallBucketAt = (tsSec: number) =>
      fxDaily ? alignFxSessionDailyTime(tsSec) : alignTime(tsSec, step);

    const carryTo = (bucket: number, includeTarget: boolean) => {
      if (!current || bucket <= current.time) return;
      for (const bar of liveCarryBars(symbol, current, bucket, step, includeTarget)) emit(bar);
    };

    const onTick = (price: number, tsSec: number, volumeDelta = 0) => {
      // Market closed → no new forming candles (TradingView freezes the series).
      if (!isMarketSessionOpen(symbol)) return;
      const nowSec = Math.floor(Date.now() / 1000);
      let ts = tsSec;
      if (!Number.isFinite(ts) || ts <= 0 || ts > nowSec + 2) ts = nowSec;
      // Late quotes still move the forming close; only drop a dead feed.
      if (nowSec - ts > 180) ts = nowSec;
      lastTickMs = Date.now();
      // Paint the live price immediately. Waiting for the history seed left the
      // 1m candle sitting on its low while 15s and 30s already showed the quote.
      carryTo(wallBucketAt(nowSec), false);
      emit(applyTick(current, price, ts, step, volumeDelta, fxDaily));
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
        if (last && lastTickMs === 0) {
          const nowSec = Math.floor(Date.now() / 1000);
          const wallBucket = fxDaily ? alignFxSessionDailyTime(nowSec) : alignTime(nowSec, step);
          const t = Math.min(
            fxDaily ? alignFxSessionDailyTime(last.time) : alignTime(last.time, step),
            wallBucket,
          );
          const sessionOpen = isMarketSessionOpen(symbol);
          emit({ ...last, time: t });
          if (sessionOpen) carryTo(wallBucket, true);
        } else if (last && current) {
          const nowSec = Math.floor(Date.now() / 1000);
          const wallBucket = fxDaily ? alignFxSessionDailyTime(nowSec) : alignTime(nowSec, step);
          const t = Math.min(
            fxDaily ? alignFxSessionDailyTime(last.time) : alignTime(last.time, step),
            wallBucket,
          );
          if (t === current.time) {
            emit({
              time: current.time,
              open: last.open || current.open,
              high: Math.max(last.high, current.high),
              low: Math.min(last.low, current.low),
              close: current.close,
              volume: Math.max(last.volume, current.volume),
            });
          }
        }
      } catch {
        /* ticks will create */
      }
    })();

    // Keep printing in-session bars while the tab stays open. Jumping the
    // forming candle to "now" left 5m/15m holes until the next refresh.
    if (typeof window !== "undefined") {
      const rollLive = () => {
        if (!current) return;
        const wall = wallBucketAt(Math.floor(Date.now() / 1000));
        if (current.time + step <= wall) carryTo(wall, false);
      };
      const clock = window.setInterval(rollLive, unit === "seconds" ? 250 : 5_000);
      const onVis = () => {
        if (document.visibilityState === "visible") rollLive();
      };
      document.addEventListener("visibilitychange", onVis);
      disposers.push(() => {
        clearInterval(clock);
        document.removeEventListener("visibilitychange", onVis);
      });
    }

    // Binance tick stream (crypto + PAXG proxy for gold/FXPRO/FOREXCOM XAU).
    if (route.tickSymbol) {
      disposers.push(
        openBinanceTickSocket(route.tickSymbol, (price, qty, ts) => {
          lastSocketMs = Date.now();
          onTick(price, ts, qty);
        }),
      );
    }

    // VPS market-ticks (TradingView quote feed primary; Germany/Mongo fallback).
    const channel =
      route.kind === "metal"
        ? `forex:xauusd:${route.exchange}`
        : route.kind === "forex"
          ? `forex:${route.apiSymbol.toLowerCase()}:${route.exchange}`
          : `crypto:${route.apiSymbol.toLowerCase()}`;
    disposers.push(
      openMarketTicksSocket(channel, (price, ts, vol) => {
        // Binance trade qty already carries real size for crypto. TV's field is
        // the day total — adding it again doubles crypto and matches 5m to 4h.
        lastSocketMs = Date.now();
        const delta = route.tickSymbol ? 0 : volumeDelta(quoteVolume, vol ?? 0);
        onTick(price, ts, delta);
      }),
    );

    // cp_fetcher chart_ws — emits the subscribed TF already aggregated from base
    // 1m/1h/1d candles (server sets `t` = period OPEN). Ticks still own liveness.
    disposers.push(
      openCpFetcherSocket(route.apiSymbol, interval, (bar) => {
        if (!isMarketSessionOpen(symbol)) return;
        // Server sends period open in `t` for native + derived TFs.
        // Daily FX must use the New York 17:00 open. Midnight-flooring a 23:00
        // gold bar landed it on the previous session and the chart drew both.
        const bucketOf = (ts: number) =>
          fxDaily ? alignFxSessionDailyTime(ts) : alignTime(ts, step);
        const wallBucket = bucketOf(Math.floor(Date.now() / 1000));
        let openTime = bucketOf(bar.time);
        // Refuse future buckets — only the current wall-clock candle may form.
        if (openTime > wallBucket) openTime = wallBucket;
        const aligned = { ...bar, time: openTime };
        const quietMs = Math.min(8_000, Math.max(5_000, step * 1_000));
        const quiet = lastTickMs === 0 || Date.now() - lastTickMs > quietMs;

        const mergeSame = (base: Bar, next: Bar, closeFrom: "tick" | "mongo"): Bar => ({
          time: next.time,
          open: base.open || next.open,
          high: Math.max(base.high, next.high, closeFrom === "tick" ? base.close : next.close),
          low: Math.min(base.low, next.low, closeFrom === "tick" ? base.close : next.close),
          close: closeFrom === "tick" ? base.close : next.close,
          // Server OHLC volume is per candle. A 0 from FX keeps the summed
          // quote deltas already accumulated on `base`.
          volume: next.volume > 0 ? next.volume : base.volume,
        });

        const bridged = (bar: Bar): Bar => {
          if (!current || bar.time <= current.time || bar.time - current.time > step * 2) return bar;
          const open = current.close;
          return {
            ...bar,
            open,
            high: Math.max(bar.high, open, bar.close),
            low: Math.min(bar.low, open, bar.close),
          };
        };

        // Live ticks own the forming close. Mongo/chart_ws may open the bucket
        // or widen wicks, but must not snap the last price backward.
        // A closed minute must not be streamed again. That rewrite pinned the
        // 1m close to the wick low while the seconds charts had already moved on.
        if (aligned.time < wallBucket) return;
        const ticksFresh = lastTickMs > 0 && Date.now() - lastTickMs < Math.max(8_000, quietMs);
        if (ticksFresh) {
          if (aligned.time === wallBucket && (!current || current.time < wallBucket)) {
            emit(bridged(aligned));
            return;
          }
          if (current && aligned.time === current.time) {
            emit(mergeSame(current, aligned, "tick"));
          }
          return;
        }

        // Feed quiet: never invent *future* periods. Always keep/update the current
        // wall-clock forming bar so TradingView countdown keeps running.
        if (quiet) {
          if (aligned.time === wallBucket) {
            if (!current || current.time < wallBucket) {
              emit(bridged(aligned));
            } else if (current.time === wallBucket) {
              emit(mergeSame(current, aligned, "mongo"));
            }
          } else if (current && aligned.time === current.time) {
            emit(mergeSame(current, aligned, "mongo"));
          }
          return;
        }

        if (aligned.time > wallBucket) return;
        if (!current || aligned.time > current.time) {
          emit(bridged(aligned));
          return;
        }
        if (aligned.time === current.time) {
          emit(mergeSame(current, aligned, ticksFresh ? "tick" : "mongo"));
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
          // /market-ticks is the TradingView quote. The HTTP snapshot lags that
          // feed by many seconds and was pulling every candle behind TV.
          if (Date.now() - lastSocketMs < 1_500) return;
          const fx = await this.fetchForexXau(true);
          const price = +fx.price;
          if (!Number.isFinite(price)) return;
          const age = Math.abs(Date.now() / 1000 - parseUpdatedAt(fx.updated_at));
          if (age > 2) return;
          onTick(price, Math.floor(Date.now() / 1000), 0);
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
          const quietMs = Math.min(8_000, Math.max(5_000, step * 1_000));
          const quiet = lastTickMs === 0 || Date.now() - lastTickMs > quietMs;
          if (quiet) return;
          if (!current || aligned.time > current.time) {
            if (current && aligned.time - current.time <= step * 2) {
              const open = current.close;
              emit({
                ...aligned,
                open,
                high: Math.max(aligned.high, open, aligned.close),
                low: Math.min(aligned.low, open, aligned.close),
              });
              return;
            }
            if (current) carryTo(aligned.time, false);
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

  /**
   * Seconds charts follow the same 1m path as history. Ticks and the 1m socket
   * update that parent; the chart only receives the current seconds slice.
   */
  private subscribeSecondBars(
    symbol: SymbolInfo,
    route: Route,
    step: number,
    onBar: (bar: Bar) => void,
  ): Unsubscribe {
    const disposers: Unsubscribe[] = [];
    let minute: Bar | null = null;
    let tickClose = false;
    let lastTickMs = 0;
    let lastSocketMs = 0;
    let lastEmittedTime = -1;
    let lastEmittedKey = "";
    let liveBar: Bar | null = null;
    const quoteVolume: VolumeCursor = { last: null };

    let lastPrice = Number.NaN;
    const paintLive = (price: number) => {
      if (!Number.isFinite(price) || !isMarketSessionOpen(symbol)) return;
      const nowSec = Math.floor(Date.now() / 1000);
      const bucket = nowSec - (nowSec % Math.max(1, step));
      if (!liveBar || liveBar.time !== bucket) {
        const open = liveBar && liveBar.time < bucket ? liveBar.close : price;
        liveBar = {
          time: bucket,
          open,
          high: Math.max(open, price),
          low: Math.min(open, price),
          close: price,
          volume: 1,
        };
      } else {
        liveBar = {
          time: bucket,
          open: liveBar.open,
          high: Math.max(liveBar.high, price),
          low: Math.min(liveBar.low, price),
          close: price,
          volume: liveBar.volume,
        };
      }
      const key = `${liveBar.time}:${liveBar.close}`;
      if (key === lastEmittedKey) return;
      lastEmittedKey = key;
      lastEmittedTime = liveBar.time;
      onBar(liveBar);
    };

    const onTick = (price: number, tsSec: number, volumeDelta = 0) => {
      if (!isMarketSessionOpen(symbol)) return;
      const nowSec = Math.floor(Date.now() / 1000);
      let ts = tsSec;
      if (!Number.isFinite(ts) || ts <= 0 || ts > nowSec + 2 || nowSec - ts > 180) ts = nowSec;
      lastTickMs = Date.now();
      lastPrice = price;
      minute = applyTick(minute, price, ts, 60, volumeDelta, false);
      tickClose = true;
      paintLive(price);
    };

    const adoptMinute = (bar: Bar) => {
      if (!isMarketSessionOpen(symbol)) return;
      const t = alignTime(bar.time, 60);
      const wall = alignTime(Math.floor(Date.now() / 1000), 60);
      if (t > wall || t < wall - 60) return;
      if (!minute || t > minute.time) {
        minute = { ...bar, time: t };
        tickClose = false;
      } else if (t === minute.time) {
        minute = {
          time: t,
          open: bar.open,
          high: Math.max(bar.high, minute.high),
          low: Math.min(bar.low, minute.low),
          close: tickClose ? minute.close : bar.close,
          volume: bar.volume > 0 ? bar.volume : minute.volume,
        };
      } else {
        return;
      }
      if (!tickClose && Number.isFinite(minute.close)) paintLive(minute.close);
    };

    void (async () => {
      try {
        const seed = await this.fetchBars(symbol, "1", {
          from: Math.floor(Date.now() / 1000) - 180,
          to: Math.floor(Date.now() / 1000) + 1,
          countBack: 2,
        });
        const last = seed[seed.length - 1];
        if (last) adoptMinute(last);
      } catch {
        /* ticks will open the minute */
      }
    })();

    if (typeof window !== "undefined") {
      const clock = window.setInterval(() => {
        if (Number.isFinite(lastPrice)) paintLive(lastPrice);
      }, 250);
      disposers.push(() => clearInterval(clock));
    }

    if (route.tickSymbol) {
      disposers.push(
        openBinanceTickSocket(route.tickSymbol, (price, qty, ts) => {
          lastSocketMs = Date.now();
          onTick(price, ts, qty);
        }),
      );
    }

    const channel =
      route.kind === "metal"
        ? `forex:xauusd:${route.exchange}`
        : route.kind === "forex"
          ? `forex:${route.apiSymbol.toLowerCase()}:${route.exchange}`
          : `crypto:${route.apiSymbol.toLowerCase()}`;
    disposers.push(
      openMarketTicksSocket(channel, (price, ts, vol) => {
        lastSocketMs = Date.now();
        const delta = route.tickSymbol ? 0 : volumeDelta(quoteVolume, vol ?? 0);
        onTick(price, ts, delta);
      }),
    );

    // The socket has no seconds stream. "30S" used to resolve to the 1m bar
    // and that whole candle was merged into one 30s slot.
    disposers.push(
      openCpFetcherSocket(route.apiSymbol, "1", (bar) => {
        adoptMinute(bar);
      }),
    );

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
          if (Math.abs(Date.now() / 1000 - ts) > 120) return;
          onTick(price, ts, 0);
        }, TICK_POLL_MS),
      );
    } else {
      disposers.push(
        startPolling(async () => {
          if (!isMarketSessionOpen(symbol)) return;
          // /market-ticks is the TradingView quote. The HTTP snapshot lags that
          // feed by many seconds and was pulling every candle behind TV.
          if (Date.now() - lastSocketMs < 1_500) return;
          const fx = await this.fetchForexXau(true);
          const price = +fx.price;
          if (!Number.isFinite(price)) return;
          const age = Math.abs(Date.now() / 1000 - parseUpdatedAt(fx.updated_at));
          if (age > 2) return;
          onTick(price, Math.floor(Date.now() / 1000), 0);
        }, FOREX_POLL_MS),
      );
    }

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
      else if (route.kind === "crypto") cryptoWanted.set(route.apiSymbol.toLowerCase(), s.ticker);
      // forex quotes: leave to tv_broker / Yahoo — Germany `/crypto/prices` is Binance-only.
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

  /** Fresh minute+ history from Germany `/ohlc/` — aggregate non-native TFs from parents. */
  private async fetchOhlcBars(
    route: Route,
    interval: Interval,
    limit: number,
    timeoutMs = REQUEST_TIMEOUT_MS,
  ): Promise<Bar[]> {
    const plan = ohlcPlan(interval);
    const requestLimit =
      plan.aggregateStep > 0 ? Math.min(MAX_BARS, Math.max(limit * 12, limit + 30)) : Math.min(MAX_BARS, limit);
    const raw = await fetchOhlc(route.apiSymbol, route.exchange, plan.request, requestLimit, timeoutMs);
    if (plan.aggregateStep > 0) return aggregateBars(raw, plan.aggregateStep);
    // Even for "native" Germany intervals, when the request TF differs from what we store
    // deeply in Mongo we already preferred Mongo. Here just return Germany's bars.
    return raw;
  }

  /**
   * Seconds history: synthesize from deep 1m parents (Mongo first, Germany `/ohlc/`
   * fallback). Do not splice Germany `/history/?timeframe=1s` — that archive lags
   * and produced gaps + staircase garbage when mixed with live ticks.
   */
  private async fetchSecondBars(
    route: Route,
    step: number,
    limit: number,
    range: BarRange,
  ): Promise<Bar[]> {
    const parentNeed = Math.min(20_000, Math.ceil((limit * step) / 60) + 50);
    let parents: Bar[] = [];
    if (mongoHistoryPlan("1")) {
      try {
        parents = await fetchCpChartHistory(route.apiSymbol, "1", {
          from: 0,
          to: range.to > 0 ? range.to : Math.floor(Date.now() / 1000) + 60,
          countBack: parentNeed,
        });
      } catch {
        parents = [];
      }
    }
    if (!parents.length) {
      const germanyNeed = Math.min(MAX_BARS, Math.ceil((limit * step) / 60) + 10);
      parents = await fetchOhlc(route.apiSymbol, route.exchange, "1", germanyNeed);
    }
    if ((route.kind === "metal" || route.kind === "forex") && parents.length) {
      if (!isLiveHistoryPage(range)) {
        parents = await spliceBrokerHoles(route.apiSymbol, parents, 60);
        parents = await repairBrokerPriceGaps(route.apiSymbol, parents, 60);
      }
      parents = densifySessionBars(
        {
          ticker: route.apiSymbol,
          name: route.apiSymbol,
          exchange: route.exchange,
          type: "forex",
          pricePrecision: 2,
          session: SESSION_FX,
          timezone: "America/New_York",
        },
        parents,
        60,
      );
    }
    if (!parents.length) throw new Error(`germany-market: no 1m parents for ${route.apiSymbol}`);
    const nowSec = Math.floor(Date.now() / 1000);
    const wall = nowSec - (nowSec % Math.max(1, step));
    const bars = synthesizeFromMinuteBars(parents, step).filter((bar) => bar.time <= wall);
    const parent = parents[parents.length - 1];
    const last = bars[bars.length - 1];
    if (parent && last && last.time === wall) {
      bars[bars.length - 1] = {
        ...last,
        high: Math.max(last.high, parent.close),
        low: Math.min(last.low, parent.close),
        close: parent.close,
      };
    }
    const before = range.to > 0 ? range.to : Number.POSITIVE_INFINITY;
    return bars.filter((b) => b.time < before).slice(-Math.max(limit, 1));
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
