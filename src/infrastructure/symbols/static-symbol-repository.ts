import { normalizeTicker, symbolMatches, SESSION_24X7, SESSION_FX, SESSION_US_EQUITY, type SymbolInfo, type SymbolType } from "@/domain";
import type { SymbolRepository } from "@/application";

const NY = "America/New_York";
const UTC = "Etc/UTC";

type Seed = [ticker: string, name: string, exchange: string, type: SymbolType, precision: number];

/** CFD / FX brokers with Yahoo-backed underlyings (OANDA + 3). */
const CFD_BROKERS = ["OANDA", "PEPPERSTONE", "IG", "CAPITALCOM"] as const;

/** Shared FX / metal / index CFD books listed under each CFD broker. */
const CFD_BOOK: readonly [ticker: string, name: string, type: SymbolType, precision: number][] = [
  // Indices (NAS100 / Dow / …)
  ["NAS100", "US 100 Cash (Nasdaq 100)", "index", 2],
  ["US30", "US 30 Cash (Dow Jones)", "index", 2],
  ["US500", "US 500 Cash (S&P 500)", "index", 2],
  ["GER40", "Germany 40 Cash (DAX)", "index", 2],
  ["UK100", "UK 100 Cash (FTSE 100)", "index", 2],
  ["JPN225", "Japan 225 Cash (Nikkei)", "index", 2],
  ["AUS200", "Australia 200 Cash", "index", 2],
  // FX majors / crosses
  ["EURUSD", "Euro / U.S. Dollar", "forex", 5],
  ["GBPUSD", "British Pound / U.S. Dollar", "forex", 5],
  ["USDJPY", "U.S. Dollar / Japanese Yen", "forex", 3],
  ["AUDUSD", "Australian Dollar / U.S. Dollar", "forex", 5],
  ["USDCHF", "U.S. Dollar / Swiss Franc", "forex", 5],
  ["USDCAD", "U.S. Dollar / Canadian Dollar", "forex", 5],
  ["NZDUSD", "New Zealand Dollar / U.S. Dollar", "forex", 5],
  ["EURGBP", "Euro / British Pound", "forex", 5],
  ["EURJPY", "Euro / Japanese Yen", "forex", 3],
  ["GBPJPY", "British Pound / Japanese Yen", "forex", 3],
  // Metals / energy
  ["XAUUSD", "Gold Spot / U.S. Dollar", "forex", 2],
  ["XAGUSD", "Silver Spot / U.S. Dollar", "commodity", 3],
  ["USOIL", "WTI Crude Oil", "commodity", 2],
];

function cfdSeeds(): Seed[] {
  const out: Seed[] = [];
  for (const broker of CFD_BROKERS) {
    for (const [ticker, name, type, precision] of CFD_BOOK) {
      out.push([ticker, name, broker, type, precision]);
    }
  }
  return out;
}

/**
 * Featured first — empty Symbol Search should surface live Forge markets
 * (Iran gold, XAU, majors, indices) before sparse Yahoo demo equities.
 */
