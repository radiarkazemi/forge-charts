import { intervalSeconds, parseInterval, type Bar, type BarRange, type Interval, type Quote, type SymbolInfo } from "@/domain";
import type { MarketDataProvider, Unsubscribe } from "@/application";
import { buildUrl, fetchJson } from "../http/fetch-json";
import { startPolling } from "./polling";
import { fetchCpChartHistory, mongoHistoryPlan } from "./cp-chart-history";
import { synthesizeFromMinuteBars, SYNTH_SECONDS_INTERVALS } from "./synthesize-seconds";

/** Proxied by Vite / nginx. Health still hits Germany crypto-api; history uses Mongo chart_ws. */
const BASE = "/api/crypto";
const CHART_HEALTH = "/crypto-chart/health";
const REQUEST_TIMEOUT_MS = 2_500;
const HEALTH_TTL_MS = 60_000;
const LIVE_POLL_MS = 3_000;

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

/**
 * Only tickers that actually exist in VPS Mongo. Indices (NAS100/US30/…) are
 * Yahoo-backed — listing them here returned empty history and blocked the chain.
 */
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
  USDCAD: "USDCAD",
  NZDUSD: "NZDUSD",
  EURGBP: "EURGBP",
  EURJPY: "EURJPY",
  GBPJPY: "GBPJPY",
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
 * Seconds are synthesized from 1m parents (same path as Germany/Yahoo).
 */
export class CpFetcherProvider implements MarketDataProvider {
  readonly id = "cp_fetcher";
  readonly isSynthetic = false;

  private health: { ok: boolean; checkedAt: number } | null = null;

  supports(symbol: SymbolInfo, interval: Interval): boolean {
    if (!(symbol.ticker.toUpperCase() in CP_SYMBOL_BY_TICKER)) return false;
    const { unit, count } = parseInterval(interval);
    if (unit === "seconds") return count >= 1 && count <= 45;
    return mongoHistoryPlan(interval) !== null || interval === "1" || interval === "60" || interval === "1D";
  }

  nativeIntervals(): readonly Interval[] {
    return NATIVE_INTERVALS;
  }

  async fetchBars(symbol: SymbolInfo, interval: Interval, range: BarRange): Promise<Bar[]> {
    await this.assertHealthy();
    const { unit } = parseInterval(interval);
    if (unit === "seconds") {
      const step = intervalSeconds(interval);
      const parentNeed = Math.min(20_000, Math.ceil((Math.max(range.countBack, 50) * step) / 60) + 50);
      const parents = await fetchCpChartHistory(this.cpSymbol(symbol), "1", {
        from: 0,
        to: range.to > 0 ? range.to : Math.floor(Date.now() / 1000) + 60,
        countBack: parentNeed,
      });
      if (!parents.length) {
        throw new Error(`cp_fetcher: no 1m parents for ${symbol.ticker}`);
      }
      const now = Math.floor(Date.now() / 1000);
      const before = range.to > 0 ? Math.min(range.to, now + 1) : now + 1;
      const bars = synthesizeFromMinuteBars(parents, step).filter((bar) => bar.time < before);
      if (!bars.length) throw new Error(`cp_fetcher: empty seconds for ${symbol.ticker}`);
      return bars.slice(-Math.max(range.countBack, 1));
    }

    const bars = await fetchCpChartHistory(this.cpSymbol(symbol), interval, range);
    const filtered = bars.filter((bar) => bar.time < range.to);
    // Empty Mongo must not win the chain — let Yahoo / other providers answer.
    if (!filtered.length) {
      throw new Error(`cp_fetcher: empty history for ${symbol.ticker} @ ${interval}`);
    }
    return filtered;
  }

  subscribeBars(symbol: SymbolInfo, interval: Interval, onBar: (bar: Bar) => void): Unsubscribe {
    const { unit, count } = parseInterval(interval);
    const step = intervalSeconds(interval);
    if (unit === "seconds") {
      const pollMs = Math.min(LIVE_POLL_MS, Math.max(1_000, step * 1_000));
      return startPolling(async () => {
        const to = Math.floor(Date.now() / 1000) + step;
        const bars = await this.fetchBars(symbol, interval, {
          from: to - Math.max(60, step * 24),
          to,
          countBack: Math.max(24, Math.ceil(120 / step)),
        });
        const last = bars.at(-1);
        if (last) onBar(last);
      }, pollMs);
    }

    const timeframe = unit === "days" ? "1d" : count >= 60 ? "1h" : "1m";
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
