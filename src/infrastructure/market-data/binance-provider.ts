import { parseInterval, type Bar, type BarRange, type Interval, type Quote, type SymbolInfo } from "@/domain";
import type { MarketDataProvider, Unsubscribe } from "@/application";
import { buildUrl, fetchJson, HttpError } from "../http/fetch-json";

const REST_BASE = "/api/binance/api/v3";
const WS_BASE = "wss://stream.binance.com:9443/ws";
const MAX_LIMIT = 1000;

const PAIR_BY_TICKER: Readonly<Record<string, string>> = {
  BTCUSD: "BTCUSDT",
  ETHUSD: "ETHUSDT",
  SOLUSD: "SOLUSDT",
  BNBUSDT: "BNBUSDT",
  XRPUSD: "XRPUSDT",
};

const KLINE_BY_INTERVAL: Readonly<Record<string, string>> = {
  "1": "1m",
  "3": "3m",
  "5": "5m",
  "15": "15m",
  "30": "30m",
  "60": "1h",
  "120": "2h",
  "240": "4h",
  "1D": "1d",
  "1W": "1w",
  "1M": "1M",
};

const NATIVE_INTERVALS: readonly Interval[] = Object.keys(KLINE_BY_INTERVAL);

type Kline = [openTime: number, open: string, high: string, low: string, close: string, volume: string];

interface Ticker24h {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
}

interface KlineEvent {
  k?: { t: number; o: string; h: string; l: string; c: string; v: string };
}

function klineToBar(k: Kline): Bar {
  return { time: Math.floor(k[0] / 1000), open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5] };
}

/** Binance answers 451 from restricted regions; once seen, the whole provider is unusable for the session. */
const HTTP_UNAVAILABLE_FOR_LEGAL_REASONS = 451;

/** Binance spot klines over REST + WebSocket streaming for crypto pairs. */
export class BinanceProvider implements MarketDataProvider {
  readonly id = "binance";
  readonly isSynthetic = false;
  private geoBlocked = false;

  supports(symbol: SymbolInfo, interval: Interval): boolean {
    return !this.geoBlocked && symbol.ticker in PAIR_BY_TICKER && this.klineInterval(interval) !== null;
  }

  nativeIntervals(): readonly Interval[] {
    return this.geoBlocked ? [] : NATIVE_INTERVALS;
  }

  async fetchBars(symbol: SymbolInfo, interval: Interval, range: BarRange): Promise<Bar[]> {
    const url = buildUrl(`${REST_BASE}/klines`, {
      symbol: this.pair(symbol),
      interval: this.klineInterval(interval) ?? "1m",
      endTime: range.to * 1000 - 1,
      limit: Math.min(MAX_LIMIT, Math.max(1, range.countBack)),
    });
    const rows = await this.request<Kline[]>(url);
    return rows.map(klineToBar);
  }

  subscribeBars(symbol: SymbolInfo, interval: Interval, onBar: (bar: Bar) => void): Unsubscribe {
    const stream = `${this.pair(symbol).toLowerCase()}@kline_${this.klineInterval(interval) ?? "1m"}`;
    let socket: WebSocket | null = null;
    let closed = false;
    let retryDelay = 1_000;

    const connect = () => {
      if (closed) return;
      socket = new WebSocket(`${WS_BASE}/${stream}`);
      socket.onopen = () => {
        retryDelay = 1_000;
      };
      socket.onmessage = (event) => {
        const k = (JSON.parse(String(event.data)) as KlineEvent).k;
        if (k) onBar({ time: Math.floor(k.t / 1000), open: +k.o, high: +k.h, low: +k.l, close: +k.c, volume: +k.v });
      };
      socket.onclose = () => {
        if (closed) return;
        setTimeout(connect, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 30_000);
      };
    };
    connect();

    return () => {
      closed = true;
      socket?.close();
    };
  }

  async fetchQuotes(symbols: readonly SymbolInfo[]): Promise<Quote[]> {
    const pairs = symbols.filter((s) => s.ticker in PAIR_BY_TICKER).map((s) => this.pair(s));
    if (pairs.length === 0 || this.geoBlocked) return [];

    const tickerByPair = new Map(Object.entries(PAIR_BY_TICKER).map(([ticker, pair]) => [pair, ticker]));
    const rows = await this.request<Ticker24h[]>(buildUrl(`${REST_BASE}/ticker/24hr`, { symbols: JSON.stringify(pairs) }));
    const now = Math.floor(Date.now() / 1000);

    return rows.flatMap((row) => {
      const ticker = tickerByPair.get(row.symbol);
      return ticker
        ? [{ ticker, price: +row.lastPrice, changePercent: +row.priceChangePercent, updatedAt: now, synthetic: false }]
        : [];
    });
  }

  private async request<T>(url: string): Promise<T> {
    try {
      return await fetchJson<T>(url);
    } catch (error) {
      if (error instanceof HttpError && error.status === HTTP_UNAVAILABLE_FOR_LEGAL_REASONS) this.geoBlocked = true;
      throw error;
    }
  }

  private pair(symbol: SymbolInfo): string {
    return PAIR_BY_TICKER[symbol.ticker] ?? symbol.ticker;
  }

  private klineInterval(interval: Interval): string | null {
    const direct = KLINE_BY_INTERVAL[interval];
    if (direct) return direct;
    // Accept normalized aliases like "D" or "1d".
    const { unit, count } = parseInterval(interval);
    if (unit === "days" && count === 1) return "1d";
    if (unit === "weeks" && count === 1) return "1w";
    if (unit === "months" && count === 1) return "1M";
    return null;
  }
}
