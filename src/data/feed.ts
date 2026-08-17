import { hashString, mulberry32 } from "../engine/math";
import type { Bar, Interval, SymbolInfo } from "../engine/types";

export const UNIVERSE: SymbolInfo[] = [
  { ticker: "BTCUSD", name: "Bitcoin / U.S. Dollar", exchange: "CRYPTO", type: "crypto", pricePrecision: 2 },
  { ticker: "ETHUSD", name: "Ethereum / U.S. Dollar", exchange: "CRYPTO", type: "crypto", pricePrecision: 2 },
  { ticker: "SOLUSD", name: "Solana / U.S. Dollar", exchange: "CRYPTO", type: "crypto", pricePrecision: 3 },
  { ticker: "BNBUSDT", name: "BNB / Tether", exchange: "CRYPTO", type: "crypto", pricePrecision: 2 },
  { ticker: "EURUSD", name: "Euro / U.S. Dollar", exchange: "FX", type: "fx", pricePrecision: 5 },
  { ticker: "GBPUSD", name: "British Pound / U.S. Dollar", exchange: "FX", type: "fx", pricePrecision: 5 },
  { ticker: "USDJPY", name: "U.S. Dollar / Japanese Yen", exchange: "FX", type: "fx", pricePrecision: 3 },
  { ticker: "XAUUSD", name: "Gold Spot / U.S. Dollar", exchange: "OANDA", type: "metal", pricePrecision: 2 },
  { ticker: "USOIL", name: "WTI Crude Oil", exchange: "TVC", type: "metal", pricePrecision: 2 },
  { ticker: "SPX", name: "S&P 500", exchange: "SP", type: "index", pricePrecision: 2 },
  { ticker: "NDX", name: "US 100", exchange: "NASDAQ", type: "index", pricePrecision: 2 },
  { ticker: "AAPL", name: "Apple Inc.", exchange: "NASDAQ", type: "stock", pricePrecision: 2 },
  { ticker: "NVDA", name: "NVIDIA Corporation", exchange: "NASDAQ", type: "stock", pricePrecision: 2 },
  { ticker: "TSLA", name: "Tesla, Inc.", exchange: "NASDAQ", type: "stock", pricePrecision: 2 },
];

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
  BTCUSD: 97250,
  ETHUSD: 3420,
  SOLUSD: 178.4,
  BNBUSDT: 612,
  EURUSD: 1.0864,
  GBPUSD: 1.2731,
  USDJPY: 148.22,
  XAUUSD: 2645,
  USOIL: 78.4,
  SPX: 5620,
  NDX: 20140,
  AAPL: 227.4,
  NVDA: 131.8,
  TSLA: 248.6,
};

export function intervalSeconds(interval: Interval): number {
  return INTERVAL_SEC[interval];
}

export function findSymbol(ticker: string): SymbolInfo {
  return UNIVERSE.find((s) => s.ticker === ticker) ?? UNIVERSE[0];
}

export function generateBars(symbol: SymbolInfo, interval: Interval, count = 1600): Bar[] {
  const step = INTERVAL_SEC[interval];
  const now = Math.floor(Date.now() / 1000);
  const aligned = now - (now % Math.min(step, 86400));
  const rand = mulberry32(hashString(`${symbol.ticker}:${interval}`));
  let price = BASE[symbol.ticker] ?? 100;
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

export function tickBar(bar: Bar, symbol: SymbolInfo): Bar {
  const vol = bar.close * (symbol.type === "fx" ? 0.00012 : 0.0016);
  const delta = (Math.random() - 0.48) * vol;
  const close = Math.max(0.0001, bar.close + delta);
  return {
    ...bar,
    close,
    high: Math.max(bar.high, close),
    low: Math.min(bar.low, close),
    volume: bar.volume + Math.round(Math.random() * 48),
  };
}
