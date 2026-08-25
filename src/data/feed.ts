import { hashString, mulberry32 } from "../engine/math";
import type { Bar, Interval, SymbolInfo } from "../engine/types";
import { BINANCE_UNIVERSE, BINANCE_WATCH } from "./binance";
import { FOREXCOM_UNIVERSE, FOREXCOM_WATCH } from "./forexcom";

export const EXCHANGES = ["BINANCE", "FOREXCOM"] as const;
export type ExchangeId = (typeof EXCHANGES)[number];

export let UNIVERSE: SymbolInfo[] = [...BINANCE_UNIVERSE, ...FOREXCOM_UNIVERSE];

export const INTERVAL_SEC: Record<Interval, number> = {
  "1": 60,
  "5": 300,
  "15": 900,
  "30": 1800,
  "60": 3600,
  "120": 7200,
  "240": 14400,
  "1D": 86400,
  "1W": 604800,
  "1M": 2592000,
};

const BASE: Record<string, number> = {
  BTCUSDT: 79800,
  ETHUSDT: 2480,
  SOLUSDT: 178.4,
  BNBUSDT: 612,
  XRPUSDT: 2.4,
  EURUSD: 1.167,
  GBPUSD: 1.364,
  USDJPY: 159.3,
  XAUUSD: 4687,
  USOIL: 78.4,
  SPX500: 5620,
  NAS100: 20140,
};

export function intervalSeconds(interval: Interval): number {
  return INTERVAL_SEC[interval];
}

export function setUniverse(next: SymbolInfo[]): void {
  const seen = new Set<string>();
  UNIVERSE = next.filter((s) => {
    const key = `${s.exchange}:${s.ticker}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function findSymbol(ticker: string, exchange?: string): SymbolInfo {
  const upper = ticker.toUpperCase();
  const wantEx = exchange?.toUpperCase();
  return (
    UNIVERSE.find((s) => s.ticker === upper && (!wantEx || s.exchange === wantEx)) ??
    UNIVERSE.find((s) => s.ticker === upper) ??
    UNIVERSE[0]
  );
}

export function watchlistSymbols(universe: SymbolInfo[] = UNIVERSE): SymbolInfo[] {
  const wanted = new Set([...BINANCE_WATCH, ...FOREXCOM_WATCH]);
  const picked = universe.filter((s) => wanted.has(s.ticker));
  return picked.length ? picked : universe.slice(0, 40);
}

export function generateBars(symbol: SymbolInfo, interval: Interval, count = 400): Bar[] {
  const step = INTERVAL_SEC[interval];
  const now = Math.floor(Date.now() / 1000);
  const aligned = now - (now % Math.min(step, 86400));
  const rand = mulberry32(hashString(`${symbol.exchange}:${symbol.ticker}:${interval}`));
  let price = BASE[symbol.ticker] ?? (symbol.type === "fx" ? 1.1 : 100);
  const vol = price * (symbol.type === "fx" ? 0.00035 : 0.011);
  const bars: Bar[] = [];

  for (let i = count - 1; i >= 0; i--) {
    const drift = (rand() - 0.48) * vol;
    const shock = rand() > 0.975 ? (rand() - 0.5) * vol * 7 : 0;
    const open = price;
    const close = Math.max(0.0001, open + drift + shock);
    const high = Math.max(open, close) + rand() * vol * 0.65;
    const low = Math.min(open, close) - rand() * vol * 0.65;
    const volume = Math.round((800 + rand() * 9200) * (0.55 + Math.abs(close - open) / vol));
    bars.push({
      time: aligned - i * step,
      open,
      high,
      low,
      close,
      volume,
    });
    price = close;
  }
  return bars;
}