const SEEDS: readonly Seed[] = [
  // Iran domestic gold — Faraz
  ["ABSHODE", "آبشده نقدی 1", "IRAN", "commodity", 0],
  ["G18", "گرم طلا ۱۸ عیار", "IRAN", "commodity", 0],
  ["G24", "طلای ۲۴ عیار", "IRAN", "commodity", 0],
  ["SEKKE", "سکه امامی", "IRAN", "commodity", 0],
  ["NIM", "نیم سکه", "IRAN", "commodity", 0],
  ["ROB", "ربع سکه", "IRAN", "commodity", 0],
  ["ONS", "انس جهانی (بازار ایران)", "IRAN", "commodity", 2],
  // Gold / FX / indices — FOREXCOM / FXPRO / FXCM (Germany live for XAU; Yahoo for indices)
  ["XAUUSD", "Gold Spot / U.S. Dollar", "FOREXCOM", "forex", 2],
  ["XAUUSD", "Gold Spot / U.S. Dollar", "FXPRO", "forex", 2],
  ["XAUUSD", "Gold Spot / U.S. Dollar", "FXCM", "forex", 2],
  ["XAUUSD", "Gold Spot / U.S. Dollar (PAXG)", "BINANCE", "forex", 2],
  ["GC1!", "Gold Futures", "FOREXCOM", "futures", 2],
  ["NAS100", "US 100 Cash (Nasdaq 100)", "FOREXCOM", "index", 2],
  ["US30", "US 30 Cash (Dow Jones)", "FOREXCOM", "index", 2],
  ["US500", "US 500 Cash (S&P 500)", "FOREXCOM", "index", 2],
  ["EURUSD", "Euro / U.S. Dollar", "FOREXCOM", "forex", 5],
  ["GBPUSD", "British Pound / U.S. Dollar", "FOREXCOM", "forex", 5],
  ["USDJPY", "U.S. Dollar / Japanese Yen", "FOREXCOM", "forex", 3],
  ["AUDUSD", "Australian Dollar / U.S. Dollar", "FOREXCOM", "forex", 5],
  ["USDCHF", "U.S. Dollar / Swiss Franc", "FOREXCOM", "forex", 5],
  ["USDCAD", "U.S. Dollar / Canadian Dollar", "FOREXCOM", "forex", 5],
  ["NZDUSD", "New Zealand Dollar / U.S. Dollar", "FOREXCOM", "forex", 5],
  ["XAGUSD", "Silver Spot / U.S. Dollar", "FOREXCOM", "commodity", 3],
  ["EURUSD", "Euro / U.S. Dollar", "FXPRO", "forex", 5],
  ["GBPUSD", "British Pound / U.S. Dollar", "FXPRO", "forex", 5],
  ["USDJPY", "U.S. Dollar / Japanese Yen", "FXPRO", "forex", 3],
  ["XAGUSD", "Silver Spot / U.S. Dollar", "FXPRO", "commodity", 3],
  ["EURUSD", "Euro / U.S. Dollar", "FXCM", "forex", 5],
  ["GBPUSD", "British Pound / U.S. Dollar", "FXCM", "forex", 5],
  ["USDJPY", "U.S. Dollar / Japanese Yen", "FXCM", "forex", 3],
  ["AUDUSD", "Australian Dollar / U.S. Dollar", "FXCM", "forex", 5],
  ["USDCHF", "U.S. Dollar / Swiss Franc", "FXCM", "forex", 5],
  ["USDCAD", "U.S. Dollar / Canadian Dollar", "FXCM", "forex", 5],
  ["NZDUSD", "New Zealand Dollar / U.S. Dollar", "FXCM", "forex", 5],
  ["EURGBP", "Euro / British Pound", "FXCM", "forex", 5],
  ["EURJPY", "Euro / Japanese Yen", "FXCM", "forex", 3],
  ["GBPJPY", "British Pound / Japanese Yen", "FXCM", "forex", 3],
  ["XAGUSD", "Silver Spot / U.S. Dollar", "FXCM", "commodity", 3],
  ["USOIL", "WTI Crude Oil", "FXCM", "commodity", 2],
  ["SPX500", "S&P 500", "FXCM", "index", 2],
  ["NAS100", "US 100", "FXCM", "index", 2],
  ["US30", "Dow Jones 30", "FXCM", "index", 2],
  ["GER40", "Germany 40", "FXCM", "index", 2],
  ["UK100", "UK 100", "FXCM", "index", 2],
  // Indices aliases (cash) under TVC / SP
  ["NAS100", "US 100 Cash (Nasdaq 100)", "TVC", "index", 2],
  ["US30", "US 30 Cash (Dow Jones)", "TVC", "index", 2],
  ["US500", "US 500 Cash (S&P 500)", "TVC", "index", 2],
  ["GER40", "Germany 40 Cash (DAX)", "TVC", "index", 2],
  ["UK100", "UK 100 Cash (FTSE 100)", "TVC", "index", 2],
  ["JPN225", "Japan 225 Cash (Nikkei)", "TVC", "index", 2],
  ["SPX", "S&P 500", "SP", "index", 2],
  ["NDX", "Nasdaq 100", "NASDAQ", "index", 2],
  ["DJI", "Dow Jones Industrial Average", "DJ", "index", 2],
  // OANDA + Pepperstone + IG + Capital.com books
  ...cfdSeeds(),
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
  ["USOIL", "WTI Crude Oil", "TVC", "commodity", 2],
  // Sparse Yahoo demo equities last (sticky NASDAQ chip used to hide everything else).
  ["AAPL", "Apple Inc.", "NASDAQ", "stock", 2],
  ["MSFT", "Microsoft Corporation", "NASDAQ", "stock", 2],
  ["NVDA", "NVIDIA Corporation", "NASDAQ", "stock", 2],
  ["TSLA", "Tesla, Inc.", "NASDAQ", "stock", 2],
];

