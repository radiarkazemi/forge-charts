import type { SymbolInfo } from "../engine/types";

type Spec = {
  ticker: string;
  name: string;
  type: SymbolInfo["type"];
  pricePrecision: number;
  yahoo: string;
};

const FX = (ticker: string, name: string, precision = 5): Spec => ({
  ticker,
  name,
  type: "fx",
  pricePrecision: ticker.includes("JPY") ? 3 : precision,
  yahoo: `${ticker}=X`,
});

/** FXCM broker majors + metals — Yahoo for history fallback; live prefers market-ticks FXCM:*. */
const SPECS: Spec[] = [
  FX("EURUSD", "Euro / U.S. Dollar"),
  FX("GBPUSD", "British Pound / U.S. Dollar"),
  FX("USDJPY", "U.S. Dollar / Japanese Yen"),
  FX("USDCHF", "U.S. Dollar / Swiss Franc"),
  FX("AUDUSD", "Australian Dollar / U.S. Dollar"),
  FX("USDCAD", "U.S. Dollar / Canadian Dollar"),
  FX("NZDUSD", "New Zealand Dollar / U.S. Dollar"),
  FX("EURGBP", "Euro / British Pound"),
  FX("EURJPY", "Euro / Japanese Yen"),
  FX("EURCHF", "Euro / Swiss Franc"),
  FX("EURAUD", "Euro / Australian Dollar"),
  FX("GBPJPY", "British Pound / Japanese Yen"),
  FX("GBPCHF", "British Pound / Swiss Franc"),
  FX("AUDJPY", "Australian Dollar / Japanese Yen"),
  FX("USDTRY", "U.S. Dollar / Turkish Lira", 4),
  FX("USDZAR", "U.S. Dollar / South African Rand", 4),
  FX("USDMXN", "U.S. Dollar / Mexican Peso", 4),
  FX("USDSGD", "U.S. Dollar / Singapore Dollar"),
  FX("USDHKD", "U.S. Dollar / Hong Kong Dollar"),
  FX("USDCNH", "U.S. Dollar / Chinese Yuan"),
  { ticker: "XAUUSD", name: "Gold Spot / U.S. Dollar", type: "metal", pricePrecision: 2, yahoo: "GC=F" },
  { ticker: "XAGUSD", name: "Silver Spot / U.S. Dollar", type: "metal", pricePrecision: 3, yahoo: "SI=F" },
  { ticker: "USOIL", name: "WTI Crude Oil", type: "metal", pricePrecision: 2, yahoo: "CL=F" },
  { ticker: "UKOIL", name: "Brent Crude Oil", type: "metal", pricePrecision: 2, yahoo: "BZ=F" },
  { ticker: "SPX500", name: "S&P 500", type: "index", pricePrecision: 2, yahoo: "^GSPC" },
  { ticker: "NAS100", name: "US 100", type: "index", pricePrecision: 2, yahoo: "^NDX" },
  { ticker: "US30", name: "Dow Jones 30", type: "index", pricePrecision: 2, yahoo: "^DJI" },
  { ticker: "GER40", name: "Germany 40", type: "index", pricePrecision: 2, yahoo: "^GDAXI" },
  { ticker: "UK100", name: "UK 100", type: "index", pricePrecision: 2, yahoo: "^FTSE" },
];

export const FXCM_YAHOO: Record<string, string> = Object.fromEntries(SPECS.map((s) => [s.ticker, s.yahoo]));

export const FXCM_UNIVERSE: SymbolInfo[] = SPECS.map((s) => ({
  ticker: s.ticker,
  name: s.name,
  exchange: "FXCM",
  type: s.type,
  pricePrecision: s.pricePrecision,
}));

export const FXCM_WATCH = [
  "EURUSD",
  "GBPUSD",
  "USDJPY",
  "XAUUSD",
  "XAGUSD",
  "AUDUSD",
  "USDCAD",
  "USDCHF",
  "EURJPY",
  "GBPJPY",
  "USOIL",
  "SPX500",
  "NAS100",
];

/** TradingView / market-ticks channel for an FXCM instrument. */
export function fxcmTvSymbol(ticker: string): string {
  return `FXCM:${ticker.toUpperCase()}`;
}

export function fxcmTickChannel(ticker: string): string {
  return `forex:${ticker.toLowerCase()}:fxcm`;
}
