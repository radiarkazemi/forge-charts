import type { IndicatorKind, IndicatorPane } from "./types";

export function defaultPaneForKind(kind: IndicatorKind): IndicatorPane {
  switch (kind) {
    case "rsi":
    case "stochrsi":
    case "cci":
    case "willr":
      return "rsi";
    case "macd":
      return "macd";
    case "stoch":
      return "stoch";
    case "atr":
    case "adx":
      return "atr";
    case "vol":
    case "obv":
    case "cmf":
      return "volume";
    default:
      return "main";
  }
}

export function defaultParamsForKind(kind: IndicatorKind): number[] {
  switch (kind) {
    case "sma":
    case "ema":
    case "wma":
    case "smma":
    case "vwma":
    case "hma":
      return [20];
    case "bb":
      return [20, 2];
    case "rsi":
    case "atr":
    case "cci":
    case "willr":
    case "cmf":
    case "adx":
      return [14];
    case "stoch":
      return [14, 3];
    case "macd":
      return [12, 26, 9];
    case "ichimoku":
      return [9, 26, 52];
    case "psar":
      return [0.02, 0.2];
    case "supertrend":
      return [10, 3];
    case "stochrsi":
      return [14, 14, 3, 3];
    case "donchian":
      return [20];
    case "keltner":
      return [20, 1.5];
    case "pivot":
    case "vol":
    case "vwap":
    case "obv":
      return [];
    default:
      return [14];
  }
}

export function defaultLevelsForKind(kind: IndicatorKind): number[] | undefined {
  if (kind === "rsi" || kind === "stochrsi") return [30, 50, 70];
  if (kind === "stoch") return [20, 50, 80];
  if (kind === "willr") return [-80, -50, -20];
  if (kind === "cci") return [-100, 0, 100];
  if (kind === "adx") return [20, 40];
  return undefined;
}
