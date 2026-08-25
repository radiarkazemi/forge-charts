import type { Bar, Interval, SymbolInfo } from "../engine/types";
import { fetchBinanceHistory, fetchBinanceQuotes, fetchBinanceSymbols, subscribeBinanceKline } from "./binance";
import {
  chartApiHealth,
  fetchChartApiHistory,
  fetchChartApiQuotes,
  fetchChartApiSymbols,
  subscribeChartApi,
} from "./chartApi";
import { readStoredChartApiUrl } from "./config";
import { FOREXCOM_UNIVERSE, FOREXCOM_WATCH } from "./forexcom";
import { generateBars, setUniverse, UNIVERSE } from "./feed";
import { fetchYahooHistory, fetchYahooQuotes, subscribeYahooBar } from "./yahoo";

export type FeedMeta = {
  bars: Bar[];
  live: boolean;
  source: "chart-api" | "binance" | "forexcom" | "demo";
};

let chartApiReady: boolean | null = null;

function hasExplicitChartApi(): boolean {
  const stored = typeof window !== "undefined" ? readStoredChartApiUrl() : "";
  const env = (import.meta.env.VITE_CHART_API_URL ?? "").trim();
  return Boolean(stored || env);
}

export async function detectChartApi(): Promise<boolean> {
  if (!hasExplicitChartApi()) {
    chartApiReady = false;
    return false;
  }
  chartApiReady = await chartApiHealth();
  return chartApiReady;
}

export async function loadCatalog(): Promise<SymbolInfo[]> {
  const [apiOk, binance] = await Promise.all([
    detectChartApi().catch(() => false),
    fetchBinanceSymbols().catch(() => [] as SymbolInfo[]),
  ]);

  let apiSymbols: SymbolInfo[] = [];
  if (apiOk) {
    apiSymbols = await fetchChartApiSymbols(["BINANCE", "FOREXCOM"]).catch(() => []);
  }

  const byKey = new Map<string, SymbolInfo>();
  const add = (rows: SymbolInfo[]) => {
    for (const s of rows) {
      const exchange = s.exchange.toUpperCase() === "FOREXCOM" ? "FOREXCOM" : s.exchange.toUpperCase() === "BINANCE" ? "BINANCE" : s.exchange;
      if (exchange !== "BINANCE" && exchange !== "FOREXCOM") continue;
      byKey.set(`${exchange}:${s.ticker}`, { ...s, exchange });
    }
  };
  add(binance);
  add(FOREXCOM_UNIVERSE);
  add(apiSymbols);
  const next = [...byKey.values()].sort((a, b) => a.exchange.localeCompare(b.exchange) || a.ticker.localeCompare(b.ticker));
  setUniverse(next.length ? next : UNIVERSE);
  return UNIVERSE;
}

export async function fetchHistory(symbol: SymbolInfo, interval: Interval): Promise<FeedMeta> {
  if (chartApiReady) {
    try {
      const bars = await fetchChartApiHistory(symbol, interval);
      if (bars.length) return { bars, live: true, source: "chart-api" };
    } catch (err) {
      console.warn("chart api history failed", err);
    }
  }

  try {
    if (symbol.exchange === "BINANCE") {
      const bars = await fetchBinanceHistory(symbol.ticker, interval);
      if (bars.length) return { bars, live: true, source: "binance" };
    }
    if (symbol.exchange === "FOREXCOM") {
      const bars = await fetchYahooHistory(symbol.ticker, interval);
      if (bars.length) return { bars, live: true, source: "forexcom" };
    }
  } catch (err) {
    console.warn("exchange history failed, using demo", err);
  }

  return { bars: generateBars(symbol, interval), live: false, source: "demo" };
}

export function subscribeLive(
  symbol: SymbolInfo,
  interval: Interval,
  onBar: (bar: Bar) => void,
): () => void {
  if (chartApiReady) {
    const stopApi = subscribeChartApi(symbol, interval, onBar);
    const stopNative =
      symbol.exchange === "BINANCE"
        ? subscribeBinanceKline(symbol.ticker, interval, onBar)
        : subscribeYahooBar(symbol, interval, onBar);
    return () => {
      stopApi();
      stopNative();
    };
  }
  if (symbol.exchange === "BINANCE") return subscribeBinanceKline(symbol.ticker, interval, onBar);
  if (symbol.exchange === "FOREXCOM") return subscribeYahooBar(symbol, interval, onBar);
  return () => {};
}

export async function fetchQuotes(universe: SymbolInfo[] = UNIVERSE): Promise<Record<string, { price: number; change: number }>> {
  const out: Record<string, { price: number; change: number }> = {};
  const binance = universe.filter((s) => s.exchange === "BINANCE").map((s) => s.ticker);
  const forex = universe.filter((s) => s.exchange === "FOREXCOM").map((s) => s.ticker);

  const jobs: Array<Promise<void>> = [];
  if (chartApiReady) {
    jobs.push(
      fetchChartApiQuotes(universe.slice(0, 80))
        .then((q) => {
          Object.assign(out, q);
        })
        .catch(() => undefined),
    );
  }
  if (binance.length) {
    jobs.push(
      fetchBinanceQuotes()
        .then((q) => {
          Object.assign(out, q);
        })
        .catch(() => undefined),
    );
  }
  if (forex.length) {
    const focus = FOREXCOM_WATCH.filter((t) => forex.includes(t));
    jobs.push(
      fetchYahooQuotes(focus.length ? [...focus, ...forex.filter((t) => !focus.includes(t)).slice(0, 12)] : forex.slice(0, 20))
        .then((q) => {
          Object.assign(out, q);
        })
        .catch(() => undefined),
    );
  }
  await Promise.all(jobs);
  return out;
}
