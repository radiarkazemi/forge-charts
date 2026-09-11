/** Forge ticker -> FXPro / TradingView symbol (FXPRO:…). */
export const FXPRO_TV = {
  XAUUSD: "FXPRO:XAUUSD",
  XAGUSD: "FXPRO:XAGUSD",
  EURUSD: "FXPRO:EURUSD",
  GBPUSD: "FXPRO:GBPUSD",
  USDJPY: "FXPRO:USDJPY",
  AUDUSD: "FXPRO:AUDUSD",
  USDCHF: "FXPRO:USDCHF",
  "GC1!": "FXPRO:XAUUSD",
  USOIL: "FXPRO:XTIUSD",
  "CL1!": "FXPRO:XTIUSD",
  DJI: "FXPRO:US30",
};

export function fxproTvSymbol(ticker) {
  const upper = String(ticker || "").toUpperCase();
  return FXPRO_TV[upper] || null;
}

export function isFxproTicker(ticker) {
  return Boolean(fxproTvSymbol(ticker));
}
