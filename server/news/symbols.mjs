/** Forge ticker → TradingView News Flow / headlines symbol. */

export const TV_SYMBOLS = {
  AAPL: "NASDAQ:AAPL",
  MSFT: "NASDAQ:MSFT",
  NVDA: "NASDAQ:NVDA",
  TSLA: "NASDAQ:TSLA",
  AMZN: "NASDAQ:AMZN",
  GOOGL: "NASDAQ:GOOGL",
  META: "NASDAQ:META",
  SPY: "AMEX:SPY",
  QQQ: "NASDAQ:QQQ",
  GLD: "AMEX:GLD",
  IWM: "AMEX:IWM",
  "ES1!": "CME_MINI:ES1!",
  "NQ1!": "CME_MINI:NQ1!",
  "GC1!": "COMEX:GC1!",
  "CL1!": "NYMEX:CL1!",
  EURUSD: "FX_IDC:EURUSD",
  GBPUSD: "FX_IDC:GBPUSD",
  USDJPY: "FX_IDC:USDJPY",
  AUDUSD: "FX_IDC:AUDUSD",
  USDCHF: "FX_IDC:USDCHF",
  BTCUSD: "BINANCE:BTCUSDT",
  ETHUSD: "BINANCE:ETHUSDT",
  SOLUSD: "BINANCE:SOLUSDT",
  BNBUSDT: "BINANCE:BNBUSDT",
  XRPUSD: "BINANCE:XRPUSDT",
  SPX: "SP:SPX",
  NDX: "NASDAQ:NDX",
  DJI: "DJ:DJI",
  DAX: "XETR:DAX",
  XAUUSD: "OANDA:XAUUSD",
  USOIL: "TVC:USOIL",
  US10Y: "TVC:US10Y",
  US02Y: "TVC:US02Y",
  DE10Y: "TVC:DE10Y",
  USINTR: "ECONOMICS:USINTR",
  USCPI: "ECONOMICS:USCPI",
  USUNEMP: "ECONOMICS:USUR",
};

const EXTRA_TV = {
  XAUUSD: ["FXPRO:XAUUSD", "FX_IDC:XAUUSD", "TVC:GOLD"],
  BTCUSD: ["BITSTAMP:BTCUSD", "COINBASE:BTCUSD"],
  ETHUSD: ["BITSTAMP:ETHUSD"],
};

export function forgeTickerFromTv(tvSymbol) {
  if (!tvSymbol) return null;
  const bare = String(tvSymbol).split(":").pop()?.toUpperCase() ?? "";
  if (TV_SYMBOLS[bare]) return bare;
  if (bare.endsWith("USDT")) {
    const usd = `${bare.slice(0, -4)}USD`;
    if (TV_SYMBOLS[usd]) return usd;
  }
  for (const [ticker, mapped] of Object.entries(TV_SYMBOLS)) {
    if (mapped === tvSymbol) return ticker;
  }
  return TV_SYMBOLS[bare] ? bare : null;
}

export function tvSymbolFor(ticker) {
  const upper = String(ticker || "").toUpperCase();
  return TV_SYMBOLS[upper] || null;
}

export function tvAliasesFor(ticker) {
  const upper = String(ticker || "").toUpperCase();
  const primary = tvSymbolFor(upper);
  const extra = EXTRA_TV[upper] || [];
  return [...new Set([primary, ...extra].filter(Boolean))];
}

export function allForgeTickers() {
  return Object.keys(TV_SYMBOLS);
}
