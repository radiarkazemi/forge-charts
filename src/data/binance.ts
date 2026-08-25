import type { Bar, Interval, SymbolInfo } from "../engine/types";

export const BINANCE_REST = "/binance";
export const BINANCE_WS = "wss://data-stream.binance.vision/ws";

export const BINANCE_IV: Record<Interval, string> = {
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

export const BINANCE_WATCH = [
  "BTCUSDT",
  "ETHUSDT",
  "BNBUSDT",
  "SOLUSDT",
  "XRPUSDT",
  "DOGEUSDT",
  "ADAUSDT",
  "AVAXUSDT",
  "LINKUSDT",
  "DOTUSDT",
  "LTCUSDT",
  "BCHUSDT",
  "ATOMUSDT",
  "NEARUSDT",
  "SUIUSDT",
  "TONUSDT",
];

type Kline = [number, string, string, string, string, string];

function toBars(raw: Kline[]): Bar[] {
  return raw
    .map((k) => ({
      time: Math.floor(k[0] / 1000),
      open: +k[1],
      high: +k[2],
      low: +k[3],
      close: +k[4],
      volume: +k[5],
    }))
    .filter((b) => Number.isFinite(b.open) && Number.isFinite(b.close));
}

function precisionFromPrice(price: string): number {
  const i = price.indexOf(".");
  if (i < 0) return 2;
  const frac = price.slice(i + 1).replace(/0+$/, "");
  return frac.length || 2;
}

export async function fetchBinanceSymbols(): Promise<SymbolInfo[]> {
  const res = await fetch(`${BINANCE_REST}/api/v3/ticker/24hr`);
  if (!res.ok) throw new Error(`binance ticker ${res.status}`);
  const rows = (await res.json()) as Array<{ symbol: string; lastPrice: string; quoteVolume?: string }>;
  return rows
    .filter((s) => s.symbol.endsWith("USDT") || s.symbol.endsWith("USDC"))
    .sort((a, b) => Number(b.quoteVolume ?? 0) - Number(a.quoteVolume ?? 0))
    .map((s) => {
      const quote = s.symbol.endsWith("USDC") ? "USDC" : "USDT";
      const base = s.symbol.slice(0, -quote.length);
      return {
        ticker: s.symbol,
        name: `${base} / ${quote}`,
        exchange: "BINANCE",
        type: "crypto" as const,
        pricePrecision: precisionFromPrice(s.lastPrice),
      };
    });
}

export async function fetchBinanceHistory(symbol: string, interval: Interval, pages = 2): Promise<Bar[]> {
  const iv = BINANCE_IV[interval];
  const all: Bar[] = [];
  let endTime: number | undefined;
  for (let i = 0; i < pages; i++) {
    const qs = new URLSearchParams({ symbol, interval: iv, limit: "1000" });
    if (endTime) qs.set("endTime", String(endTime));
    const res = await fetch(`${BINANCE_REST}/api/v3/klines?${qs}`);
    if (!res.ok) throw new Error(`binance klines ${res.status}`);
    const raw = (await res.json()) as Kline[];
    const bars = toBars(raw);
    if (!bars.length) break;
    all.unshift(...bars);
    endTime = raw[0][0] - 1;
    if (raw.length < 1000) break;
  }
  const seen = new Set<number>();
  return all.filter((b) => {
    if (seen.has(b.time)) return false;
    seen.add(b.time);
    return true;
  });
}

export async function fetchBinanceQuotes(tickers?: string[]): Promise<Record<string, { price: number; change: number }>> {
  const url = tickers?.length
    ? `${BINANCE_REST}/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(tickers))}`
    : `${BINANCE_REST}/api/v3/ticker/24hr`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`binance ticker ${res.status}`);
  const rows = (await res.json()) as Array<{ symbol: string; lastPrice: string; priceChangePercent: string }>;
  const out: Record<string, { price: number; change: number }> = {};
  for (const row of rows) {
    if (tickers && !tickers.includes(row.symbol)) continue;
    if (!tickers && !row.symbol.endsWith("USDT") && !row.symbol.endsWith("USDC")) continue;
    out[row.symbol] = { price: +row.lastPrice, change: +row.priceChangePercent };
  }
  return out;
}

export function subscribeBinanceKline(symbol: string, interval: Interval, onBar: (bar: Bar) => void): () => void {
  const stream = `${symbol.toLowerCase()}@kline_${BINANCE_IV[interval]}`;
  let ws: WebSocket | null = null;
  let closed = false;
  let retry = 0;
  let timer = 0;

  const connect = () => {
    if (closed) return;
    ws = new WebSocket(`${BINANCE_WS}/${stream}`);
    ws.onmessage = (ev) => {
      if (closed) return;
      retry = 0;
      const k = JSON.parse(String(ev.data))?.k;
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
    ws.onclose = () => {
      if (closed) return;
      const wait = Math.min(15000, 800 * 2 ** retry++);
      timer = window.setTimeout(connect, wait);
    };
    ws.onerror = () => ws?.close();
  };

  connect();
  return () => {
    closed = true;
    window.clearTimeout(timer);
    ws?.close();
  };
}
