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

const CHART_BASE = "/api/yahoo/v8/finance/chart";
const SPARK_URL = "/api/yahoo/v8/finance/spark";
const LIVE_POLL_MS = 5_000;
const DAY = 86_400;

const YAHOO_BY_TICKER: Readonly<Record<string, string>> = {
  // Gold (XAUUSD / GC1!) is owned by Germany FOREXCOM/FXPRO — do not map to GC=F
  // or watchlist prices drift ~$40 from the broker series.
  XAGUSD: "SI=F",
  USOIL: "CL=F",
  "CL1!": "CL=F",
  "ES1!": "ES=F",
  "NQ1!": "NQ=F",
  EURUSD: "EURUSD=X",
  GBPUSD: "GBPUSD=X",
  USDJPY: "USDJPY=X",
  AUDUSD: "AUDUSD=X",
  USDCHF: "USDCHF=X",
  SPX: "^GSPC",
  NDX: "^NDX",
  DJI: "^DJI",
  DAX: "^GDAXI",
  AAPL: "AAPL",
  MSFT: "MSFT",
  NVDA: "NVDA",
  TSLA: "TSLA",
  AMZN: "AMZN",
  GOOGL: "GOOGL",
  META: "META",
  SPY: "SPY",
  QQQ: "QQQ",
  GLD: "GLD",
  IWM: "IWM",
  US10Y: "^TNX",
  US02Y: "2YY=F",
  // Crypto fallback for networks where Binance is unreachable (HTTP 451 geo-blocks).
  BTCUSD: "BTC-USD",
  ETHUSD: "ETH-USD",
  SOLUSD: "SOL-USD",
  BNBUSDT: "BNB-USD",
  XRPUSD: "XRP-USD",
};

/** Yahoo interval id and the furthest back that interval is available. */
const YAHOO_INTERVALS: ReadonlyArray<{ interval: Interval; yahoo: string; maxLookbackSec: number }> = [
  { interval: "1", yahoo: "1m", maxLookbackSec: 7 * DAY },
  { interval: "2", yahoo: "2m", maxLookbackSec: 60 * DAY },
  { interval: "5", yahoo: "5m", maxLookbackSec: 60 * DAY },
  { interval: "15", yahoo: "15m", maxLookbackSec: 60 * DAY },
  { interval: "30", yahoo: "30m", maxLookbackSec: 60 * DAY },
  { interval: "60", yahoo: "60m", maxLookbackSec: 730 * DAY },
  { interval: "1D", yahoo: "1d", maxLookbackSec: Infinity },
  { interval: "1W", yahoo: "1wk", maxLookbackSec: Infinity },
  { interval: "1M", yahoo: "1mo", maxLookbackSec: Infinity },
];

/**
 * Multiples of a native Yahoo interval that we aggregate client-side
 * (Yahoo has no 2h/4h/3D chart endpoints).
 */
const AGGREGATE_FROM: ReadonlyArray<{ interval: Interval; parent: Interval; group: number }> = [
  { interval: "120", parent: "60", group: 2 },
  { interval: "180", parent: "60", group: 3 },
  { interval: "240", parent: "60", group: 4 },
  { interval: "360", parent: "60", group: 6 },
  { interval: "480", parent: "60", group: 8 },
  { interval: "720", parent: "60", group: 12 },
  { interval: "3D", parent: "1D", group: 3 },
];

const NATIVE_INTERVALS: readonly Interval[] = [
  ...YAHOO_INTERVALS.map((i) => i.interval),
  ...AGGREGATE_FROM.map((i) => i.interval),
];

function alignTime(tsSec: number, step: number): number {
  return Math.floor(tsSec / step) * step;
}