/** Prefer these venues in the Symbol Search exchange dropdown. */
export const EXCHANGE_PRIORITY = [
  "IRAN",
  "OANDA",
  "PEPPERSTONE",
  "IG",
  "CAPITALCOM",
  "FOREXCOM",
  "FXCM",
  "BINANCE",
  "FXPRO",
  "TVC",
  "SP",
  "DJ",
  "NASDAQ",
] as const;

/** Empty-query ranking for Symbol Search (ticker upper-case). */
const FEATURED_TICKERS = [
  "ABSHODE",
  "G18",
  "SEKKE",
  "XAUUSD",
  "NAS100",
  "US30",
  "US500",
  "BTCUSDT",
  "ETHUSDT",
  "EURUSD",
  "ONS",
  "G24",
  "NIM",
  "ROB",
  "GER40",
  "UK100",
  "JPN225",
  "PAXGUSDT",
  "GBPUSD",
  "USDJPY",
  "XAGUSD",
] as const;

const TEHRAN = "Asia/Tehran";

/** Broker CFD books trade FX-style sessions (near 24h weekdays). */
const CFD_EXCHANGES = new Set<string>([
  "OANDA",
  "PEPPERSTONE",
  "IG",
  "CAPITALCOM",
  "FOREXCOM",
  "FXCM",
  "FXPRO",
  "TVC",
]);

function sessionFor(type: SymbolType, exchange: string): { session: string; timezone: string } {
  const ex = exchange.toUpperCase();
  if (CFD_EXCHANGES.has(ex) && (type === "index" || type === "forex" || type === "commodity" || type === "futures")) {
    return { session: SESSION_FX, timezone: UTC };
  }
  switch (type) {
    case "stock":
    case "fund":
    case "option":
    case "index":
      return { session: SESSION_US_EQUITY, timezone: NY };
    case "forex":
    case "commodity":
    case "futures":
      // Spot FX/metals close for the weekend — required for TV countdown/market status.
      return { session: SESSION_FX, timezone: UTC };
    case "crypto":
    default:
      return { session: SESSION_24X7, timezone: UTC };
  }
}

function toSymbol([ticker, name, exchange, type, pricePrecision]: Seed): SymbolInfo {
  const base = { ticker, name, exchange, type, pricePrecision, ...sessionFor(type, exchange) };
  // Iran gold quotes stream continuously from TGJU/Anil — keep session open for 1S ticks.
  if (exchange.toUpperCase() === "IRAN" || exchange.toUpperCase() === "TGJU") {
    return { ...base, session: SESSION_24X7, timezone: TEHRAN };
  }
  return base;
}

function featuredRank(ticker: string): number {
  const idx = (FEATURED_TICKERS as readonly string[]).indexOf(ticker.toUpperCase());
  return idx >= 0 ? idx : FEATURED_TICKERS.length + 1;
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
        // Empty query: featured markets first (Iran / gold / crypto / indices).
        if (!needle) {
          const fa = featuredRank(a.ticker);
          const fb = featuredRank(b.ticker);
          if (fa !== fb) return fa - fb;
          return a.ticker.localeCompare(b.ticker) || a.exchange.localeCompare(b.exchange);
        }
        const aStarts = a.ticker.toLowerCase().startsWith(needle) ? 0 : 1;
        const bStarts = b.ticker.toLowerCase().startsWith(needle) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
        const fa = featuredRank(a.ticker);
        const fb = featuredRank(b.ticker);
        if (fa !== fb) return fa - fb;
        return a.ticker.localeCompare(b.ticker) || a.exchange.localeCompare(b.exchange);
      });
  }
}
