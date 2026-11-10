import {
  intervalSeconds,
  isMarketSessionOpen,
  parseInterval,
  type Bar,
  type BarRange,
  type Interval,
  type SymbolInfo,
} from "@/domain";
import type { MarketDataProvider, Unsubscribe } from "@/application";
import { buildUrl, fetchJson } from "../http/fetch-json";
import { sessionDailyOpen } from "./session-bars";
import { volumeDelta, type VolumeCursor } from "./volume-delta";

/**
 * Tehran Stock Exchange via the Iran VPS.
 * History and live quotes come from `/iran-gold/tsetmc/*` and the existing
 * `/market-ticks` socket (`tse:{symbol}`). The browser never calls cdn.tsetmc.com.
 * Default series is قیمت تعدیل‌شده. A ticker ending in `.U` asks for the raw print.
 */

const HISTORY_BASE = "/iran-gold/tsetmc/history";
const REQUEST_TIMEOUT_MS = 20_000;

export const TSETMC_NATIVE_INTERVALS: readonly Interval[] = [
  "1",
  "5",
  "15",
  "30",
  "60",
  "240",
  "1D",
  "1W",
  "1M",
];

function intervalParam(interval: Interval): string {
  const { unit, count } = parseInterval(interval);
  if (unit === "weeks") return "1W";
  if (unit === "months") return "1M";
  if (unit === "days") return "1D";
  return String(Math.max(1, count));
}

function alignOpen(symbol: SymbolInfo, tsSec: number, step: number): number {
  if (step >= 86_400) return sessionDailyOpen(symbol, tsSec);
  const ts = Math.floor(tsSec);
  return ts - (ts % step);
}

interface HistoryPayload {
  bars?: number[][];
}

function openTseSocket(
  channel: string,
  onTick: (price: number, tsSec: number, volume: number) => void,
): Unsubscribe {
  let closed = false;
  let socket: WebSocket | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const connect = () => {
    if (closed || typeof window === "undefined") return;
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    try {
      socket = new WebSocket(`${proto}//${window.location.host}/market-ticks`);
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
        const volume = Number(msg.volume);
        onTick(price, Number.isFinite(ts) ? ts : Math.floor(Date.now() / 1000), Number.isFinite(volume) ? volume : 0);
      } catch {
        /* ignore malformed frame */
      }
    };
    socket.onclose = () => {
      socket = null;
      if (!closed) {
        retryTimer = setTimeout(() => {
          retryTimer = null;
          connect();
        }, 800);
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

export class TsetmcProvider implements MarketDataProvider {
  readonly id = "tsetmc";
  readonly isSynthetic = false;

  supports(symbol: SymbolInfo, interval: Interval): boolean {
    if (symbol.exchange.toUpperCase() !== "TSE") return false;
    const { unit, count } = parseInterval(interval);
    if (unit === "minutes") return count >= 1 && count <= 240;
    if (unit === "days" || unit === "weeks" || unit === "months") return count === 1;
    return false;
  }

  nativeIntervals(): readonly Interval[] {
    return TSETMC_NATIVE_INTERVALS;
  }

  async fetchBars(symbol: SymbolInfo, interval: Interval, range: BarRange): Promise<Bar[]> {
    const adjust = symbol.ticker.endsWith(".U") ? 0 : 1;
    const url = buildUrl(HISTORY_BASE, {
      symbol: symbol.ticker,
      interval: intervalParam(interval),
      limit: Math.min(5000, Math.max(range.countBack || 300, 300)),
      adjust,
      before: range.to > 0 ? range.to : undefined,
    });
    const payload = await fetchJson<HistoryPayload>(url, { timeoutMs: REQUEST_TIMEOUT_MS });
    const before = range.to > 0 ? range.to : Number.POSITIVE_INFINITY;
    const bars: Bar[] = [];
    for (const row of payload.bars ?? []) {
      if (!Array.isArray(row) || row.length < 5) continue;
      const time = Number(row[0]);
      const open = Number(row[1]);
      const high = Number(row[2]);
      const low = Number(row[3]);
      const close = Number(row[4]);
      const volume = Number(row[5] ?? 0);
      if (![time, open, high, low, close].every(Number.isFinite) || close <= 0 || time >= before) continue;
      bars.push({
        time,
        open,
        high: Math.max(high, open, close),
        low: Math.min(low, open, close),
        close,
        volume: Number.isFinite(volume) ? volume : 0,
      });
    }
    bars.sort((a, b) => a.time - b.time);
    return bars.slice(-Math.max(range.countBack || bars.length, 1));
  }

  subscribeBars(symbol: SymbolInfo, interval: Interval, onBar: (bar: Bar) => void): Unsubscribe {
    const step = intervalSeconds(interval);
    const channel = `tse:${symbol.ticker}`;
    const quoteVolume: VolumeCursor = { last: null };
    let current: Bar | null = null;

    return openTseSocket(channel, (price, tsSec, reported) => {
      if (!isMarketSessionOpen(symbol) && !current) return;
      const delta = volumeDelta(quoteVolume, reported);
      const time = alignOpen(symbol, tsSec, step);
      if (!current || current.time !== time) {
        current = { time, open: price, high: price, low: price, close: price, volume: delta };
      } else {
        current = {
          time,
          open: current.open,
          high: Math.max(current.high, price),
          low: Math.min(current.low, price),
          close: price,
          volume: current.volume + delta,
        };
      }
      onBar(current);
    });
  }
}
