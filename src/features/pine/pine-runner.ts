/**
 * Pine Script bridge + starter templates (TradingView Pine Editor defaults).
 * Charting Library cannot compile Pine; supported drafts map onto built-in studies.
 */

export interface PineStudyRequest {
  readonly studyName: string;
  readonly forceOverlay: boolean;
  readonly inputs: readonly (number | string)[];
  readonly label: string;
}

function parseLength(code: string, fallback = 14): number {
  const m =
    code.match(/input\.int\(\s*(\d+)/i) ??
    code.match(/input\(\s*(\d+)/i) ??
    code.match(/ta\.sma\s*\(\s*[^,]+,\s*(\d+)/i) ??
    code.match(/ta\.ema\s*\(\s*[^,]+,\s*(\d+)/i) ??
    code.match(/ta\.rsi\s*\(\s*[^,]+,\s*(\d+)/i);
  const n = m ? Number(m[1]) : fallback;
  return Number.isFinite(n) && n >= 1 && n <= 500 ? Math.floor(n) : fallback;
}

/** Map a Pine draft to a Charting Library createStudy request. */
export function resolvePineStudy(code: string): PineStudyRequest {
  const length = parseLength(code, 14);
  const lower = code.toLowerCase();

  if (/\bta\.macd\b/.test(lower) || /\bmacd\b/.test(lower)) {
    return {
      studyName: "MACD",
      forceOverlay: false,
      inputs: [12, 26, "close", 9],
      label: "MACD",
    };
  }

  if (/\bta\.rsi\b/.test(lower) || /\brsi\b/.test(lower)) {
    return {
      studyName: "Relative Strength Index",
      forceOverlay: false,
      inputs: [length, "close"],
      label: `RSI (${length})`,
    };
  }

  if (/\bta\.ema\b/.test(lower) || /\bema\b/.test(lower)) {
    return {
      studyName: "Moving Average Exponential",
      forceOverlay: true,
      inputs: [length, "close"],
      label: `EMA (${length})`,
    };
  }

  if (/\bta\.sma\b/.test(lower) || /\bsma\b/.test(lower)) {
    return {
      studyName: "Moving Average",
      forceOverlay: true,
      inputs: [length, "close"],
      label: `SMA (${length})`,
    };
  }

  // TradingView default `plot(close)` — show close as MA(1)-like overlay via MA
  return {
    studyName: "Moving Average",
    forceOverlay: true,
    inputs: [1, "close"],
    label: "Close plot (MA 1)",
  };
}

/** Official-style blank indicator (TradingView "Create new → Indicator"). */
export const TV_DEFAULT_INDICATOR = `// This Pine Script® code is subject to the terms of the Mozilla Public License 2.0 at https://mozilla.org/MPL/2.0/
// © Forge

//@version=6
indicator("My script")
plot(close)
`;

/** First-indicator tutorial MACD from Pine docs. */
export const TV_MACD_TEMPLATE = `//@version=6
indicator("MACD #1")
fast = 12
slow = 26
fastMA = ta.ema(close, fast)
slowMA = ta.ema(close, slow)
macd = fastMA - slowMA
signal = ta.ema(macd, 9)
plot(macd, color = color.blue)
plot(signal, color = color.orange)
`;

export const TV_SMA_TEMPLATE = `//@version=6
indicator("SMA 14", overlay=true)
length = input.int(14, "Length", minval=1)
plot(ta.sma(close, length), "SMA", color=color.new(#2962FF, 0), linewidth=2)
`;

export const TV_RSI_TEMPLATE = `//@version=6
indicator("RSI 14")
length = input.int(14, "Length", minval=1)
plot(ta.rsi(close, length), "RSI", color=color.new(#7E57C2, 0))
hline(70, "Overbought", color=color.red)
hline(30, "Oversold", color=color.green)
`;

export type PineTemplateId = "blank" | "sma" | "rsi" | "macd";

export function pineTemplate(id: PineTemplateId): { title: string; code: string } {
  switch (id) {
    case "sma":
      return { title: "SMA 14", code: TV_SMA_TEMPLATE };
    case "rsi":
      return { title: "RSI 14", code: TV_RSI_TEMPLATE };
    case "macd":
      return { title: "MACD #1", code: TV_MACD_TEMPLATE };
    default:
      return { title: "Untitled script", code: TV_DEFAULT_INDICATOR };
  }
}
