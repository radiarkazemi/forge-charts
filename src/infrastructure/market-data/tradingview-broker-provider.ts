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
import { buildUrl, fetchJson, HttpError } from "../http/fetch-json";
import { startPolling } from "./polling";
import { aggregateBars, synthesizeFromMinuteBars, SYNTH_SECONDS_INTERVALS } from "./synthesize-seconds";
import { isTvBrokerSymbol, marketTicksChannelFor, tradingViewSymbolFor } from "./tv-broker-symbols";
import { fetchCpChartHistory, mongoHistoryPlan } from "./cp-chart-history";
import { volumeDelta, type VolumeCursor } from "./volume-delta";

const HISTORY_BASE = "/tv-history";
/** Live quotes stay snappy; replay/deep history may page on the VPS. */
const REQUEST_TIMEOUT_MS = 25_000;
const DEEP_HISTORY_TIMEOUT_MS = 95_000;
const LIVE_POLL_MS = 2_000;
/** Brief retries when market_ticks is mid-restart (deploy / OOM) — avoids blank FX charts. */
const TV_HISTORY_RETRIES = 2;
const TV_HISTORY_RETRY_MS = 450;

const NATIVE_INTERVALS: readonly Interval[] = [
  ...SYNTH_SECONDS_INTERVALS,
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

interface TvHistoryResponse {
  symbol?: string;
  resolution?: string;
  count?: number;
  bars?: unknown[];
  detail?: string;
}

function parseBar(row: unknown): Bar | null {
  if (!Array.isArray(row) || row.length < 5) return null;
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

function openMarketTicks(
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
        if (msg.channel != null && String(msg.channel) !== channel) return;
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

/**
 * Per-broker TradingView books (FOREXCOM / CAPITALCOM / OANDA / Pepperstone / …).
 * History: VPS `/tv-history` (TV chart socket). Realtime: `/market-ticks` TV quotes.
 */
export class TradingViewBrokerProvider implements MarketDataProvider {
  readonly id = "tv_broker";
  readonly isSynthetic = false;

  supports(symbol: SymbolInfo, interval: Interval): boolean {
    if (!tradingViewSymbolFor(symbol)) return false;
    const { unit, count } = parseInterval(interval);
    if (unit === "seconds") return count >= 1 && count <= 45;
    if (unit === "minutes") return count >= 1 && count <= 720;
    if (unit === "days" || unit === "weeks" || unit === "months") return count >= 1;
    return false;
  }

  nativeIntervals(_symbol?: SymbolInfo): readonly Interval[] {
    return NATIVE_INTERVALS;
  }

  /**
   * VPS Mongo (`/crypto-chart/history`) — same store gold uses. When
   * `/tv-history` 502s (market_ticks restart during deploy), FX majors still
   * paint instead of a blank “No data” chart.
   */
  private async fetchMongoFallback(
    symbol: SymbolInfo,
    interval: Interval,
    range: BarRange,
  ): Promise<Bar[]> {
    if (!mongoHistoryPlan(interval)) return [];
    try {
      return await fetchCpChartHistory(symbol.ticker, interval, range);
    } catch {
      return [];
    }
  }

  async fetchBars(symbol: SymbolInfo, interval: Interval, range: BarRange): Promise<Bar[]> {
    const tvSymbol = tradingViewSymbolFor(symbol);
    if (!tvSymbol) return [];

    const { unit } = parseInterval(interval);
    if (unit === "seconds") {
      const step = intervalSeconds(interval);
      // 15S×20k bars ≈ 3.5d of 1m parents — keep depth so left-scroll has history.
      const parentNeed = Math.min(
        10_000,
        Math.max(300, Math.ceil((Math.max(range.countBack, 200) * step) / 60) + 80),
      );
      const parents = await this.fetchBars(symbol, "1", {
        from: 0,
        to: range.to > 0 ? range.to : Math.floor(Date.now() / 1000) + 60,
        countBack: parentNeed,
      });
      if (!parents.length) return [];
      const now = Math.floor(Date.now() / 1000);
      const before = range.to > 0 ? Math.min(range.to, now + 1) : now + 1;
      const bars = synthesizeFromMinuteBars(parents, step).filter((bar) => bar.time < before);
      if (!bars.length) return [];
      return bars.slice(-Math.max(range.countBack, 1));
    }

    const { request, group } = this.tvHistoryPlan(interval);
    const count = Math.min(10_000, Math.max((range.countBack + 50) * Math.max(group, 1), 300));
    const deep = count > 1_000 || (range.to > 0 && range.to < Math.floor(Date.now() / 1000) - 3_600);
    const url = buildUrl(HISTORY_BASE, {
      symbol: tvSymbol,
      resolution: request,
      count,
      ...(range.to > 0 ? { before: range.to } : {}),
    });

    let lastError: unknown = null;
    for (let attempt = 0; attempt <= TV_HISTORY_RETRIES; attempt += 1) {
      try {
        const json = await fetchJson<TvHistoryResponse>(url, {
          timeoutMs: deep ? DEEP_HISTORY_TIMEOUT_MS : REQUEST_TIMEOUT_MS,
        });
        let bars = (json.bars ?? []).map(parseBar).filter((b): b is Bar => b !== null);
        if (group > 1) {
          bars = aggregateBars(bars, intervalSeconds(interval));
        }
        const before = range.to > 0 ? range.to : Number.POSITIVE_INFINITY;
        const filtered = bars.filter((b) => b.time < before).sort((a, b) => a.time - b.time);
        if (filtered.length) {
          return filtered.slice(-Math.max(range.countBack, 1));
        }
        // Empty TV page — try Mongo before yielding to Yahoo (Yahoo often geo-blocked).
        break;
      } catch (error) {
        lastError = error;
        if (error instanceof HttpError && error.status >= 400 && error.status < 500) {
          break;
        }
        const retriable =
          error instanceof HttpError && error.status >= 500
            ? true
            : error instanceof DOMException && error.name === "AbortError"
              ? true
              : error instanceof Error && /abort|network|fetch/i.test(error.message);
        if (retriable && attempt < TV_HISTORY_RETRIES) {
          await new Promise((r) => window.setTimeout(r, TV_HISTORY_RETRY_MS * (attempt + 1)));
          continue;
        }
        if (error instanceof HttpError && error.status >= 500) break;
        if (!(error instanceof HttpError)) {
          // Unknown — still try Mongo, then rethrow if that is empty.
          break;
        }
        break;
      }
    }

    const mongo = await this.fetchMongoFallback(symbol, interval, range);
    if (mongo.length) return mongo;

    // Empty → fall through to Yahoo/other providers (replay must not blank the chart).
    if (lastError && !(lastError instanceof HttpError)) throw lastError;
    return [];
  }

  subscribeBars(symbol: SymbolInfo, interval: Interval, onBar: (bar: Bar) => void): Unsubscribe {
    const step = intervalSeconds(interval);
    const channel = marketTicksChannelFor(symbol);
    const disposers: Unsubscribe[] = [];
    let current: Bar | null = null;
    const quoteVolume: VolumeCursor = { last: null };

    const emit = (price: number, tsSec: number, reported = 0) => {
      if (!isMarketSessionOpen(symbol) && !current) return;
      const delta = volumeDelta(quoteVolume, reported);
      const bucket = Math.floor(tsSec / step) * step;
      if (!current || current.time !== bucket) {
        current = { time: bucket, open: price, high: price, low: price, close: price, volume: delta };
      } else {
        current = {
          time: bucket,
          open: current.open,
          high: Math.max(current.high, price),
          low: Math.min(current.low, price),
          close: price,
          volume: current.volume + delta,
        };
      }
      onBar(current);
    };

    if (channel) {
      disposers.push(openMarketTicks(channel, emit));
    }

    // Seed / reconcile from TV history so the first paint isn’t a lone tick.
    disposers.push(
      startPolling(async () => {
        if (!isMarketSessionOpen(symbol)) return;
        const to = Math.floor(Date.now() / 1000) + step;
        const bars = await this.fetchBars(symbol, interval, {
          from: to - step * 8,
          to,
          countBack: 4,
        });
        const last = bars.at(-1);
        if (!last) return;
        if (!current || last.time >= current.time) {
          current = last;
          onBar(last);
        }
      }, LIVE_POLL_MS),
    );

    return () => {
      for (const d of disposers) d();
    };
  }

  async fetchQuotes(symbols: readonly SymbolInfo[]): Promise<Quote[]> {
    const wanted = symbols.filter(isTvBrokerSymbol);
    if (wanted.length === 0) return [];
    const now = Math.floor(Date.now() / 1000);
    const settled = await Promise.allSettled(
      wanted.map(async (symbol) => {
        const bars = await this.fetchBars(symbol, "1", { from: 0, to: now + 60, countBack: 2 });
        const last = bars.at(-1);
        const prev = bars.at(-2);
        if (!last) return null;
        const changePercent = prev ? ((last.close - prev.close) / prev.close) * 100 : 0;
        return {
          ticker: symbol.ticker,
          price: last.close,
          changePercent,
          updatedAt: now,
          synthetic: false,
        } satisfies Quote;
      }),
    );
    return settled.flatMap((r) => (r.status === "fulfilled" && r.value ? [r.value] : []));
  }

  /** Native TV series + optional client aggregate factor. */
  private tvHistoryPlan(interval: Interval): { request: string; group: number } {
    const { unit, count, seconds } = parseInterval(interval);
    if (unit === "minutes") {
      if ([1, 5, 15, 30, 60, 240].includes(count)) return { request: String(count), group: 1 };
      if (count < 5) return { request: "1", group: count };
      if (count < 15) return { request: "5", group: Math.max(1, Math.round(seconds / 300)) };
      if (count < 60) return { request: "15", group: Math.max(1, Math.round(seconds / 900)) };
      if (count < 240) return { request: "60", group: Math.max(1, Math.round(seconds / 3600)) };
      return { request: "240", group: Math.max(1, Math.round(seconds / 14_400)) };
    }
    if (unit === "days" && count === 1) return { request: "1D", group: 1 };
    if (unit === "weeks" && count === 1) return { request: "1W", group: 1 };
    if (unit === "months" && count === 1) return { request: "1M", group: 1 };
    if (unit === "days") return { request: "1D", group: count };
    if (unit === "weeks") return { request: "1W", group: count };
    if (unit === "months") return { request: "1M", group: count };
    return { request: "1", group: 1 };
  }
}
