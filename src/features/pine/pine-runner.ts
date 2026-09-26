/**
 * Minimal Pine → Charting Library study bridge.
 * Full Pine compilation is not available; supported drafts map onto built-in studies
 * so "Add to chart" actually plots something (TradingView-like smoke test).
 */

export interface PineRunResult {
  readonly ok: boolean;
  readonly message: string;
  readonly studyName?: string;
  readonly length?: number;
}

export interface PineStudyRequest {
  readonly studyName: string;
  readonly forceOverlay: boolean;
  readonly inputs: readonly (number | string)[];
  readonly label: string;
}

function parseLength(code: string, fallback = 14): number {
  const m =
    code.match(/input\.int\(\s*(\d+)/i) ??
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

  // Default / SMA scripts
  return {
    studyName: "Moving Average",
    forceOverlay: true,
    inputs: [length, "close"],
    label: `SMA (${length})`,
  };
}

/** Default basic overlay SMA — used as the Pine Editor starter script. */
export const BASIC_SMA_SCRIPT = `//@version=6
indicator("Forge SMA 14", overlay=true)

length = input.int(14, "Length", minval=1)
src = close
smaLine = ta.sma(src, length)

plot(smaLine, "SMA", color=color.new(#2962FF, 0), linewidth=2)
`;
