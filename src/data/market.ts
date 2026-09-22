import type { Bar, Interval, SymbolInfo } from "../engine/types";
import { BINANCE_UNIVERSE, BINANCE_WATCH, fetchBinanceHistory, fetchBinanceQuotes, subscribeBinanceKline } from "./binance";
import {
  chartApiHealth,
  fetchChartApiHistory,
  fetchChartApiQuotes,
  fetchChartApiSymbols,
  subscribeChartApi,
} from "./chartApi";
import { FOREXCOM_UNIVERSE, FOREXCOM_WATCH } from "./forexcom";
import { generateBars, setUniverse, UNIVERSE, watchlistSymbols } from "./feed";
import { fetchYahooHistory, fetchYahooQuotes, subscribeYahooBar } from "./yahoo";

export type FeedMeta = {
  bars: Bar[];
  live: boolean;
  source: "chart-api" | "binance" | "forexcom" | "demo";
};

let chartApiReady: boolean | null = null;
let detectPromise: Promise<boolean> | null = null;

export async function detectChartApi(): Promise<boolean> {
  if (chartApiReady != null) return chartApiReady;
  if (!detectPromise) {
    detectPromise = chartApiHealth()
      .then((ok) => {
        chartApiReady = ok;
        return ok;
      })
      .catch(() => {
        chartApiReady = false;
        return false;
      });
  }
  return detectPromise;
}

export async function loadCatalog(): Promise<SymbolInfo[]> {
  const byKey = new Map<string, SymbolInfo>();
  const add = (rows: SymbolInfo[]) => {
    for (const s of rows) {
      const exchange =
        s.exchange.toUpperCase() === "FOREXCOM"
          ? "FOREXCOM"
          : s.exchange.toUpperCase() === "BINANCE"
            ? "BINANCE"
            : s.exchange;
      if (exchange !== "BINANCE" && exchange !== "FOREXCOM") continue;
      byKey.set(`${exchange}:${s.ticker}`, { ...s, exchange });
    }
  };

  add(BINANCE_UNIVERSE);
  add(FOREXCOM_UNIVERSE);
  setUniverse([...byKey.values()]);

  const apiOk = await detectChartApi();
  if (apiOk) {
    const apiSymbols = await fetchChartApiSymbols(["BINANCE", "FOREXCOM"]).catch(() => []);
    if (apiSymbols.length) {
      add(apiSymbols);
      setUniverse(
        [...byKey.values()].sort(
          (a, b) => a.exchange.localeCompare(b.exchange) || a.ticker.localeCompare(b.ticker),
        ),
      );
    }
  }
  return UNIVERSE;
}

export async function fetchHistory(symbol: SymbolInfo, interval: Interval): Promise<FeedMeta> {
  const apiOk = chartApiReady ?? (await detectChartApi());
  if (apiOk) {
    try {
      const bars = await fetchChartApiHistory(symbol, interval);
      if (bars.length) return { bars, live: true, source: "chart-api" };
    } catch (err) {
      console.warn("chart api history failed", err);
    }
  }

  try {
    if (symbol.exchange === "BINANCE") {
      const bars = await fetchBinanceHistory(symbol.ticker, interval, 500);
      if (bars.length) return { bars, live: true, source: "binance" };
    }
    if (symbol.exchange === "FOREXCOM") {
      const bars = await fetchYahooHistory(symbol.ticker, interval);
      if (bars.length) return { bars, live: true, source: "forexcom" };
    }
  } catch (err) {
    console.warn("exchange history failed, using demo", err);
  }

  return { bars: generateBars(symbol, interval, 400), live: false, source: "demo" };
}

export function subscribeLive(
  symbol: SymbolInfo,
  interval: Interval,
  onBar: (bar: Bar) => void,
): () => void {
  if (chartApiReady) {
    return subscribeChartApi(symbol, interval, onBar);
  }
  if (symbol.exchange === "BINANCE") return subscribeBinanceKline(symbol.ticker, interval, onBar);
  if (symbol.exchange === "FOREXCOM") return subscribeYahooBar(symbol, interval, onBar);
  return () => {};
}

export async function fetchQuotes(universe: SymbolInfo[] = UNIVERSE): Promise<Record<string, { price: number; change: number }>> {
  const out: Record<string, { price: number; change: number }> = {};
  const focus = watchlistSymbols(universe).slice(0, 40);
  const binance = focus.filter((s) => s.exchange === "BINANCE").map((s) => s.ticker);
  const forex = focus.filter((s) => s.exchange === "FOREXCOM").map((s) => s.ticker);
  const forexTickers = (
    FOREXCOM_WATCH.filter((t) => forex.includes(t)).length
      ? FOREXCOM_WATCH.filter((t) => forex.includes(t))
      : forex
  ).slice(0, 16);

  const jobs: Array<Promise<void>> = [];
  if (chartApiReady) {
    jobs.push(
      fetchChartApiQuotes(focus)
        .then((q) => {
          Object.assign(out, q);
        })
        .catch(() => undefined),
    );
  } else {
    if (binance.length) {
      jobs.push(
        fetchBinanceQuotes(binance.length ? binance : BINANCE_WATCH)
          .then((q) => {
            Object.assign(out, q);
          })
          .catch(() => undefined),
      );
    }
    if (forexTickers.length) {
      jobs.push(
        fetchYahooQuotes(forexTickers)
          .then((q) => {
            Object.assign(out, q);
          })
          .catch(() => undefined),
      );
    }
  }
  await Promise.all(jobs);
  return out;
}
