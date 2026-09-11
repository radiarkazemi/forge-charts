import type { Bar, Interval, SymbolInfo } from "../engine/types";

export const FXPRO_WATCH = ["XAUUSD", "EURUSD", "GBPUSD", "USDJPY", "XAGUSD", "USOIL"];

export const FXPRO_TICKERS = new Set([
  "XAUUSD",
  "XAGUSD",
  "EURUSD",
  "GBPUSD",
  "USDJPY",
  "AUDUSD",
  "USDCHF",
  "USOIL",
  "DJI",
  "GC1!",
  "CL1!",
]);

export function usesFxpro(symbol: SymbolInfo | string): boolean {
  const ticker = typeof symbol === "string" ? symbol : symbol.ticker;
  if (FXPRO_TICKERS.has(ticker.toUpperCase())) return true;
  return typeof symbol !== "string" && symbol.exchange.toUpperCase() === "FXPRO";
}

export async function fetchFxproHistory(ticker: string, interval: Interval, limit = 400): Promise<Bar[]> {
  const qs = new URLSearchParams({
    symbol: ticker.toUpperCase(),
    interval: String(interval),
    limit: String(limit),
  });
  const res = await fetch(`/market-api/history?${qs}`);
  if (!res.ok) throw new Error(`fxpro ${res.status}`);
  const data = (await res.json()) as { items?: Bar[]; error?: string };
  if (data.error) throw new Error(data.error);
  const bars = (data.items ?? []).filter((b) => Number.isFinite(b.time) && Number.isFinite(b.close));
  if (!bars.length) throw new Error("fxpro empty");
  return bars;
}

export async function fetchFxproQuote(ticker: string): Promise<{ price: number; change: number } | null> {
  const res = await fetch(`/market-api/quote?symbol=${encodeURIComponent(ticker.toUpperCase())}`);
  if (!res.ok) return null;
  const data = (await res.json()) as { price?: number; change?: number };
  if (!Number.isFinite(data.price)) return null;
  return { price: data.price as number, change: data.change ?? 0 };
}

export function subscribeFxpro(
  ticker: string,
  interval: Interval,
  onBar: (bar: Bar) => void,
): () => void {
  const qs = `symbol=${encodeURIComponent(ticker.toUpperCase())}&interval=${encodeURIComponent(String(interval))}`;
  const es = new EventSource(`/market-api/stream?${qs}`);
  es.addEventListener("bar", (ev) => {
    try {
      const data = JSON.parse(String((ev as MessageEvent).data || "{}")) as { bar?: Bar };
      if (data.bar && Number.isFinite(data.bar.time) && Number.isFinite(data.bar.close)) onBar(data.bar);
    } catch {
      /* ignore */
    }
  });
  const poll = window.setInterval(async () => {
    try {
      const bars = await fetchFxproHistory(ticker, interval, 80);
      const last = bars.at(-1);
      if (last) onBar(last);
    } catch {
      /* stream may still be connecting */
    }
  }, 8000);
  return () => {
    window.clearInterval(poll);
    es.close();
  };
}