/** Aggregate lower-TF bars into `stepSec` candles (standard OHLCV rollup). */
function aggregateBars(bars: readonly Bar[], stepSec: number): Bar[] {
  if (stepSec <= 1 || bars.length === 0) return [...bars];
  const out: Bar[] = [];
  let cur: Bar | null = null;
  let bucket = -1;
  for (const bar of bars) {
    const start = alignTime(bar.time, stepSec);
    if (!cur || start !== bucket) {
      if (cur) out.push(cur);
      bucket = start;
      cur = { time: start, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume };
    } else {
      cur = {
        time: start,
        open: cur.open,
        high: Math.max(cur.high, bar.high),
        low: Math.min(cur.low, bar.low),
        close: bar.close,
        volume: cur.volume + bar.volume,
      };
    }
  }
  if (cur) out.push(cur);
  return out;
}

interface ChartQuote {
  open?: (number | null)[];
  high?: (number | null)[];
  low?: (number | null)[];
  close?: (number | null)[];
  volume?: (number | null)[];
}

interface ChartResult {
  meta?: { regularMarketPrice?: number; chartPreviousClose?: number; previousClose?: number };
  timestamp?: number[];
  indicators?: { quote?: ChartQuote[] };
}

interface ChartResponse {
  chart?: { result?: ChartResult[] | null; error?: { description?: string } | null };
}

interface SparkResponse {
  spark?: { result?: Array<{ symbol: string; response?: ChartResult[] }> };
}

function resultToBars(result: ChartResult): Bar[] {
  const timestamps = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0] ?? {};
  const bars: Bar[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const open = quote.open?.[i];
    const close = quote.close?.[i];
    const time = timestamps[i];
    if (open == null || close == null || time == null) continue;
    bars.push({
      time,
      open,
      high: quote.high?.[i] ?? Math.max(open, close),
      low: quote.low?.[i] ?? Math.min(open, close),
      close,
      volume: quote.volume?.[i] ?? 0,
    });
  }
  return bars;
}

function quoteFromResult(ticker: string, result: ChartResult, now: number): Quote | null {
  const meta = result.meta ?? {};
  const bars = resultToBars(result);
  const price = meta.regularMarketPrice ?? bars.at(-1)?.close;
  const previous = meta.chartPreviousClose ?? meta.previousClose ?? bars.at(-2)?.close;
  if (price == null) return null;
  const changePercent = previous ? ((price - previous) / previous) * 100 : 0;
  return { ticker, price, changePercent, updatedAt: now, synthetic: false };
}

/** Yahoo Finance chart API for equities, indices, FX and commodity futures. */
export class YahooProvider implements MarketDataProvider {
  readonly id = "yahoo";
  readonly isSynthetic = false;

  supports(symbol: SymbolInfo, interval: Interval): boolean {
    if (!(symbol.ticker in YAHOO_BY_TICKER)) return false;
    return this.spec(interval) !== null || this.aggregatePlan(interval) !== null;
  }

  nativeIntervals(): readonly Interval[] {
    return NATIVE_INTERVALS;
  }

  async fetchBars(symbol: SymbolInfo, interval: Interval, range: BarRange): Promise<Bar[]> {
    const plan = this.aggregatePlan(interval);
    if (plan) {
      // Fetch denser parent bars, then roll up (e.g. 60m → 4h for AAPL).
      const parentBars = await this.fetchBars(symbol, plan.parent, {
        ...range,
        countBack: Math.max(range.countBack * plan.group, range.countBack + plan.group),
      });
      const step = intervalSeconds(interval);
      return aggregateBars(parentBars, step).filter((bar) => bar.time < range.to);
    }

    const spec = this.spec(interval);
    if (!spec) return [];

    const now = Math.floor(Date.now() / 1000);
    const earliest = now - spec.maxLookbackSec;
    if (range.to <= earliest) return [];

    const period1 = Math.max(range.from, earliest);
    const url = buildUrl(`${CHART_BASE}/${encodeURIComponent(YAHOO_BY_TICKER[symbol.ticker] ?? symbol.ticker)}`, {
      interval: spec.yahoo,
      period1,
      period2: range.to,
      includePrePost: "false",
    });

    try {
      const json = await fetchJson<ChartResponse>(url);
      const result = json.chart?.result?.[0];
      if (!result) return [];
      return resultToBars(result).filter((bar) => bar.time < range.to);
    } catch (error) {
      // Yahoo answers 4xx for ranges it does not keep; that is "no data", not a failure.
      if (error instanceof HttpError && error.status >= 400 && error.status < 500) return [];
      throw error;
    }
  }

