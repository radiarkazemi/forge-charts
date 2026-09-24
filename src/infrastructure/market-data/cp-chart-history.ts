import { intervalSeconds, parseInterval, type Bar, type BarRange, type Interval } from "@/domain";
import { buildUrl, fetchJson } from "../http/fetch-json";

/** VPS cp_fetcher chart_ws HTTP (nginx `/crypto-chart/` → :8003). */
const CHART_HISTORY_BASE = "/crypto-chart/history";
const REQUEST_TIMEOUT_MS = 45_000;

/** Target depths for TradingView scroll-back (as many as Mongo can serve). */
export function targetHistoryDepth(interval: Interval): number {
  const { unit, count } = parseInterval(interval);
  if (unit === "minutes" && count === 1) return 20_000;
  if (unit === "minutes" && count === 5) return 10_000;
  return 5_000;
}

/**
 * Map a TV interval onto Mongo hist collections.
 * Prefer aggregating from 1m (deepest) so 5m/15m/1h can reach multi-thousand bars.
 */
export function mongoHistoryPlan(interval: Interval): { timeframe: "1m" | "1h" | "1d"; group: number } | null {
  const { unit, count } = parseInterval(interval);
  if (unit === "seconds") return null;
  if (unit === "minutes") {
    if (count >= 1 && count <= 720) {
      // Always roll from 1m parents — native 1h collections are thin (~hundreds).
      return { timeframe: "1m", group: count };
    }
    return null;
  }
  if (unit === "days" && count === 1) return { timeframe: "1d", group: 1 };
  if (unit === "weeks" && count === 1) return { timeframe: "1d", group: 7 };
  if (unit === "months" && count === 1) return { timeframe: "1d", group: 30 };
  if (unit === "days" || unit === "weeks" || unit === "months") {
    const step = intervalSeconds(interval);
    const group = Math.max(1, Math.round(step / 86_400));
    return { timeframe: "1d", group };
  }
  return null;
}

interface ChartHistoryResponse {
  symbol?: string;
  timeframe?: string;
  group?: number;
  count?: number;
  bars?: unknown[];
  detail?: string;
}

function parsePackedBar(row: unknown): Bar | null {
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

/**
 * Deep OHLC from VPS Mongo via chart_ws.
 * `before` (= exclusive `range.to`) enables TradingView left-scroll paging.
 */
export async function fetchCpChartHistory(
  apiSymbol: string,
  interval: Interval,
  range: BarRange,
): Promise<Bar[]> {
  const plan = mongoHistoryPlan(interval);
  if (!plan) throw new Error(`cp-chart-history: unsupported interval ${interval}`);

  const target = targetHistoryDepth(interval);
  // Large pages so scroll-back reaches 20k/10k/5k without dozens of round-trips.
  const limit = Math.min(target, Math.max(range.countBack + 100, 2_000));

  const url = buildUrl(CHART_HISTORY_BASE, {
    symbol: apiSymbol.toLowerCase(),
    timeframe: plan.timeframe,
    group: plan.group,
    limit,
    before: range.to,
  });

  const json = await fetchJson<ChartHistoryResponse>(url, { timeoutMs: REQUEST_TIMEOUT_MS });
  if (json.detail) throw new Error(json.detail);

  const bars = (json.bars ?? [])
    .map(parsePackedBar)
    .filter((b): b is Bar => b !== null)
    .filter((b) => b.time < range.to)
    .sort((a, b) => a.time - b.time);

  if (!bars.length) return [];
  return bars.slice(-Math.max(range.countBack, 1));
}
