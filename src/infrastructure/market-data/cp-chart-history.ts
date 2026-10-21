import { intervalSeconds, parseInterval, type Bar, type BarRange, type Interval } from "@/domain";
import { buildUrl, fetchJson } from "../http/fetch-json";

/** VPS cp_fetcher chart_ws HTTP (nginx `/crypto-chart/` → :8003). */
const CHART_HISTORY_BASE = "/crypto-chart/history";
const REQUEST_TIMEOUT_MS = 45_000;

/** Target depths for TradingView scroll-back (as many as Mongo can serve). */
export function targetHistoryDepth(interval: Interval): number {
  const { unit, count } = parseInterval(interval);
  // Keep first pages modest — TV left-scroll pages more. Huge limits + on-read
  // expand starved the 2GB VPS (504s on /crypto-chart/history).
  if (unit === "minutes" && count === 1) return 20_000;
  if (unit === "minutes" && count === 5) return 10_000;
  return 5_000;
}

/**
 * Map a TV interval onto a native Mongo parent + group multiplier.
 * Other TFs are created by aggregating existing 1m / 1h / 1d candles.
 */
export function mongoHistoryPlan(interval: Interval): { timeframe: "1m" | "1h" | "1d"; group: number } | null {
  const { unit, count } = parseInterval(interval);
  if (unit === "seconds") return null;
  if (unit === "minutes") {
    if (count === 60) return { timeframe: "1h", group: 1 };
    if (count > 60 && count % 60 === 0) return { timeframe: "1h", group: count / 60 };
    if (count >= 1 && count <= 720) return { timeframe: "1m", group: count };
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
  parent?: string;
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

/** FX session open used by `SESSION_FX` with `Etc/UTC` (`2200-2159:123456`). */
const FX_SESSION_OPEN_SEC = 22 * 3_600;

/**
 * Snap a daily bar onto the TradingView FX daily grid (22:00 UTC).
 *
 * Mongo XAUUSD dailies alternate 22:00 UTC (EDT months) and 23:00 UTC (EST).
 * With symbol.timezone `Etc/UTC`, the library only keeps bars on the 22:00
 * grid — winter 23:00 stamps are dropped, which carved Nov→spring holes on 1D.
 */
export function alignFxSessionDailyTime(timeSec: number): number {
  const day = Math.floor(timeSec / 86_400) * 86_400;
  const tod = timeSec - day;
  if (tod < FX_SESSION_OPEN_SEC) {
    return day - 86_400 + FX_SESSION_OPEN_SEC;
  }
  return day + FX_SESSION_OPEN_SEC;
}

/** Dedupe daily bars onto the 22:00 UTC session grid (last write wins). */
export function alignFxDailyBars(bars: readonly Bar[]): Bar[] {
  const byTime = new Map<number, Bar>();
  for (const bar of bars) {
    const time = alignFxSessionDailyTime(bar.time);
    byTime.set(time, { ...bar, time });
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

/**
 * Deep OHLC from VPS Mongo via chart_ws — derived TFs aggregated from base candles.
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
  const limit = Math.min(target, Math.max(range.countBack + 100, 2_000));

  // Pass TV interval so the server can resolve parent+group (and still accept explicit group).
  const before = range.to > 0 ? range.to : Number.POSITIVE_INFINITY;
  const url = buildUrl(CHART_HISTORY_BASE, {
    symbol: apiSymbol.toLowerCase(),
    interval,
    timeframe: plan.timeframe,
    group: plan.group,
    limit,
    before: range.to > 0 ? range.to : undefined,
  });

  const json = await fetchJson<ChartHistoryResponse>(url, { timeoutMs: REQUEST_TIMEOUT_MS });
  if (json.detail) throw new Error(json.detail);

  let bars = (json.bars ?? [])
    .map(parsePackedBar)
    .filter((b): b is Bar => b !== null)
    .filter((b) => b.time < before)
    .sort((a, b) => a.time - b.time);

  // Native 1D only — weekly/monthly aggregates keep server bucket times.
  if (plan.timeframe === "1d" && plan.group === 1) {
    bars = alignFxDailyBars(bars).filter((b) => b.time < before);
  }

  if (!bars.length) return [];
  return bars.slice(-Math.max(range.countBack, 1));
}
