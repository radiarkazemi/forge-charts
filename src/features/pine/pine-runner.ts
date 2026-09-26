/**
 * Pine Script bridge + starter templates.
 *
 * Charting Library cannot compile real Pine. Paths:
 * 1) Orca (structure / dealing-range) → client JS replay + chart drawings
 * 2) Simple SMA / EMA / RSI / MACD → built-in studies
 * 3) Everything else → clear compile error (never silent SMA fallback)
 */

import { isOrcaScript } from "./orca-runtime";

export type PineStudyInputs = Record<string, string | number | boolean>;

export interface PineStudyRequest {
  readonly studyName: string;
  readonly forceOverlay: boolean;
  readonly inputs: PineStudyInputs;
  readonly overrides?: Record<string, string | number | boolean>;
  readonly label: string;
}

export interface PineResolveOk {
  readonly ok: true;
  readonly kind: "study";
  readonly study: PineStudyRequest;
}

export interface PineResolveOrca {
  readonly ok: true;
  readonly kind: "orca";
  readonly label: string;
}

export interface PineResolveErr {
  readonly ok: false;
  readonly message: string;
  /** True when the script needs a real Pine runtime (TradingView.com). */
  readonly needsPineRuntime?: boolean;
}

export type PineResolveResult = PineResolveOk | PineResolveOrca | PineResolveErr;

/** Features that prove this is not a simple bridgeable SMA/EMA/RSI/MACD one-liner. */
const ADVANCED_PINE =
  /\b(request\.security|request\.security_lower_tf|line\.new|label\.new|box\.new|table\.new|polyline\.new|array\.|matrix\.|map\.|ta\.pivothigh|ta\.pivotlow|strategy\.|library\(|import\s+|alertcondition|plotshape|plotchar|fill\(|hline\(|bgcolor|barcolor)\b/i;

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

function stripComments(code: string): string {
  return code.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * Decide whether a Pine draft can be bridged to a Charting Library study,
 * run via the Orca JS engine, or rejected with a compile-style error.
 */
export function resolvePineStudy(code: string): PineResolveResult {
  const body = stripComments(code);
  const lower = body.toLowerCase();

  if (!/\/\/\s*@version\s*=\s*\d+|indicator\s*\(|strategy\s*\(|library\s*\(/i.test(code)) {
    return {
      ok: false,
      message: "Not a Pine Script — add //@version=6 and indicator(...) / strategy(...).",
    };
  }

  if (isOrcaScript(code)) {
    return { ok: true, kind: "orca", label: "Orca (BOS/MSS + dealing range)" };
  }

  if (ADVANCED_PINE.test(body)) {
    return {
      ok: false,
      needsPineRuntime: true,
      message:
        "Compile error: this script uses Pine features (request.security, drawings, pivots, arrays, …) that need TradingView’s Pine runtime. Charting Library cannot compile custom Pine — open it on tradingview.com, or use Create new → SMA / EMA / RSI / MACD here.",
    };
  }

  if (/\bta\.macd\s*\(/.test(lower) || /\bmacd\s*\(/.test(lower)) {
    return {
      ok: true,
      kind: "study",
      study: {
        studyName: "MACD",
        forceOverlay: false,
        inputs: { in_0: 12, in_1: 26, in_3: "close", in_2: 9 },
        label: "MACD",
      },
    };
  }

  if (/\bta\.rsi\s*\(/.test(lower)) {
    const length = parseLength(code, 14);
    return {
      ok: true,
      kind: "study",
      study: {
        studyName: "Relative Strength Index",
        forceOverlay: false,
        inputs: { length, source: "close" },
        label: `RSI (${length})`,
      },
    };
  }

  if (/\bta\.ema\s*\(/.test(lower)) {
    const length = parseLength(code, 14);
    return {
      ok: true,
      kind: "study",
      study: {
        studyName: "Moving Average Exponential",
        forceOverlay: false,
        inputs: { length, source: "close" },
        overrides: { "plot.color": "#FF6D00", "plot.linewidth": 2 },
        label: `EMA (${length})`,
      },
    };
  }

  if (/\bta\.sma\s*\(/.test(lower)) {
    const length = parseLength(code, 14);
    return {
      ok: true,
      kind: "study",
      study: {
        studyName: "Moving Average",
        forceOverlay: false,
        inputs: { length, source: "close" },
        overrides: { "plot.color": "#2962FF", "plot.linewidth": 2 },
        label: `SMA (${length})`,
      },
    };
  }

  const isBlankDefault =
    /\bindicator\s*\(\s*["']My script["']/i.test(body) &&
    (/\bplot\s*\(\s*close\s*\)/i.test(body) || /\bta\.sma\s*\(/i.test(body));
  if (isBlankDefault) {
    return {
      ok: true,
      kind: "study",
      study: {
        studyName: "Moving Average",
        forceOverlay: false,
        inputs: { length: 14, source: "close" },
        overrides: { "plot.color": "#2962FF", "plot.linewidth": 2 },
        label: "SMA (14)",
      },
    };
  }

  return {
    ok: false,
    needsPineRuntime: true,
    message:
      "Compile error: Forge can only run Orca (structure/DR) or bridge simple SMA / EMA / RSI / MACD. Full Pine requires tradingview.com.",
  };
}

/** Official-style blank indicator (TradingView "Create new → Indicator"). */
export const TV_DEFAULT_INDICATOR = `// This Pine Script® code is subject to the terms of the Mozilla Public License 2.0 at https://mozilla.org/MPL/2.0/
// © Forge

//@version=6
indicator("My script", overlay=true)
plot(ta.sma(close, 14), "SMA 14", color=color.new(#2962FF, 0), linewidth=2)
`;

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
