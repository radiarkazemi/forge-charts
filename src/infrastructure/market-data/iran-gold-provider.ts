import {
  intervalSeconds,
  parseInterval,
  isMarketSessionOpen,
  type Bar,
  type BarRange,
  type Interval,
  type Quote,
  type SymbolInfo,
} from "@/domain";
import type { MarketDataProvider, Unsubscribe } from "@/application";
import { buildUrl, fetchJson } from "../http/fetch-json";
import { targetHistoryDepth } from "./cp-chart-history";

/**
 * Iran domestic gold from Faraz (native symbols):
 *   آبشده نقدی 1 (abshodeNaghdi), گرم ۱۸ (geramTalaHejdah), طلای ۲۴ (tala24Estjt),
 *   سکه امامی / نیم / ربع, انس
 *
 * History: VPS `/iran-gold/history`
 *   - Faraz customer `/trading-view/history` (max countback) when session set
 *   - Public chart-history fallback for 1D / 1W / 1M
 *   - Mongo `anil_gold.faraz_ohlc` + `tick_1s` + `ohlc_1m/1h/1d` (bootstrap + realtime append)
 * Realtime: VPS `/market-ticks` `iran:*` — Faraz live ticks appended onto saved history
 */

const HISTORY_BASE = "/iran-gold/history";
const QUOTE_BASE = "/iran-gold/quote";
const REQUEST_TIMEOUT_MS = 45_000;

export const IRAN_NATIVE_INTERVALS: readonly Interval[] = [
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
  "240",
  "1D",
  "1W",
  "1M",
];

type IranRoute = {
  ticker: string;
  channel: string;
  field: string;
};

const ROUTES: Readonly<Record<string, IranRoute>> = {
  ABSHODE: { ticker: "ABSHODE", channel: "iran:abshode", field: "mesghal_17" },
  MESGHAL17: { ticker: "MESGHAL17", channel: "iran:abshode", field: "mesghal_17" },
  G18: { ticker: "G18", channel: "iran:g18", field: "price_18k_per_gram" },
  G24: { ticker: "G24", channel: "iran:g24", field: "price_24k_per_gram" },
  SEKKE: { ticker: "SEKKE", channel: "iran:sekke", field: "coin_emami" },
  SEKKE_EMAMI: { ticker: "SEKKE_EMAMI", channel: "iran:sekke", field: "coin_emami" },
  NIM: { ticker: "NIM", channel: "iran:nim", field: "coin_half" },
  ROB: { ticker: "ROB", channel: "iran:rob", field: "coin_quarter" },
  ONS: { ticker: "ONS", channel: "iran:ons", field: "ounce_usd" },
};

function routeFor(symbol: SymbolInfo): IranRoute | null {
  const ex = symbol.exchange.toUpperCase();
  if (ex && ex !== "IRAN" && ex !== "TGJU" && ex !== "FARAZ") return null;
  return ROUTES[symbol.ticker.toUpperCase()] ?? null;
}

/** Asia/Tehran UTC+03:30 — Faraz 1h/4h bars use this session grid, not UTC. */
const IRAN_TZ_OFFSET_SEC = 3 * 3600 + 1800;

function alignTime(tsSec: number, step: number): number {
  if (!Number.isFinite(tsSec) || !Number.isFinite(step) || step <= 0) {
    return Number.isFinite(tsSec) ? Math.floor(tsSec) : Math.floor(Date.now() / 1000);
  }
  const ts = Math.floor(tsSec);
  const s = Math.floor(step);
  // Hour+ intraday: keep Faraz/Tehran bucket starts (…:30 UTC).
  if (s >= 3600 && s < 86_400) {
    const shifted = ts + IRAN_TZ_OFFSET_SEC;
    return shifted - (shifted % s) - IRAN_TZ_OFFSET_SEC;
  }
  return ts - (ts % s);
}

function applyTick(current: Bar | null, price: number, tsSec: number, step: number): Bar {
  const wallBucket = alignTime(Math.floor(Date.now() / 1000), step);
  let t = alignTime(tsSec, step);
  if (t > wallBucket) t = wallBucket;
  if (!current || current.time < t) {
    return { time: t, open: price, high: price, low: price, close: price, volume: 1 };
  }
  if (current.time > t) return current;
  return {
    time: t,
    open: current.open,
    high: Math.max(current.high, price),
    low: Math.min(current.low, price),
    close: price,
    volume: current.volume + 1,
  };
}

