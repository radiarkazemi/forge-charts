import { parseInterval, type Bar, type BarRange, type Interval, type Quote, type SymbolInfo } from "@/domain";
import type { MarketDataProvider, Unsubscribe } from "@/application";
import { buildUrl, fetchJson } from "../http/fetch-json";
import { startPolling } from "./polling";
import { fetchCpChartHistory, mongoHistoryPlan } from "./cp-chart-history";

/** Proxied by Vite / nginx. Health still hits Germany crypto-api; history uses Mongo chart_ws. */
const BASE = "/api/crypto";
const CHART_HEALTH = "/crypto-chart/health";
const REQUEST_TIMEOUT_MS = 2_500;
const HEALTH_TTL_MS = 60_000;
const LIVE_POLL_MS = 3_000;

const NATIVE_INTERVALS: readonly Interval[] = [
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

const CP_SYMBOL_BY_TICKER: Readonly<Record<string, string>> = {
  BTCUSD: "BTCUSDT",
  BTCUSDT: "BTCUSDT",
  ETHUSD: "ETHUSDT",
  ETHUSDT: "ETHUSDT",
  SOLUSD: "SOLUSDT",
  SOLUSDT: "SOLUSDT",
  BNBUSDT: "BNBUSDT",
  XRPUSD: "XRPUSDT",
  XRPUSDT: "XRPUSDT",
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
  PAXGUSDT: "PAXGUSDT",
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
 * Self-hosted cp_fetcher Mongo history (via chart_ws) + optional Germany crypto quotes.
 * Deep bars: 20k @ 1m, 10k @ 5m, 5k on other intervals (as stored in Mongo).
 */
export class CpFetcherProvider implements MarketDataProvider {
  readonly id = "cp_fetcher";
  readonly isSynthetic = false;

  private health: { ok: boolean; checkedAt: number } | null = null;

  supports(symbol: SymbolInfo, interval: Interval): boolean {
    if (!(symbol.ticker.toUpperCase() in CP_SYMBOL_BY_TICKER)) return false;
    return mongoHistoryPlan(interval) !== null || interval === "1" || interval === "60" || interval === "1D";
  }

  nativeIntervals(): readonly Interval[] {
    return NATIVE_INTERVALS;
  }

  async fetchBars(symbol: SymbolInfo, interval: Interval, range: BarRange): Promise<Bar[]> {
    await this.assertHealthy();
    const bars = await fetchCpChartHistory(this.cpSymbol(symbol), interval, range);
    return bars.filter((bar) => bar.time < range.to);
  }

  subscribeBars(symbol: SymbolInfo, interval: Interval, onBar: (bar: Bar) => void): Unsubscribe {
    const { unit, count } = parseInterval(interval);
    const timeframe = unit === "days" ? "1d" : count >= 60 ? "1h" : "1m";
    const step = unit === "minutes" ? count * 60 : unit === "days" ? 86_400 : 60;
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
      const cp = CP_SYMBOL_BY_TICKER[s.ticker.toUpperCase()];
      if (cp) wanted.set(cp, s.ticker);
    }
    if (wanted.size === 0 || !(await this.isHealthy())) return [];

    try {
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
    } catch {
      return [];
    }
  }

  private cpSymbol(symbol: SymbolInfo): string {
    return CP_SYMBOL_BY_TICKER[symbol.ticker.toUpperCase()] ?? symbol.ticker;
  }

  private async isHealthy(): Promise<boolean> {
    const now = Date.now();
    if (this.health && now - this.health.checkedAt < HEALTH_TTL_MS) return this.health.ok;
    try {
      const data = await fetchJson<{ status: string; mongo?: boolean }>(`${CHART_HEALTH}`, { timeoutMs: 1_500 });
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
