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
  FX("EURCAD", "Euro / Canadian Dollar"),
  FX("EURNZD", "Euro / New Zealand Dollar"),
  FX("GBPJPY", "British Pound / Japanese Yen"),
  FX("GBPCHF", "British Pound / Swiss Franc"),
  FX("GBPAUD", "British Pound / Australian Dollar"),
  FX("GBPCAD", "British Pound / Canadian Dollar"),
  FX("GBPNZD", "British Pound / New Zealand Dollar"),
  FX("AUDJPY", "Australian Dollar / Japanese Yen"),
  FX("AUDCHF", "Australian Dollar / Swiss Franc"),
  FX("AUDCAD", "Australian Dollar / Canadian Dollar"),
  FX("AUDNZD", "Australian Dollar / New Zealand Dollar"),
  FX("NZDJPY", "New Zealand Dollar / Japanese Yen"),
  FX("NZDCHF", "New Zealand Dollar / Swiss Franc"),
  FX("NZDCAD", "New Zealand Dollar / Canadian Dollar"),
  FX("CADJPY", "Canadian Dollar / Japanese Yen"),
  FX("CADCHF", "Canadian Dollar / Swiss Franc"),
  FX("CHFJPY", "Swiss Franc / Japanese Yen"),
  FX("USDSEK", "U.S. Dollar / Swedish Krona"),
  FX("USDNOK", "U.S. Dollar / Norwegian Krone"),
  FX("USDDKK", "U.S. Dollar / Danish Krone"),
  FX("USDTRY", "U.S. Dollar / Turkish Lira", 4),
  FX("USDZAR", "U.S. Dollar / South African Rand", 4),
  FX("USDMXN", "U.S. Dollar / Mexican Peso", 4),
  FX("USDPLN", "U.S. Dollar / Polish Zloty", 4),
  FX("USDHUF", "U.S. Dollar / Hungarian Forint", 3),
  FX("USDCZK", "U.S. Dollar / Czech Koruna", 4),
  FX("USDSGD", "U.S. Dollar / Singapore Dollar"),
  FX("USDHKD", "U.S. Dollar / Hong Kong Dollar"),
  FX("USDCNH", "U.S. Dollar / Chinese Yuan"),
  FX("EURTRY", "Euro / Turkish Lira", 4),
  FX("EURSEK", "Euro / Swedish Krona"),
  FX("EURNOK", "Euro / Norwegian Krone"),
  FX("EURPLN", "Euro / Polish Zloty", 4),
  { ticker: "XAUUSD", name: "Gold Spot / U.S. Dollar", type: "metal", pricePrecision: 2, yahoo: "GC=F" },
  { ticker: "XAGUSD", name: "Silver Spot / U.S. Dollar", type: "metal", pricePrecision: 3, yahoo: "SI=F" },
  { ticker: "XPTUSD", name: "Platinum Spot / U.S. Dollar", type: "metal", pricePrecision: 2, yahoo: "PL=F" },
  { ticker: "XPDUSD", name: "Palladium Spot / U.S. Dollar", type: "metal", pricePrecision: 2, yahoo: "PA=F" },
  { ticker: "XAUEUR", name: "Gold Spot / Euro", type: "metal", pricePrecision: 2, yahoo: "GC=F" },
  { ticker: "USOIL", name: "WTI Crude Oil", type: "metal", pricePrecision: 2, yahoo: "CL=F" },
  { ticker: "UKOIL", name: "Brent Crude Oil", type: "metal", pricePrecision: 2, yahoo: "BZ=F" },
  { ticker: "NATGAS", name: "Natural Gas", type: "metal", pricePrecision: 3, yahoo: "NG=F" },
  { ticker: "SPX500", name: "S&P 500", type: "index", pricePrecision: 2, yahoo: "^GSPC" },
  { ticker: "NAS100", name: "US 100", type: "index", pricePrecision: 2, yahoo: "^NDX" },
  { ticker: "US30", name: "Dow Jones 30", type: "index", pricePrecision: 2, yahoo: "^DJI" },
  { ticker: "US2000", name: "Russell 2000", type: "index", pricePrecision: 2, yahoo: "^RUT" },
  { ticker: "GER40", name: "Germany 40", type: "index", pricePrecision: 2, yahoo: "^GDAXI" },
  { ticker: "UK100", name: "UK 100", type: "index", pricePrecision: 2, yahoo: "^FTSE" },
  { ticker: "FRA40", name: "France 40", type: "index", pricePrecision: 2, yahoo: "^FCHI" },
  { ticker: "JPN225", name: "Japan 225", type: "index", pricePrecision: 2, yahoo: "^N225" },
  { ticker: "AUS200", name: "Australia 200", type: "index", pricePrecision: 2, yahoo: "^AXJO" },
  { ticker: "EUSTX50", name: "Euro Stoxx 50", type: "index", pricePrecision: 2, yahoo: "^STOXX50E" },
  { ticker: "ESP35", name: "Spain 35", type: "index", pricePrecision: 2, yahoo: "^IBEX" },
  { ticker: "HK50", name: "Hong Kong 50", type: "index", pricePrecision: 2, yahoo: "^HSI" },
  { ticker: "NETH25", name: "Netherlands 25", type: "index", pricePrecision: 2, yahoo: "^AEX" },
  { ticker: "SWISS20", name: "Switzerland 20", type: "index", pricePrecision: 2, yahoo: "^SSMI" },
  { ticker: "IT40", name: "Italy 40", type: "index", pricePrecision: 2, yahoo: "FTSEMIB.MI" },
];

export const FOREXCOM_YAHOO: Record<string, string> = Object.fromEntries(SPECS.map((s) => [s.ticker, s.yahoo]));

export const FOREXCOM_UNIVERSE: SymbolInfo[] = SPECS.map((s) => ({
  ticker: s.ticker,
  name: s.name,
  exchange: "FOREXCOM",
  type: s.type,
  pricePrecision: s.pricePrecision,
}));

export const FOREXCOM_WATCH = [
  "XAUUSD",
  "EURUSD",
  "GBPUSD",
  "USDJPY",
  "XAGUSD",
  "USOIL",
  "SPX500",
  "NAS100",
  "US30",
  "AUDUSD",
  "USDCAD",
  "USDCHF",
  "GER40",
  "UK100",
];
