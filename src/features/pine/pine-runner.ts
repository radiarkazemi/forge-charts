/**
 * Pine Script bridge + starter templates (TradingView Pine Editor defaults).
 * Charting Library createStudy inputs MUST be a Record, not an array.
 */

export type PineStudyInputs = Record<string, string | number | boolean>;

export interface PineStudyRequest {
  readonly studyName: string;
  readonly forceOverlay: boolean;
  readonly inputs: PineStudyInputs;
  readonly overrides?: Record<string, string | number | boolean>;
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
      // CL example: in_0=fast, in_1=slow, in_3=source, in_2=signal
      inputs: { in_0: 12, in_1: 26, in_3: "close", in_2: 9 },
      label: "MACD",
    };
  }

  if (/\bta\.rsi\b/.test(lower) || /\brsi\b/.test(lower)) {
    return {
      studyName: "Relative Strength Index",
      forceOverlay: false,
      inputs: { length, source: "close" },
      label: `RSI (${length})`,
    };
  }

  if (/\bta\.ema\b/.test(lower) || /\bema\b/.test(lower)) {
    return {
      studyName: "Moving Average Exponential",
      forceOverlay: false,
      inputs: { length, source: "close" },
      overrides: { "plot.color": "#FF6D00", "plot.linewidth": 2 },
      label: `EMA (${length})`,
    };
  }

  if (/\bta\.sma\b/.test(lower) || /\bsma\b/.test(lower) || /\bmoving average\b/.test(lower)) {
    return {
      studyName: "Moving Average",
      forceOverlay: false,
      inputs: { length, source: "close" },
      overrides: { "plot.color": "#2962FF", "plot.linewidth": 2 },
      label: `SMA (${length})`,
    };
  }

  // TV blank `plot(close)` — add a visible SMA 14 so the chart clearly updates.
  return {
    studyName: "Moving Average",
    forceOverlay: false,
    inputs: { length: 14, source: "close" },
    overrides: { "plot.color": "#2962FF", "plot.linewidth": 2 },
    label: "SMA (14)",
  };
}

/** Official-style blank indicator (TradingView "Create new → Indicator"). */
export const TV_DEFAULT_INDICATOR = `// This Pine Script® code is subject to the terms of the Mozilla Public License 2.0 at https://mozilla.org/MPL/2.0/
// © Forge

//@version=6
indicator("My script", overlay=true)
plot(ta.sma(close, 14), "SMA 14", color=color.new(#2962FF, 0), linewidth=2)
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
