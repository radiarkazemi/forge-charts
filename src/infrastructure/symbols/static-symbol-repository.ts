import { normalizeTicker, symbolMatches, type SymbolInfo, type SymbolType } from "@/domain";
import type { SymbolRepository } from "@/application";

const NY = "America/New_York";
const UTC = "Etc/UTC";
const US_EQUITY_SESSION = "0930-1600";
const ALWAYS_OPEN = "24x7";

type Seed = [ticker: string, name: string, exchange: string, type: SymbolType, precision: number];

const SEEDS: readonly Seed[] = [
  ["AAPL", "Apple Inc.", "NASDAQ", "stock", 2],
  ["MSFT", "Microsoft Corporation", "NASDAQ", "stock", 2],
  ["NVDA", "NVIDIA Corporation", "NASDAQ", "stock", 2],
  ["TSLA", "Tesla, Inc.", "NASDAQ", "stock", 2],
  ["AMZN", "Amazon.com, Inc.", "NASDAQ", "stock", 2],
  ["GOOGL", "Alphabet Inc.", "NASDAQ", "stock", 2],
  ["META", "Meta Platforms, Inc.", "NASDAQ", "stock", 2],
  ["SPY", "SPDR S&P 500 ETF Trust", "NYSEARCA", "fund", 2],
  ["QQQ", "Invesco QQQ Trust", "NASDAQ", "fund", 2],
  ["GLD", "SPDR Gold Shares", "NYSEARCA", "fund", 2],
  ["IWM", "iShares Russell 2000 ETF", "NYSEARCA", "fund", 2],
  ["ES1!", "E-mini S&P 500 Futures", "CME", "futures", 2],
  ["NQ1!", "E-mini Nasdaq 100 Futures", "CME", "futures", 2],
  ["GC1!", "Gold Futures", "COMEX", "futures", 2],
  ["CL1!", "Crude Oil Futures", "NYMEX", "futures", 2],
  ["EURUSD", "Euro / U.S. Dollar", "FX", "forex", 5],
  ["GBPUSD", "British Pound / U.S. Dollar", "FX", "forex", 5],
  ["USDJPY", "U.S. Dollar / Japanese Yen", "FX", "forex", 3],
  ["AUDUSD", "Australian Dollar / U.S. Dollar", "FX", "forex", 5],
  ["USDCHF", "U.S. Dollar / Swiss Franc", "FX", "forex", 5],
  ["BTCUSD", "Bitcoin / U.S. Dollar", "BINANCE", "crypto", 2],
  ["ETHUSD", "Ethereum / U.S. Dollar", "BINANCE", "crypto", 2],
  ["SOLUSD", "Solana / U.S. Dollar", "BINANCE", "crypto", 3],
  ["BNBUSDT", "BNB / Tether", "BINANCE", "crypto", 2],
  ["XRPUSD", "XRP / U.S. Dollar", "BINANCE", "crypto", 4],
  ["SPX", "S&P 500", "SP", "index", 2],
  ["NDX", "Nasdaq 100", "NASDAQ", "index", 2],
  ["DJI", "Dow Jones Industrial Average", "DJ", "index", 2],
  ["DAX", "DAX Index", "XETR", "index", 2],
  ["XAUUSD", "Gold Spot / U.S. Dollar", "OANDA", "commodity", 2],
  ["XAGUSD", "Silver Spot / U.S. Dollar", "OANDA", "commodity", 3],
  ["USOIL", "WTI Crude Oil", "TVC", "commodity", 2],
  ["US10Y", "U.S. 10Y Treasury Yield", "TVC", "bond", 3],
  ["US02Y", "U.S. 2Y Treasury Yield", "TVC", "bond", 3],
  ["DE10Y", "Germany 10Y Bond Yield", "TVC", "bond", 3],
  ["USINTR", "U.S. Interest Rate", "ECONOMY", "economic", 2],
  ["USCPI", "U.S. Consumer Price Index", "ECONOMY", "economic", 2],
  ["USUNEMP", "U.S. Unemployment Rate", "ECONOMY", "economic", 2],
  ["AAPL250117C250", "Apple 250 Call 2025-01-17", "OPRA", "option", 2],
  ["TSLA250117P200", "Tesla 200 Put 2025-01-17", "OPRA", "option", 2],
  ["SPY250117C550", "SPY 550 Call 2025-01-17", "OPRA", "option", 2],
];

function sessionFor(type: SymbolType): { session: string; timezone: string } {
  switch (type) {
    case "stock":
    case "fund":
    case "option":
      return { session: US_EQUITY_SESSION, timezone: NY };
    case "index":
      return { session: US_EQUITY_SESSION, timezone: NY };
    default:
      return { session: ALWAYS_OPEN, timezone: UTC };
  }
}

function toSymbol([ticker, name, exchange, type, pricePrecision]: Seed): SymbolInfo {
  return { ticker, name, exchange, type, pricePrecision, ...sessionFor(type) };
}

/** In-memory reference data. Swap for an API-backed repository without touching callers. */
export class StaticSymbolRepository implements SymbolRepository {
  private readonly symbols: readonly SymbolInfo[];
  private readonly byTicker: ReadonlyMap<string, SymbolInfo>;

  constructor(seeds: readonly Seed[] = SEEDS) {
    this.symbols = seeds.map(toSymbol);
    this.byTicker = new Map(this.symbols.map((s) => [s.ticker, s]));
  }

  all(): readonly SymbolInfo[] {
    return this.symbols;
  }

  findByTicker(ticker: string): SymbolInfo | undefined {
    return this.byTicker.get(normalizeTicker(ticker));
  }

  search(query: string, type: SymbolType | "" = ""): SymbolInfo[] {
    const needle = query.trim().toLowerCase();
    return this.symbols
      .filter((s) => symbolMatches(s, needle, type))
      .sort((a, b) => {
        const aStarts = a.ticker.toLowerCase().startsWith(needle) ? 0 : 1;
        const bStarts = b.ticker.toLowerCase().startsWith(needle) ? 0 : 1;
        return aStarts - bStarts || a.ticker.localeCompare(b.ticker);
      });
  }
}
