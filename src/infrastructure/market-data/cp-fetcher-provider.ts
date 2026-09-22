import { intervalSeconds, type Bar, type BarRange, type Interval, type Quote, type SymbolInfo } from "@/domain";
import type { MarketDataProvider, Unsubscribe } from "@/application";
import { buildUrl, fetchJson } from "../http/fetch-json";
import { startPolling } from "./polling";

/** Proxied by Vite so the API key stays server-side. */
const BASE = "/api/crypto";
const REQUEST_TIMEOUT_MS = 2_500;
const HEALTH_TTL_MS = 60_000;
const MAX_HISTORY = 2_000;
const LIVE_POLL_MS = 3_000;

type Timeframe = "1m" | "1h" | "1d";

const TIMEFRAME_BY_INTERVAL: Readonly<Record<string, Timeframe>> = { "1": "1m", "60": "1h", "1D": "1d" };
const NATIVE_INTERVALS: readonly Interval[] = Object.keys(TIMEFRAME_BY_INTERVAL);

const CP_SYMBOL_BY_TICKER: Readonly<Record<string, string>> = {
  BTCUSD: "BTCUSDT",
  ETHUSD: "ETHUSDT",
  SOLUSD: "SOLUSDT",
  BNBUSDT: "BNBUSDT",
  XRPUSD: "XRPUSDT",
  XAUUSD: "XAUUSD",
  XAGUSD: "XAGUSD",
  EURUSD: "EURUSD",
  GBPUSD: "GBPUSD",
  USDJPY: "USDJPY",
  AUDUSD: "AUDUSD",
  USDCHF: "USDCHF",
  USOIL: "USOIL",
  "GC1!": "XAUUSD",
  "CL1!": "USOIL",
};

interface Latest {
  symbol: string;
  bar_close_time: number;
  price: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  price_change?: number;
}

interface HistoryCandle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface HistoryResponse {
  results?: HistoryCandle[];
}

interface PriceListResponse {
  results?: Latest[];
}

function latestToBar(latest: Latest): Bar {
  return {
    time: latest.bar_close_time,
    open: +latest.open,
    high: +latest.high,
    low: +latest.low,
    close: +latest.price,
    volume: +latest.volume || 0,
  };
}

/**
 * Optional self-hosted `cp_fetcher` API. Gated behind a cached health check so
 * an offline host costs at most one probe per minute.
 */
export class CpFetcherProvider implements MarketDataProvider {
  readonly id = "cp_fetcher";
  readonly isSynthetic = false;

  private health: { ok: boolean; checkedAt: number } | null = null;

  supports(symbol: SymbolInfo, interval: Interval): boolean {
    return symbol.ticker in CP_SYMBOL_BY_TICKER && interval in TIMEFRAME_BY_INTERVAL;
  }

  nativeIntervals(): readonly Interval[] {
    return NATIVE_INTERVALS;
  }

  async fetchBars(symbol: SymbolInfo, interval: Interval, range: BarRange): Promise<Bar[]> {
    await this.assertHealthy();
    const timeframe = TIMEFRAME_BY_INTERVAL[interval] ?? "1m";
    const url = buildUrl(`${BASE}/prices/${encodeURIComponent(this.cpSymbol(symbol))}/history/`, {
      timeframe,
      limit: Math.min(MAX_HISTORY, Math.max(1, range.countBack + 50)),
    });
    const json = await fetchJson<HistoryResponse>(url, { timeoutMs: REQUEST_TIMEOUT_MS });
    return (json.results ?? [])
      .map((c) => ({
        time: Math.floor(new Date(c.time).getTime() / 1000),
        open: +c.open,
        high: +c.high,
        low: +c.low,
        close: +c.close,
        volume: +c.volume || 0,
      }))
      .filter((bar) => bar.time < range.to);
  }

  subscribeBars(symbol: SymbolInfo, interval: Interval, onBar: (bar: Bar) => void): Unsubscribe {
    const timeframe = TIMEFRAME_BY_INTERVAL[interval] ?? "1m";
    const step = intervalSeconds(interval);
    return startPolling(async () => {
      const latest = await fetchJson<Latest>(
        buildUrl(`${BASE}/prices/${encodeURIComponent(this.cpSymbol(symbol))}/`, { timeframe }),
        { timeoutMs: REQUEST_TIMEOUT_MS },
      );
      const bar = latestToBar(latest);
      onBar({ ...bar, time: bar.time - (bar.time % step) });
    }, LIVE_POLL_MS);
  }

  async fetchQuotes(symbols: readonly SymbolInfo[]): Promise<Quote[]> {
    const wanted = new Map<string, string>();
    for (const s of symbols) {
      const cp = CP_SYMBOL_BY_TICKER[s.ticker];
      if (cp) wanted.set(cp, s.ticker);
    }
    if (wanted.size === 0 || !(await this.isHealthy())) return [];

    const json = await fetchJson<PriceListResponse | Latest[]>(
      buildUrl(`${BASE}/prices/`, { timeframe: "1m", page: 1, page_size: 200 }),
      { timeoutMs: REQUEST_TIMEOUT_MS },
    );
    const rows = Array.isArray(json) ? json : (json.results ?? []);
    const now = Math.floor(Date.now() / 1000);

    return rows.flatMap((row) => {
      const ticker = wanted.get(row.symbol);
      return ticker
        ? [{ ticker, price: +row.price, changePercent: +(row.price_change ?? 0), updatedAt: now, synthetic: false }]
        : [];
    });
  }

  private cpSymbol(symbol: SymbolInfo): string {
    return CP_SYMBOL_BY_TICKER[symbol.ticker] ?? symbol.ticker;
  }

  private async isHealthy(): Promise<boolean> {
    const now = Date.now();
    if (this.health && now - this.health.checkedAt < HEALTH_TTL_MS) return this.health.ok;
    try {
      const data = await fetchJson<{ status: string; mongo?: boolean }>(`${BASE}/health/`, { timeoutMs: 1_500 });
      this.health = { ok: data.status === "ok" && data.mongo !== false, checkedAt: now };
    } catch {
      this.health = { ok: false, checkedAt: now };
    }
    return this.health.ok;
  }

  private async assertHealthy(): Promise<void> {
    if (!(await this.isHealthy())) throw new Error("cp_fetcher is unavailable");
  }
}
