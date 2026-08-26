import { intervalSeconds, parseInterval } from "./interval";
import { hashString, mulberry32 } from "../engine/math";
import type { Bar, Interval, SymbolInfo } from "../engine/types";

export const UNIVERSE: SymbolInfo[] = [
  { ticker: "AAPL", name: "Apple Inc.", exchange: "NASDAQ", type: "stock", pricePrecision: 2 },
  { ticker: "MSFT", name: "Microsoft Corporation", exchange: "NASDAQ", type: "stock", pricePrecision: 2 },
  { ticker: "NVDA", name: "NVIDIA Corporation", exchange: "NASDAQ", type: "stock", pricePrecision: 2 },
  { ticker: "TSLA", name: "Tesla, Inc.", exchange: "NASDAQ", type: "stock", pricePrecision: 2 },
  { ticker: "AMZN", name: "Amazon.com, Inc.", exchange: "NASDAQ", type: "stock", pricePrecision: 2 },
  { ticker: "GOOGL", name: "Alphabet Inc.", exchange: "NASDAQ", type: "stock", pricePrecision: 2 },
  { ticker: "META", name: "Meta Platforms, Inc.", exchange: "NASDAQ", type: "stock", pricePrecision: 2 },
  { ticker: "SPY", name: "SPDR S&P 500 ETF Trust", exchange: "NYSEARCA", type: "fund", pricePrecision: 2 },
  { ticker: "QQQ", name: "Invesco QQQ Trust", exchange: "NASDAQ", type: "fund", pricePrecision: 2 },
  { ticker: "GLD", name: "SPDR Gold Shares", exchange: "NYSEARCA", type: "fund", pricePrecision: 2 },
  { ticker: "IWM", name: "iShares Russell 2000 ETF", exchange: "NYSEARCA", type: "fund", pricePrecision: 2 },
  { ticker: "ES1!", name: "E-mini S&P 500 Futures", exchange: "CME", type: "future", pricePrecision: 2 },
  { ticker: "NQ1!", name: "E-mini Nasdaq 100 Futures", exchange: "CME", type: "future", pricePrecision: 2 },
  { ticker: "GC1!", name: "Gold Futures", exchange: "COMEX", type: "future", pricePrecision: 2 },
  { ticker: "CL1!", name: "Crude Oil Futures", exchange: "NYMEX", type: "future", pricePrecision: 2 },
  { ticker: "EURUSD", name: "Euro / U.S. Dollar", exchange: "FX", type: "fx", pricePrecision: 5 },
  { ticker: "GBPUSD", name: "British Pound / U.S. Dollar", exchange: "FX", type: "fx", pricePrecision: 5 },
  { ticker: "USDJPY", name: "U.S. Dollar / Japanese Yen", exchange: "FX", type: "fx", pricePrecision: 3 },
  { ticker: "AUDUSD", name: "Australian Dollar / U.S. Dollar", exchange: "FX", type: "fx", pricePrecision: 5 },
  { ticker: "USDCHF", name: "U.S. Dollar / Swiss Franc", exchange: "FX", type: "fx", pricePrecision: 5 },
  { ticker: "BTCUSD", name: "Bitcoin / U.S. Dollar", exchange: "CRYPTO", type: "crypto", pricePrecision: 2 },
  { ticker: "ETHUSD", name: "Ethereum / U.S. Dollar", exchange: "CRYPTO", type: "crypto", pricePrecision: 2 },
  { ticker: "SOLUSD", name: "Solana / U.S. Dollar", exchange: "CRYPTO", type: "crypto", pricePrecision: 3 },
  { ticker: "BNBUSDT", name: "BNB / Tether", exchange: "CRYPTO", type: "crypto", pricePrecision: 2 },
  { ticker: "XRPUSD", name: "XRP / U.S. Dollar", exchange: "CRYPTO", type: "crypto", pricePrecision: 4 },
  { ticker: "SPX", name: "S&P 500", exchange: "SP", type: "index", pricePrecision: 2 },
  { ticker: "NDX", name: "US 100", exchange: "NASDAQ", type: "index", pricePrecision: 2 },
  { ticker: "DJI", name: "Dow Jones Industrial Average", exchange: "DJ", type: "index", pricePrecision: 2 },
  { ticker: "DAX", name: "DAX Index", exchange: "XETR", type: "index", pricePrecision: 2 },
  { ticker: "XAUUSD", name: "Gold Spot / U.S. Dollar", exchange: "OANDA", type: "metal", pricePrecision: 2 },
  { ticker: "USOIL", name: "WTI Crude Oil", exchange: "TVC", type: "metal", pricePrecision: 2 },
  { ticker: "US10Y", name: "U.S. 10Y Treasury Yield", exchange: "TVC", type: "bond", pricePrecision: 3 },
  { ticker: "US02Y", name: "U.S. 2Y Treasury Yield", exchange: "TVC", type: "bond", pricePrecision: 3 },
  { ticker: "DE10Y", name: "Germany 10Y Bond Yield", exchange: "TVC", type: "bond", pricePrecision: 3 },
  { ticker: "USINTR", name: "U.S. Interest Rate", exchange: "ECONOMY", type: "economy", pricePrecision: 2 },
  { ticker: "USCPI", name: "U.S. Consumer Price Index", exchange: "ECONOMY", type: "economy", pricePrecision: 2 },
  { ticker: "USUNEMP", name: "U.S. Unemployment Rate", exchange: "ECONOMY", type: "economy", pricePrecision: 2 },
  { ticker: "AAPL250117C250", name: "Apple 250 Call 2025-01-17", exchange: "OPRA", type: "option", pricePrecision: 2 },
  { ticker: "TSLA250117P200", name: "Tesla 200 Put 2025-01-17", exchange: "OPRA", type: "option", pricePrecision: 2 },
  { ticker: "SPY250117C550", name: "SPY 550 Call 2025-01-17", exchange: "OPRA", type: "option", pricePrecision: 2 },
];

