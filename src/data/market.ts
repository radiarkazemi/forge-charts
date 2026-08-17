import type { Bar, Interval, SymbolInfo } from "../engine/types";
import { generateBars, UNIVERSE } from "./feed";

const BINANCE: Record<string, string> = {
  BTCUSD: "BTCUSDT",
  ETHUSD: "ETHUSDT",
  SOLUSD: "SOLUSDT",
  BNBUSDT: "BNBUSDT",
};

const YAHOO: Record<string, string> = {
  XAUUSD: "GC=F",
  USOIL: "CL=F",
  EURUSD: "EURUSD=X",
  GBPUSD: "GBPUSD=X",
  USDJPY: "USDJPY=X",
  SPX: "^GSPC",
  NDX: "^NDX",
  AAPL: "AAPL",
  NVDA: "NVDA",
  TSLA: "TSLA",
};

const BINANCE_IV: Record<Interval, string> = {
  "1": "1m",
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

const YAHOO_IV: Record<Interval, { interval: string; range: string }> = {
  "1": { interval: "1m", range: "5d" },
  "5": { interval: "5m", range: "1mo" },
  "15": { interval: "15m", range: "1mo" },
  "30": { interval: "30m", range: "1mo" },
  "60": { interval: "60m", range: "3mo" },
  "120": { interval: "60m", range: "3mo" },
  "240": { interval: "60m", range: "6mo" },
  "1D": { interval: "1d", range: "2y" },
  "1W": { interval: "1wk", range: "10y" },
  "1M": { interval: "1mo", range: "max" },
};

function toBars(rows: Array<{ t: number; o: number; h: number; l: number; c: number; v: number }>): Bar[] {
  return rows
    .filter((r) => Number.isFinite(r.o) && Number.isFinite(r.c))
    .map((r) => ({ time: r.t, open: r.o, high: r.h, low: r.l, close: r.c, volume: r.v || 0 }));
}

async function fetchBinance(symbol: string, interval: Interval): Promise<Bar[]> {
  const pair = BINANCE[symbol];
  if (!pair) throw new Error("not binance");
  const url = `/binance/api/v3/klines?symbol=${pair}&interval=${BINANCE_IV[interval]}&limit=1000`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`binance ${res.status}`);
  const raw = (await res.json()) as Array<[number, string, string, string, string, string]>;
  return toBars(
    raw.map((k) => ({
      t: Math.floor(k[0] / 1000),
      o: +k[1],
      h: +k[2],
      l: +k[3],
      c: +k[4],
      v: +k[5],
    })),
  );
}

async function fetchYahoo(symbol: string, interval: Interval): Promise<Bar[]> {
  const y = YAHOO[symbol];
  if (!y) throw new Error("not yahoo");
  const { interval: iv, range } = YAHOO_IV[interval];
  const url = `/yahoo/v8/finance/chart/${encodeURIComponent(y)}?interval=${iv}&range=${range}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`yahoo ${res.status}`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  const ts: number[] = result?.timestamp ?? [];
  const q = result?.indicators?.quote?.[0] ?? {};
  return toBars(
    ts.map((t, i) => ({
      t,
      o: q.open?.[i],
      h: q.high?.[i],
      l: q.low?.[i],
      c: q.close?.[i],
      v: q.volume?.[i],
    })),
  );
}

export async function fetchHistory(symbol: SymbolInfo, interval: Interval): Promise<{ bars: Bar[]; live: boolean }> {
  try {
    if (BINANCE[symbol.ticker]) return { bars: await fetchBinance(symbol.ticker, interval), live: true };
    if (YAHOO[symbol.ticker]) return { bars: await fetchYahoo(symbol.ticker, interval), live: true };
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
    const iv = BINANCE_IV[interval];
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
    const id = window.setInterval(async () => {
      try {
        const bars = await fetchYahoo(symbol.ticker, interval);
        const last = bars.at(-1);
        if (last) onBar(last);
      } catch {
        /* keep previous */
      }
    }, 2500);
    return () => window.clearInterval(id);
  }

  const id = window.setInterval(() => {
    /* demo symbols without a public feed stay static */
  }, 10000);
  return () => window.clearInterval(id);
}

export async function fetchQuotes(): Promise<Record<string, { price: number; change: number }>> {
  const out: Record<string, { price: number; change: number }> = {};
  const crypto = Object.keys(BINANCE);
  try {
    const pairs = crypto.map((t) => BINANCE[t]);
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

  const yahooTickers = Object.keys(YAHOO);
  try {
    const symbols = yahooTickers.map((t) => YAHOO[t]).join(",");
    const res = await fetch(`/yahoo/v7/finance/quote?symbols=${encodeURIComponent(symbols)}`);
    if (res.ok) {
      const json = await res.json();
      const rows = json?.quoteResponse?.result ?? [];
      const rev = Object.fromEntries(Object.entries(YAHOO).map(([a, b]) => [b, a]));
      for (const row of rows) {
        const ticker = rev[row.symbol];
        if (ticker) out[ticker] = { price: row.regularMarketPrice, change: row.regularMarketChangePercent };
      }
    }
  } catch {
    /* ignore */
  }

  for (const s of UNIVERSE) {
    if (!out[s.ticker]) {
      const fallback = generateBars(s, "60", 3);
      const last = fallback.at(-1);
      const prev = fallback.at(-2);
      if (last && prev) out[s.ticker] = { price: last.close, change: ((last.close - prev.close) / prev.close) * 100 };
    }
  }
  return out;
}
