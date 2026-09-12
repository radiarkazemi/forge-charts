import type { Bar, Interval, SymbolInfo } from "../engine/types";
import { parseInterval } from "./interval";

export const BINANCE_REST = "/binance";
export const BINANCE_WS = "wss://data-stream.binance.vision/ws";

export const BINANCE_IV: Record<string, string> = {
  "1": "1m",
  "2": "1m",
  "3": "1m",
  "4": "1m",
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

/** Native Binance interval + optional client-side grouping (for 2m/3m/4m). */
function resolveBinanceIv(interval: Interval): { iv: string; group: number; stepSec: number } {
  const known = BINANCE_IV[interval];
  const p = parseInterval(interval);
  if (p.kind === "minutes" && (p.n === 2 || p.n === 3 || p.n === 4)) {
    return { iv: "1m", group: p.n, stepSec: 60 };
  }
  if (known) return { iv: known, group: 1, stepSec: 60 };
  if (p.kind === "minutes" && p.n < 60) {
    const native = BINANCE_IV[String(p.n)];
    if (native) return { iv: native, group: 1, stepSec: 60 };
    return { iv: "1m", group: Math.max(1, p.n), stepSec: 60 };
  }
  return { iv: known ?? "15m", group: 1, stepSec: 60 };
}

function aggregateBars(bars: Bar[], group: number, stepSec: number): Bar[] {
  if (group <= 1 || bars.length === 0) return bars;
  const bucket = stepSec * group;
  const out: Bar[] = [];
  let cur: Bar | null = null;
  let bucketStart = 0;
  for (const b of bars) {
    const start = Math.floor(b.time / bucket) * bucket;
    if (!cur || start !== bucketStart) {
      if (cur) out.push(cur);
      bucketStart = start;
      cur = { ...b, time: start };
    } else {
      cur.high = Math.max(cur.high, b.high);
      cur.low = Math.min(cur.low, b.low);
      cur.close = b.close;
      cur.volume += b.volume;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** Curated list — never download the full exchange catalog on startup. */
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
  "TRXUSDT",
  "MATICUSDT",
  "UNIUSDT",
  "APTUSDT",
  "ARBUSDT",
  "OPUSDT",
  "INJUSDT",
  "FILUSDT",
  "AAVEUSDT",
  "PEPEUSDT",
  "SHIBUSDT",
  "WIFUSDT",
  "BONKUSDT",
  "RENDERUSDT",
];

const NAMES: Record<string, string> = {
  BTCUSDT: "Bitcoin / Tether",
  ETHUSDT: "Ethereum / Tether",
  BNBUSDT: "BNB / Tether",
  SOLUSDT: "Solana / Tether",
  XRPUSDT: "XRP / Tether",
  DOGEUSDT: "Dogecoin / Tether",
  ADAUSDT: "Cardano / Tether",
  AVAXUSDT: "Avalanche / Tether",
  LINKUSDT: "Chainlink / Tether",
  DOTUSDT: "Polkadot / Tether",
  LTCUSDT: "Litecoin / Tether",
  BCHUSDT: "Bitcoin Cash / Tether",
  ATOMUSDT: "Cosmos / Tether",
  NEARUSDT: "NEAR / Tether",
  SUIUSDT: "Sui / Tether",
  TONUSDT: "Toncoin / Tether",
  TRXUSDT: "TRON / Tether",
  MATICUSDT: "Polygon / Tether",
  UNIUSDT: "Uniswap / Tether",
  APTUSDT: "Aptos / Tether",
  ARBUSDT: "Arbitrum / Tether",
  OPUSDT: "Optimism / Tether",
  INJUSDT: "Injective / Tether",
  FILUSDT: "Filecoin / Tether",
  AAVEUSDT: "Aave / Tether",
  PEPEUSDT: "Pepe / Tether",
  SHIBUSDT: "Shiba Inu / Tether",
  WIFUSDT: "dogwifhat / Tether",
  BONKUSDT: "Bonk / Tether",
  RENDERUSDT: "Render / Tether",
};

export const BINANCE_UNIVERSE: SymbolInfo[] = BINANCE_WATCH.map((ticker) => {
  const quote = ticker.endsWith("USDC") ? "USDC" : "USDT";
  const base = ticker.slice(0, -quote.length);
  return {
    ticker,
    name: NAMES[ticker] ?? `${base} / ${quote}`,
    exchange: "BINANCE",
    type: "crypto",
    pricePrecision: ticker.includes("PEPE") || ticker.includes("SHIB") || ticker.includes("BONK") ? 8 : 4,
  };
});

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

export function binanceSymbol(ticker: string): SymbolInfo {
  const upper = ticker.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const known = BINANCE_UNIVERSE.find((s) => s.ticker === upper);
  if (known) return known;
  const quote = upper.endsWith("USDC") ? "USDC" : "USDT";
  const base = upper.endsWith(quote) ? upper.slice(0, -quote.length) : upper;
  return {
    ticker: upper.endsWith(quote) ? upper : `${upper}USDT`,
    name: `${base} / ${quote}`,
    exchange: "BINANCE",
    type: "crypto",
    pricePrecision: 4,
  };
}

export async function fetchBinanceSymbols(): Promise<SymbolInfo[]> {
  // Instant catalog — avoid the multi‑MB /ticker/24hr dump on every page load.
  return BINANCE_UNIVERSE;
}

export async function fetchBinanceHistory(symbol: string, interval: Interval, limit = 500): Promise<Bar[]> {
  const { iv, group, stepSec } = resolveBinanceIv(interval);
  const fetchLimit = group > 1 ? Math.min(1000, Math.max(50, limit * group)) : Math.min(1000, Math.max(50, limit));
  const qs = new URLSearchParams({
    symbol,
    interval: iv,
    limit: String(fetchLimit),
  });
  const res = await fetch(`${BINANCE_REST}/api/v3/klines?${qs}`);
  if (!res.ok) throw new Error(`binance klines ${res.status}`);
  const bars = toBars((await res.json()) as Kline[]);
  return aggregateBars(bars, group, stepSec);
}

export async function fetchBinanceQuotes(tickers: string[] = BINANCE_WATCH): Promise<Record<string, { price: number; change: number }>> {
  const symbols = tickers.length ? tickers : BINANCE_WATCH;
  const url = `${BINANCE_REST}/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(symbols))}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`binance ticker ${res.status}`);
  const rows = (await res.json()) as Array<{ symbol: string; lastPrice: string; priceChangePercent: string }>;
  const out: Record<string, { price: number; change: number }> = {};
  for (const row of rows) {
    out[row.symbol] = { price: +row.lastPrice, change: +row.priceChangePercent };
  }
  return out;
}

export function subscribeBinanceKline(symbol: string, interval: Interval, onBar: (bar: Bar) => void): () => void {
  const { iv } = resolveBinanceIv(interval);
  const stream = `${symbol.toLowerCase()}@kline_${iv}`;
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