const BASE: Record<string, number> = {
  AAPL: 227.4,
  MSFT: 428.6,
  NVDA: 131.8,
  TSLA: 248.6,
  AMZN: 197.2,
  GOOGL: 176.4,
  META: 582.1,
  SPY: 562.4,
  QQQ: 482.6,
  GLD: 225.3,
  IWM: 218.7,
  "ES1!": 5652,
  "NQ1!": 19885,
  "GC1!": 2648,
  "CL1!": 78.5,
  EURUSD: 1.0864,
  GBPUSD: 1.2731,
  USDJPY: 148.22,
  AUDUSD: 0.6621,
  USDCHF: 0.8842,
  BTCUSD: 97250,
  ETHUSD: 3420,
  SOLUSD: 178.4,
  BNBUSDT: 612,
  XRPUSD: 2.42,
  SPX: 5620,
  NDX: 20140,
  DJI: 41280,
  DAX: 19840,
  XAUUSD: 2645,
  USOIL: 78.4,
  US10Y: 4.162,
  US02Y: 4.281,
  DE10Y: 2.414,
  USINTR: 5.5,
  USCPI: 314.2,
  USUNEMP: 4.1,
  AAPL250117C250: 14.2,
  TSLA250117P200: 18.7,
  SPY250117C550: 9.4,
};

export function findSymbol(ticker: string): SymbolInfo {
  const upper = ticker.toUpperCase();
  return UNIVERSE.find((s) => s.ticker.toUpperCase() === upper) ?? UNIVERSE[0];
}

function generateTimeBars(symbol: SymbolInfo, interval: Interval, count: number): Bar[] {
  const step = intervalSeconds(interval);
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

function generateRangeBars(symbol: SymbolInfo, range: number, count: number): Bar[] {
  const rand = mulberry32(hashString(`${symbol.ticker}:R${range}`));
  let price = BASE[symbol.ticker] ?? 100;
  const unit = symbol.type === "fx" ? 0.0001 : Math.pow(10, -Math.min(4, symbol.pricePrecision));
  const threshold = Math.max(unit, range * unit);
  const now = Math.floor(Date.now() / 1000);
  const bars: Bar[] = [];
  let t = now - count * 45;
  let open = price;
  let high = price;
  let low = price;
  let guard = 0;
  while (bars.length < count && guard++ < count * 500) {
    const delta = (rand() - 0.48) * threshold * 0.4;
    price = Math.max(0.0001, price + delta);
    high = Math.max(high, price);
    low = Math.min(low, price);
    t += 1 + Math.floor(rand() * 6);
    if (Math.abs(price - open) >= threshold || guard % 80 === 0) {
      bars.push({
        time: t,
        open,
        high,
        low,
        close: price,
        volume: Math.round(400 + rand() * 4200),
      });
      open = price;
      high = price;
      low = price;
    }
  }
  return bars;
}

export function generateBars(symbol: SymbolInfo, interval: Interval, count = 1600): Bar[] {
  const parsed = parseInterval(interval);
  if (parsed.kind === "range") return generateRangeBars(symbol, parsed.n, count);
  return generateTimeBars(symbol, interval, count);
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

export { intervalSeconds };
