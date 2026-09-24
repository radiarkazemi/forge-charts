import { normalizeTicker, symbolMatches, type SymbolInfo, type SymbolType } from "@/domain";
import type { SymbolRepository } from "@/application";

const NY = "America/New_York";
const UTC = "Etc/UTC";
const US_EQUITY_SESSION = "0930-1600";
const ALWAYS_OPEN = "24x7";

type Seed = [ticker: string, name: string, exchange: string, type: SymbolType, precision: number];

const SEEDS: readonly Seed[] = [
  // BINANCE — Germany market-api universe
  ["BTCUSDT", "Bitcoin / Tether", "BINANCE", "crypto", 2],
  ["ETHUSDT", "Ethereum / Tether", "BINANCE", "crypto", 2],
  ["BNBUSDT", "BNB / Tether", "BINANCE", "crypto", 2],
  ["SOLUSDT", "Solana / Tether", "BINANCE", "crypto", 3],
  ["XRPUSDT", "XRP / Tether", "BINANCE", "crypto", 4],
  ["ADAUSDT", "Cardano / Tether", "BINANCE", "crypto", 4],
  ["DOGEUSDT", "Dogecoin / Tether", "BINANCE", "crypto", 5],
  ["AVAXUSDT", "Avalanche / Tether", "BINANCE", "crypto", 3],
  ["DOTUSDT", "Polkadot / Tether", "BINANCE", "crypto", 4],
  ["LINKUSDT", "Chainlink / Tether", "BINANCE", "crypto", 3],
  ["LTCUSDT", "Litecoin / Tether", "BINANCE", "crypto", 2],
  ["ATOMUSDT", "Cosmos / Tether", "BINANCE", "crypto", 3],
  ["NEARUSDT", "NEAR / Tether", "BINANCE", "crypto", 3],
  ["UNIUSDT", "Uniswap / Tether", "BINANCE", "crypto", 3],
  ["AAVEUSDT", "Aave / Tether", "BINANCE", "crypto", 2],
  ["SUIUSDT", "Sui / Tether", "BINANCE", "crypto", 4],
  ["APTUSDT", "Aptos / Tether", "BINANCE", "crypto", 3],
  ["ARBUSDT", "Arbitrum / Tether", "BINANCE", "crypto", 4],
  ["OPUSDT", "Optimism / Tether", "BINANCE", "crypto", 4],
  ["MATICUSDT", "Polygon / Tether", "BINANCE", "crypto", 4],
  ["PAXGUSDT", "PAX Gold / Tether", "BINANCE", "crypto", 2],
  ["BTCUSD", "Bitcoin / U.S. Dollar", "BINANCE", "crypto", 2],
  ["ETHUSD", "Ethereum / U.S. Dollar", "BINANCE", "crypto", 2],
  // Gold — FOREXCOM first so bare "XAUUSD" still resolves to spot CFD (not PAXG).
  // Typed as forex so they show under the Forex filter in symbol search.
  ["XAUUSD", "Gold Spot / U.S. Dollar", "FOREXCOM", "forex", 2],
  ["XAUUSD", "Gold Spot / U.S. Dollar", "FXPRO", "forex", 2],
  ["XAUUSD", "Gold Spot / U.S. Dollar (PAXG)", "BINANCE", "forex", 2],
  ["GC1!", "Gold Futures", "FOREXCOM", "futures", 2],
  // Broader (Yahoo fallback)
  ["AAPL", "Apple Inc.", "NASDAQ", "stock", 2],
  ["MSFT", "Microsoft Corporation", "NASDAQ", "stock", 2],
  ["NVDA", "NVIDIA Corporation", "NASDAQ", "stock", 2],
  ["TSLA", "Tesla, Inc.", "NASDAQ", "stock", 2],
  ["EURUSD", "Euro / U.S. Dollar", "FOREXCOM", "forex", 5],
  ["GBPUSD", "British Pound / U.S. Dollar", "FOREXCOM", "forex", 5],
  ["USDJPY", "U.S. Dollar / Japanese Yen", "FOREXCOM", "forex", 3],
  ["XAGUSD", "Silver Spot / U.S. Dollar", "FOREXCOM", "commodity", 3],
  ["EURUSD", "Euro / U.S. Dollar", "FXPRO", "forex", 5],
  ["GBPUSD", "British Pound / U.S. Dollar", "FXPRO", "forex", 5],
  ["USDJPY", "U.S. Dollar / Japanese Yen", "FXPRO", "forex", 3],
  ["XAGUSD", "Silver Spot / U.S. Dollar", "FXPRO", "commodity", 3],
  ["USOIL", "WTI Crude Oil", "TVC", "commodity", 2],
  ["SPX", "S&P 500", "SP", "index", 2],
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

  constructor(seeds: readonly Seed[] = SEEDS) {
    this.symbols = seeds.map(toSymbol);
  }

  all(): readonly SymbolInfo[] {
    return this.symbols;
  }

  findByTicker(ticker: string, exchange?: string): SymbolInfo | undefined {
    const raw = ticker.trim();
    const fromPrefix = raw.includes(":") ? raw.slice(0, raw.lastIndexOf(":")).trim().toUpperCase() : undefined;
    const ex = (exchange?.trim() || fromPrefix || "").toUpperCase() || undefined;
    const needle = normalizeTicker(raw);
    if (ex) {
      return this.symbols.find((s) => s.ticker === needle && s.exchange.toUpperCase() === ex);
    }
    return this.symbols.find((s) => s.ticker === needle);
  }

  search(query: string, type: SymbolType | "" = ""): SymbolInfo[] {
    const needle = query.trim().toLowerCase();
    return this.symbols
      .filter((s) => symbolMatches(s, needle, type))
      .sort((a, b) => {
        const aStarts = a.ticker.toLowerCase().startsWith(needle) ? 0 : 1;
        const bStarts = b.ticker.toLowerCase().startsWith(needle) ? 0 : 1;
        return aStarts - bStarts || a.ticker.localeCompare(b.ticker) || a.exchange.localeCompare(b.exchange);
      });
  }
}
