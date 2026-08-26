import type { Bar, Interval, SymbolInfo } from "../engine/types";
import { parseInterval } from "./interval";
import { generateBars, UNIVERSE } from "./feed";

/** Binance spot pairs available through the Vite /binance proxy. */
const BINANCE: Record<string, string> = {
  BTCUSD: "BTCUSDT",
  ETHUSD: "ETHUSDT",
  SOLUSD: "SOLUSDT",
  BNBUSDT: "BNBUSDT",
  XRPUSD: "XRPUSDT",
};

/** Yahoo Finance symbols (XAUUSD = GC=F gold futures). */
const YAHOO: Record<string, string> = {
  XAUUSD: "GC=F",
  XAGUSD: "SI=F",
  USOIL: "CL=F",
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
  "GC1!": "GC=F",
  "CL1!": "CL=F",
};

const BINANCE_IV: Record<string, string> = {
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

function toBars(rows: Array<{ t: number; o: number; h: number; l: number; c: number; v: number }>): Bar[] {
  return rows
    .filter((r) => Number.isFinite(r.o) && Number.isFinite(r.c) && Number.isFinite(r.t))
    .map((r) => ({ time: r.t, open: r.o, high: r.h, low: r.l, close: r.c, volume: r.v || 0 }));
}

function yahooParams(interval: Interval): { interval: string; range: string } {
  const sec = parseInterval(interval).seconds;
  if (sec <= 60) return { interval: "1m", range: "5d" };
  if (sec <= 120) return { interval: "2m", range: "5d" };
  if (sec <= 300) return { interval: "5m", range: "1mo" };
  if (sec <= 900) return { interval: "15m", range: "1mo" };
  if (sec <= 1800) return { interval: "30m", range: "1mo" };
  if (sec <= 3600) return { interval: "60m", range: "3mo" };
  if (sec <= 5400) return { interval: "90m", range: "3mo" };
  if (sec <= 86400) return { interval: "1d", range: "2y" };
  if (sec <= 604800) return { interval: "1wk", range: "10y" };
  return { interval: "1mo", range: "max" };
}

function binanceInterval(interval: Interval): string {
  if (BINANCE_IV[interval]) return BINANCE_IV[interval];
  const sec = parseInterval(interval).seconds;
  if (sec <= 60) return "1m";
  if (sec <= 180) return "3m";
  if (sec <= 300) return "5m";
  if (sec <= 900) return "15m";
  if (sec <= 1800) return "30m";
  if (sec <= 3600) return "1h";
  if (sec <= 7200) return "2h";
  if (sec <= 14400) return "4h";
  if (sec <= 86400) return "1d";
  if (sec <= 604800) return "1w";
  return "1M";
}

async function fetchBinance(ticker: string, interval: Interval): Promise<Bar[]> {
  const pair = BINANCE[ticker];
  if (!pair) throw new Error("not binance");
  const iv = binanceInterval(interval);
  const res = await fetch(`/binance/api/v3/klines?symbol=${pair}&interval=${iv}&limit=1000`);
  if (!res.ok) throw new Error(`binance ${res.status}`);
  const raw = (await res.json()) as Array<[number, string, string, string, string, string]>;
  const bars = toBars(
    raw.map((k) => ({
      t: Math.floor(k[0] / 1000),
      o: +k[1],
      h: +k[2],
      l: +k[3],
      c: +k[4],
      v: +k[5],
    })),
  );
  if (!bars.length) throw new Error("binance empty");
  return bars;
}

async function fetchYahoo(ticker: string, interval: Interval): Promise<Bar[]> {
  const y = YAHOO[ticker];
  if (!y) throw new Error("not yahoo");
  const { interval: iv, range } = yahooParams(interval);
  const res = await fetch(`/yahoo/v8/finance/chart/${encodeURIComponent(y)}?interval=${iv}&range=${range}`);
  if (!res.ok) throw new Error(`yahoo ${res.status}`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(json?.chart?.error?.description || "yahoo empty");
  const ts: number[] = result.timestamp ?? [];
  const q = result.indicators?.quote?.[0] ?? {};
  const bars = toBars(
    ts.map((t, i) => ({
      t,
      o: q.open?.[i],
      h: q.high?.[i],
      l: q.low?.[i],
      c: q.close?.[i],
      v: q.volume?.[i],
    })),
  );
  if (!bars.length) throw new Error("yahoo empty bars");
  return bars;
}

export async function fetchHistory(symbol: SymbolInfo, interval: Interval): Promise<{ bars: Bar[]; live: boolean }> {
  try {
    if (BINANCE[symbol.ticker]) {
      return { bars: await fetchBinance(symbol.ticker, interval), live: true };
    }
    if (YAHOO[symbol.ticker]) {
      return { bars: await fetchYahoo(symbol.ticker, interval), live: true };
    }
  } catch (err) {
    console.warn("live history failed, using demo", err);
  }
  return { bars: generateBars(symbol, interval), live: false };
}

export function subscribeLive(
  symbol: SymbolInfo,
  interval: Interval,
  onBar: (bar: Bar) => void,
): () => void {
  if (BINANCE[symbol.ticker]) {
    const pair = BINANCE[symbol.ticker].toLowerCase();
    const iv = binanceInterval(interval);
    const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${pair}@kline_${iv}`);
    ws.onmessage = (ev) => {
      const k = JSON.parse(ev.data as string)?.k;
      if (!k) return;
      onBar({
        time: Math.floor(k.t / 1000),
        open: +k.o,
        high: +k.h,
        low: +k.l,
        close: +k.c,
        volume: +k.v,
      });
    };
    return () => ws.close();
  }

  if (YAHOO[symbol.ticker]) {
    const tick = async () => {
      try {
        const bars = await fetchYahoo(symbol.ticker, interval);
        const last = bars.at(-1);
        if (last) onBar(last);
      } catch {
        /* keep previous */
      }
    };
    void tick();
    const id = window.setInterval(tick, 3000);
    return () => window.clearInterval(id);
  }

  return () => {};
}

export async function fetchQuotes(): Promise<Record<string, { price: number; change: number }>> {
  const out: Record<string, { price: number; change: number }> = {};

  try {
    const pairs = Object.values(BINANCE);
    const res = await fetch(`/binance/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(pairs))}`);
    if (res.ok) {
      const rows = (await res.json()) as Array<{ symbol: string; lastPrice: string; priceChangePercent: string }>;
      const rev = Object.fromEntries(Object.entries(BINANCE).map(([a, b]) => [b, a]));
      for (const row of rows) {
        const ticker = rev[row.symbol];
        if (ticker) out[ticker] = { price: +row.lastPrice, change: +row.priceChangePercent };
      }
    }
  } catch {
    /* ignore */
  }

  // Parallel Yahoo chart quotes for metals/FX/stocks (fast, no cp_fetcher).
  await Promise.all(
    Object.keys(YAHOO).map(async (ticker) => {
      if (out[ticker]) return;
      try {
        const bars = await fetchYahoo(ticker, "1D");
        const last = bars.at(-1);
        const prev = bars.at(-2);
        if (last) {
          out[ticker] = {
            price: last.close,
            change: prev ? ((last.close - prev.close) / prev.close) * 100 : 0,
          };
        }
      } catch {
        /* ignore */
      }
    }),
  );

  for (const s of UNIVERSE) {
    if (out[s.ticker]) continue;
    const fallback = generateBars(s, "60", 3);
    const last = fallback.at(-1);
    const prev = fallback.at(-2);
    if (last && prev) out[s.ticker] = { price: last.close, change: ((last.close - prev.close) / prev.close) * 100 };
  }
  return out;
}
