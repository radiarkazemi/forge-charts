import type { Bar, Interval, SymbolInfo } from "../engine/types";
import { FOREXCOM_YAHOO } from "./forexcom";

export const YAHOO_IV: Record<Interval, { interval: string; range: string }> = {
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

export function yahooSymbol(ticker: string): string | undefined {
  return FOREXCOM_YAHOO[ticker];
}

export async function fetchYahooHistory(ticker: string, interval: Interval): Promise<Bar[]> {
  const y = yahooSymbol(ticker);
  if (!y) throw new Error(`no yahoo map for ${ticker}`);
  const { interval: iv, range } = YAHOO_IV[interval];
  const url = `/yahoo/v8/finance/chart/${encodeURIComponent(y)}?interval=${iv}&range=${range}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`yahoo ${res.status}`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error("yahoo empty");
  const ts: number[] = result.timestamp ?? [];
  const q = result.indicators?.quote?.[0] ?? {};
  const bars: Bar[] = [];
  for (let i = 0; i < ts.length; i++) {
    const open = q.open?.[i];
    const close = q.close?.[i];
    if (!Number.isFinite(open) || !Number.isFinite(close)) continue;
    bars.push({
      time: ts[i],
      open,
      high: q.high?.[i] ?? Math.max(open, close),
      low: q.low?.[i] ?? Math.min(open, close),
      close,
      volume: q.volume?.[i] || 0,
    });
  }
  return bars;
}

export async function fetchYahooQuotes(tickers: string[]): Promise<Record<string, { price: number; change: number }>> {
  const out: Record<string, { price: number; change: number }> = {};
  const reverse = new Map<string, string>();
  const yahoo: string[] = [];
  for (const ticker of tickers) {
    const y = yahooSymbol(ticker);
    if (!y || reverse.has(y)) continue;
    reverse.set(y, ticker);
    yahoo.push(y);
  }
  for (let i = 0; i < yahoo.length; i += 8) {
    const batch = yahoo.slice(i, i + 8);
    const url = `/yahoo/v7/finance/spark?symbols=${encodeURIComponent(batch.join(","))}&range=5d&interval=1d`;
    const res = await fetch(url);
    if (!res.ok) continue;
    const json = await res.json();
    const rows = json?.spark?.result ?? [];
    for (const row of rows) {
      const ticker = reverse.get(row.symbol);
      const meta = row.response?.[0]?.meta ?? {};
      const price = meta.regularMarketPrice;
      const prev = meta.chartPreviousClose ?? meta.previousClose;
      if (!ticker || !Number.isFinite(price)) continue;
      const change = Number.isFinite(prev) && prev ? ((price - prev) / prev) * 100 : 0;
      out[ticker] = { price, change };
    }
  }
  return out;
}

export function subscribeYahooBar(
  symbol: SymbolInfo,
  interval: Interval,
  onBar: (bar: Bar) => void,
): () => void {
  const id = window.setInterval(async () => {
    try {
      const bars = await fetchYahooHistory(symbol.ticker, interval);
      const last = bars.at(-1);
      if (last) onBar(last);
    } catch {
      /* keep previous */
    }
  }, 2500);
  return () => window.clearInterval(id);
}