  subscribeBars(symbol: SymbolInfo, interval: Interval, onBar: (bar: Bar) => void): Unsubscribe {
    const step = intervalSeconds(interval);
    let lastTime = -1;
    return startPolling(async () => {
      if (!isMarketSessionOpen(symbol)) return;
      const to = Math.floor(Date.now() / 1000) + step;
      const bars = await this.fetchBars(symbol, interval, { from: to - step * 4, to, countBack: 3 });
      const last = bars.at(-1);
      if (!last) return;
      // Do not invent new periods when Yahoo has no fresh bar.
      if (lastTime >= 0 && last.time > lastTime) {
        // allow roll only if bar time is not far in the future / wall-clock empty
        const nowBucket = Math.floor(Date.now() / 1000 / step) * step;
        if (last.time > nowBucket) return;
      }
      lastTime = last.time;
      onBar(last);
    }, LIVE_POLL_MS);
  }

  async fetchQuotes(symbols: readonly SymbolInfo[]): Promise<Quote[]> {
    const known = symbols.filter((s) => s.ticker in YAHOO_BY_TICKER);
    if (known.length === 0) return [];
    const tickerByYahoo = new Map(known.map((s) => [YAHOO_BY_TICKER[s.ticker] ?? s.ticker, s.ticker]));
    const now = Math.floor(Date.now() / 1000);

    try {
      const json = await fetchJson<SparkResponse>(
        buildUrl(SPARK_URL, { symbols: [...tickerByYahoo.keys()].join(","), range: "5d", interval: "1d" }),
      );
      const quotes: Quote[] = [];
      for (const entry of json.spark?.result ?? []) {
        const ticker = tickerByYahoo.get(entry.symbol);
        const result = entry.response?.[0];
        if (!ticker || !result) continue;
        const quote = quoteFromResult(ticker, result, now);
        if (quote) quotes.push(quote);
      }
      if (quotes.length > 0) return quotes;
    } catch {
      /* fall through to per-symbol requests */
    }

    const settled = await Promise.allSettled(
      [...tickerByYahoo.entries()].map(async ([yahoo, ticker]) => {
        const json = await fetchJson<ChartResponse>(
          buildUrl(`${CHART_BASE}/${encodeURIComponent(yahoo)}`, { range: "5d", interval: "1d" }),
        );
        const result = json.chart?.result?.[0];
        return result ? quoteFromResult(ticker, result, now) : null;
      }),
    );
    return settled.flatMap((r) => (r.status === "fulfilled" && r.value ? [r.value] : []));
  }

  private aggregatePlan(interval: Interval): (typeof AGGREGATE_FROM)[number] | null {
    return AGGREGATE_FROM.find((p) => p.interval === interval) ?? null;
  }

  private spec(interval: Interval): (typeof YAHOO_INTERVALS)[number] | null {
    const direct = YAHOO_INTERVALS.find((i) => i.interval === interval);
    if (direct) return direct;
    const { unit, count } = parseInterval(interval);
    if (count !== 1) return null;
    if (unit === "days") return YAHOO_INTERVALS.find((i) => i.interval === "1D") ?? null;
    if (unit === "weeks") return YAHOO_INTERVALS.find((i) => i.interval === "1W") ?? null;
    if (unit === "months") return YAHOO_INTERVALS.find((i) => i.interval === "1M") ?? null;
    return null;
  }
}