function parsePackedBar(row: unknown): Bar | null {
  if (!Array.isArray(row) || row.length < 5) return null;
  const nums = row.map(Number);
  let time = nums[0]!;
  if (time > 1e12) time = Math.floor(time / 1000);
  const open = nums[1]!;
  const high = nums[2]!;
  const low = nums[3]!;
  const close = nums[4]!;
  const volume = nums[5] ?? 0;
  if (![time, open, high, low, close].every(Number.isFinite)) return null;
  return { time, open, high, low, close, volume: Number.isFinite(volume) ? volume : 0 };
}

interface HistoryResponse {
  bars?: unknown[];
  detail?: string;
  count?: number;
  source?: string;
}

interface QuoteResponse {
  source?: string;
  ts?: number;
  prices?: Record<string, number>;
  channels?: Record<string, number>;
}

function openMarketTicksSocket(
  channel: string,
  onTick: (price: number, tsSec: number) => void,
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
        if (msg.channel != null && String(msg.channel) !== channel) return;
        const price = Number(msg.price);
        if (!Number.isFinite(price) || price <= 0) return;
        const ts = msg.ts ? Number(msg.ts) : Math.floor(Date.now() / 1000);
        onTick(price, ts);
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

export class IranGoldProvider implements MarketDataProvider {
  readonly id = "iran-gold";
  readonly isSynthetic = false;

  supports(symbol: SymbolInfo, interval: Interval): boolean {
    if (routeFor(symbol) === null) return false;
    const { unit, count } = parseInterval(interval);
    if (unit === "seconds") return count >= 1 && count <= 45;
    if (unit === "minutes") return count >= 1 && count <= 720;
    if (unit === "days" || unit === "weeks" || unit === "months") return count >= 1;
    return false;
  }

  nativeIntervals(_symbol?: SymbolInfo): readonly Interval[] {
    return IRAN_NATIVE_INTERVALS;
  }

  async fetchBars(symbol: SymbolInfo, interval: Interval, range: BarRange): Promise<Bar[]> {
    const route = routeFor(symbol);
    if (!route) throw new Error(`iran-gold: unsupported ${symbol.ticker}`);
    const step = intervalSeconds(interval);
    // Same depth targets as cp_fetcher chart history (1m=20k, 5m=10k, else 5k).
    const target = targetHistoryDepth(interval);
    const limit = Math.min(target, Math.max(range.countBack + 100, 2_000));
    const json = await fetchJson<HistoryResponse>(
      buildUrl(HISTORY_BASE, {
        symbol: route.ticker,
        interval,
        limit,
        before: range.to > 0 ? range.to : undefined,
      }),
      { timeoutMs: REQUEST_TIMEOUT_MS },
    );
    if (json.detail) throw new Error(json.detail);
    const before = range.to > 0 ? range.to : Number.POSITIVE_INFINITY;
    const bars = (json.bars ?? [])
      .map(parsePackedBar)
      .filter((b): b is Bar => b !== null)
      .filter((b) => b.time < before)
      .sort((a, b) => a.time - b.time);
    if (!bars.length) return [];
    const aligned = bars.map((b) => ({ ...b, time: alignTime(b.time, step) }));
    const byTime = new Map<number, Bar>();
    for (const b of aligned) byTime.set(b.time, b);
    return [...byTime.values()].sort((a, b) => a.time - b.time).slice(-Math.max(range.countBack, 1));
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
    const pending: Array<{ price: number; tsSec: number }> = [];

    const emit = (bar: Bar) => {
      current = bar;
      if (bar.time === lastEmittedTime && bar.close === lastEmittedClose) return;
      lastEmittedTime = bar.time;
      lastEmittedClose = bar.close;
      onBar(bar);
    };

    const onTick = (price: number, tsSec: number) => {
      if (!isMarketSessionOpen(symbol)) return;
      const nowSec = Math.floor(Date.now() / 1000);
      let ts = tsSec;
      if (ts > nowSec + 1) ts = nowSec;
      const maxAgeSec = Math.max(45, step * 3);
      if (nowSec - ts > maxAgeSec) return;
      lastTickMs = Date.now();
      if (!readyForTicks) {
        pending.push({ price, tsSec: ts });
        if (pending.length > 50) pending.shift();
        return;
      }
      emit(applyTick(current, price, ts, step));
    };

    // Seed forming bar from deep history (Faraz D/W/M or Mongo), like cp_fetcher.
    void (async () => {
      try {
        const seed = await this.fetchBars(symbol, interval, {
          from: Math.floor(Date.now() / 1000) - step * 8,
          to: Math.floor(Date.now() / 1000) + 1,
          countBack: 5,
        });
        const last = seed[seed.length - 1];
        if (last) {
          const wallBucket = alignTime(Math.floor(Date.now() / 1000), step);
          const t = alignTime(last.time, step);
          if (t < wallBucket) {
            emit({
              time: wallBucket,
              open: last.close,
              high: last.close,
              low: last.close,
              close: last.close,
              volume: 0,
            });
          } else {
            emit({ ...last, time: Math.min(t, wallBucket) });
          }
        }
      } catch {
        /* ticks will create */
      } finally {
        readyForTicks = true;
        for (const tick of pending.splice(0)) {
          emit(applyTick(current, tick.price, tick.tsSec, step));
        }
      }
    })();

    // Seconds: keep forming while the 1s Faraz→market-ticks poll is alive.
    if (parseInterval(interval).unit === "seconds" && typeof window !== "undefined") {
      const quietMs = Math.max(2_500, step * 2_500);
      const clock = window.setInterval(() => {
        if (!isMarketSessionOpen(symbol)) return;
        if (Date.now() - lastTickMs > quietMs) return;
        const lastPrice = current?.close;
        if (!Number.isFinite(lastPrice)) return;
        const bucket = alignTime(Math.floor(Date.now() / 1000), step);
        if (!current || current.time < bucket) {
          emit({
            time: bucket,
            open: lastPrice!,
            high: lastPrice!,
            low: lastPrice!,
            close: lastPrice!,
            volume: 0,
          });
        }
      }, Math.min(250, Math.max(50, (step * 1000) / 4)));
      disposers.push(() => clearInterval(clock));
    }

    // Primary realtime path — same `/market-ticks` WS used by cp_fetcher crypto/FX.
    disposers.push(openMarketTicksSocket(route.channel, onTick));

    // HTTP quote heartbeat if WS is quiet (proxy gaps) — mirrors cp live poll fallback.
    if (typeof window !== "undefined") {
      const poll = window.setInterval(() => {
        if (Date.now() - lastTickMs < 1_200) return;
        void fetchJson<QuoteResponse>(QUOTE_BASE, { timeoutMs: 2_000 })
          .then((q) => {
            const price = Number(q.prices?.[route.field] ?? q.channels?.[route.channel] ?? 0);
            if (price > 0) onTick(price, q.ts ? Number(q.ts) : Math.floor(Date.now() / 1000));
          })
          .catch(() => undefined);
      }, 1_000);
      disposers.push(() => clearInterval(poll));
    }

    return () => {
      for (const d of disposers) d();
    };
  }

  async fetchQuotes(symbols: readonly SymbolInfo[]): Promise<Quote[]> {
    const wanted = symbols.filter((s) => routeFor(s) !== null);
    if (!wanted.length) return [];
    try {
      const q = await fetchJson<QuoteResponse>(QUOTE_BASE, { timeoutMs: 3_000 });
      const now = q.ts && Number.isFinite(Number(q.ts)) ? Number(q.ts) : Math.floor(Date.now() / 1000);
      const out: Quote[] = [];
      for (const symbol of wanted) {
        const route = routeFor(symbol)!;
        const price = Number(q.prices?.[route.field] ?? q.channels?.[route.channel] ?? 0);
        if (!(price > 0)) continue;
        out.push({
          ticker: symbol.ticker,
          price,
          changePercent: 0,
          updatedAt: now,
          synthetic: false,
        });
      }
      return out;
    } catch {
      return [];
    }
  }
}
