import { distToLine, distToSegment, formatPrice } from "./math";
import { AXIS_FONT, CHART_FONT, CHART_FONT_BOLD } from "./theme";
import type { Bar, Drawing, DrawingKind, FibLevelStyle, FibRetraceStyle, LineStyle, Tool } from "./types";

export type Pt = { x: number; y: number };
export type ViewRect = { x: number; y: number; w: number; h: number };

const CURSORS = new Set<Tool>(["cursor", "crosshair", "dot", "eraser", "zoom"]);

export function isDrawingTool(tool: Tool): tool is DrawingKind {
  return !CURSORS.has(tool);
}

export function isOpenEnded(kind: DrawingKind): boolean {
  return kind === "path" || kind === "polyline" || kind === "brush" || kind === "highlighter";
}

export function neededPoints(kind: DrawingKind): number {
  switch (kind) {
    case "hline":
    case "vline":
    case "horzray":
    case "crossline":
    case "text":
    case "anchoredtext":
    case "note":
    case "anchorednote":
    case "signpost":
    case "pricelabel":
    case "pricenote":
    case "arrowmarker":
    case "arrowmarkleft":
    case "arrowmarkright":
    case "flagmark":
    case "sticker":
    case "table":
    case "arrowup":
    case "arrowdown":
    case "anchoredvwap":
    case "anchoredvolprofile":
      return 1;
    case "parallel":
    case "long":
    case "short":
    case "triangle":
    case "pitchfork":
    case "schiff":
    case "modschiff":
    case "insidepitchfork":
    case "pitchfan":
    case "fibext":
    case "fibchannel":
    case "fibwedge":
    case "fibtime":
    case "disjoint":
    case "flattop":
    case "rotatedrect":
    case "curve":
    case "forecast":
    case "projection":
    case "sector":
      return 3;
    case "doublecurve":
    case "abcd":
    case "trianglepattern":
    case "elliottcorrection":
      return 4;
    case "callout":
    case "comment":
    case "image":
      return 2;
    case "xabcd":
    case "cypher":
    case "elliottdouble":
      return 5;
    case "elliottimpulse":
    case "elliotttriangle":
      return 6;
    case "headshoulders":
    case "threedrives":
    case "elliotttriple":
      return 7;
    case "path":
    case "polyline":
    case "brush":
    case "highlighter":
      return 99;
    default:
      return 2;
  }
}

/** Supercharts default Fib Retracement levels (D-FI-01). */
const DEFAULT_FIB_LEVELS: FibLevelStyle[] = [
  { ratio: 0, visible: true, color: "#787b86", fill: "rgba(120,123,134,0.12)" },
  { ratio: 0.236, visible: true, color: "#f23645", fill: "rgba(242,54,69,0.10)" },
  { ratio: 0.382, visible: true, color: "#81c784", fill: "rgba(129,199,132,0.10)" },
  { ratio: 0.5, visible: true, color: "#4caf50", fill: "rgba(76,175,80,0.10)" },
  { ratio: 0.618, visible: true, color: "#089981", fill: "rgba(8,153,129,0.14)" },
  { ratio: 0.786, visible: true, color: "#26a69a", fill: "rgba(38,166,154,0.10)" },
  { ratio: 1, visible: true, color: "#2962ff", fill: "rgba(41,98,255,0.10)" },
  { ratio: 1.618, visible: true, color: "#2962ff", fill: "rgba(41,98,255,0.06)" },
  { ratio: 2.618, visible: true, color: "#f57c00", fill: "rgba(245,124,0,0.06)" },
  { ratio: 3.618, visible: true, color: "#ab47bc", fill: "rgba(171,71,188,0.06)" },
  { ratio: 4.236, visible: true, color: "#e91e63", fill: "rgba(233,30,99,0.06)" },
];

export function defaultFibRetraceStyle(): FibRetraceStyle {
  return {
    levels: DEFAULT_FIB_LEVELS.map((l) => ({ ...l })),
    showTrendLine: true,
    trendColor: "#5b9cf6",
    trendWidth: 1,
    trendStyle: "dashed",
    extendLeft: false,
    extendRight: true,
    reverse: false,
    showBackground: true,
    showPrices: true,
    showLevels: true,
    levelsWidth: 1,
    levelsStyle: "solid",
  };
}

export function resolveFibStyle(d: Drawing): FibRetraceStyle {
  const base = defaultFibRetraceStyle();
  if (!d.fib) return base;
  return {
    ...base,
    ...d.fib,
    levels: (d.fib.levels?.length ? d.fib.levels : base.levels).map((l) => ({ ...l })),
  };
}

/** Supercharts default Trend-Based Fib Extension levels (D-FI-02). */
const DEFAULT_FIB_EXT_LEVELS: FibLevelStyle[] = [
  { ratio: 0, visible: true, color: "#787b86", fill: "rgba(120,123,134,0.10)" },
  { ratio: 0.618, visible: true, color: "#089981", fill: "rgba(8,153,129,0.12)" },
  { ratio: 1, visible: true, color: "#2962ff", fill: "rgba(41,98,255,0.12)" },
  { ratio: 1.272, visible: true, color: "#26a69a", fill: "rgba(38,166,154,0.10)" },
  { ratio: 1.618, visible: true, color: "#ab47bc", fill: "rgba(171,71,188,0.12)" },
  { ratio: 2, visible: true, color: "#42a5f5", fill: "rgba(66,165,245,0.08)" },
  { ratio: 2.618, visible: true, color: "#f57c00", fill: "rgba(245,124,0,0.10)" },
  { ratio: 3.618, visible: true, color: "#ef5350", fill: "rgba(239,83,80,0.08)" },
  { ratio: 4.236, visible: true, color: "#e91e63", fill: "rgba(233,30,99,0.06)" },
];

export function defaultFibExtensionStyle(): FibRetraceStyle {
  return {
    levels: DEFAULT_FIB_EXT_LEVELS.map((l) => ({ ...l })),
    showTrendLine: true,
    trendColor: "#5b9cf6",
    trendWidth: 1,
    trendStyle: "dashed",
    extendLeft: false,
    extendRight: true,
    reverse: false,
    showBackground: true,
    showPrices: true,
    showLevels: true,
    levelsWidth: 1,
    levelsStyle: "solid",
  };
}

export function resolveFibExtStyle(d: Drawing): FibRetraceStyle {
  const base = defaultFibExtensionStyle();
  if (!d.fib) return base;
  return {
    ...base,
    ...d.fib,
    levels: (d.fib.levels?.length ? d.fib.levels : base.levels).map((l) => ({ ...l })),
  };
}

export function defaultFibStyleForKind(kind: DrawingKind): FibRetraceStyle | undefined {
  switch (kind) {
    case "fib":
      return defaultFibRetraceStyle();
    case "fibext":
      return defaultFibExtensionStyle();
    case "fibchannel":
      return defaultFibChannelStyle();
    case "fibtimezone":
      return defaultFibTimeZoneStyle();
    case "fibfan":
      return defaultFibFanStyle();
    case "fibtime":
      return defaultFibTimeStyle();
    case "fibcircles":
      return defaultFibCirclesStyle();
    case "fibspiral":
      return defaultFibSpiralStyle();
    case "fibarcs":
      return defaultFibArcsStyle();
    case "fibwedge":
      return defaultFibWedgeStyle();
    case "pitchfan":
    case "pitchfork":
    case "schiff":
    case "modschiff":
    case "insidepitchfork":
      return defaultPitchforkStyle();
    case "gannbox":
    case "gannsquare":
      return defaultGannBoxStyle();
    case "gannsquarefixed":
      return defaultGannSquareFixedStyle();
    case "gannfan":
      return defaultGannFanStyle();
    case "xabcd":
    case "cypher":
    case "abcd":
    case "headshoulders":
    case "trianglepattern":
    case "threedrives":
    case "elliottimpulse":
    case "elliottcorrection":
    case "elliotttriangle":
    case "elliottdouble":
    case "elliotttriple":
    case "cycliclines":
    case "timecycles":
    case "sineline":
    case "long":
    case "short":
    case "forecast":
    case "daterange":
    case "pricerange":
    case "datepricerange":
    case "barspattern":
    case "ghostfeed":
    case "projection":
    case "sector":
    case "volprofile":
    case "anchoredvolprofile":
    case "measure":
    case "brush":
    case "highlighter":
    case "rect":
    case "rotatedrect":
    case "path":
    case "circle":
    case "ellipse":
    case "polyline":
    case "triangle":
    case "arc":
    case "curve":
    case "doublecurve":
    case "text":
    case "anchoredtext":
    case "note":
    case "anchorednote":
    case "signpost":
    case "callout":
    case "comment":
    case "pricelabel":
    case "pricenote":
    case "arrowmarker":
    case "arrowmarkleft":
    case "arrowmarkright":
    case "arrowup":
    case "arrowdown":
    case "flagmark":
    case "sticker":
    case "table":
    case "image":
      return defaultPatternStyle(kind);
    default:
      return undefined;
  }
}

export function resolveFibStyleForKind(d: Drawing): FibRetraceStyle {
  const base = defaultFibStyleForKind(d.kind) ?? defaultFibRetraceStyle();
  if (!d.fib) return base;
  return {
    ...base,
    ...d.fib,
    levels: (d.fib.levels?.length ? d.fib.levels : base.levels).map((l) => ({ ...l })),
  };
}

/** Supercharts default Fib Channel levels (D-FI-03). */
const DEFAULT_FIB_CHANNEL_LEVELS: FibLevelStyle[] = [
  { ratio: 0, visible: true, color: "#787b86", fill: "rgba(120,123,134,0.10)" },
  { ratio: 0.236, visible: true, color: "#f23645", fill: "rgba(242,54,69,0.08)" },
  { ratio: 0.382, visible: true, color: "#81c784", fill: "rgba(129,199,132,0.10)" },
  { ratio: 0.5, visible: true, color: "#4caf50", fill: "rgba(76,175,80,0.10)" },
  { ratio: 0.618, visible: true, color: "#089981", fill: "rgba(8,153,129,0.12)" },
  { ratio: 0.786, visible: true, color: "#26a69a", fill: "rgba(38,166,154,0.08)" },
  { ratio: 1, visible: true, color: "#2962ff", fill: "rgba(41,98,255,0.10)" },
  { ratio: 1.618, visible: true, color: "#ab47bc", fill: "rgba(171,71,188,0.08)" },
  { ratio: 2.618, visible: true, color: "#f57c00", fill: "rgba(245,124,0,0.06)" },
];

export function defaultFibChannelStyle(): FibRetraceStyle {
  return fibStyleBase(DEFAULT_FIB_CHANNEL_LEVELS);
}

export function resolveFibChannelStyle(d: Drawing): FibRetraceStyle {
  return resolveFibStyleForKind({ ...d, kind: "fibchannel" });
}

function fibStyleBase(levels: FibLevelStyle[]): FibRetraceStyle {
  return {
    levels: levels.map((l) => ({ ...l })),
    showTrendLine: true,
    trendColor: "#5b9cf6",
    trendWidth: 1,
    trendStyle: "dashed",
    extendLeft: false,
    extendRight: true,
    reverse: false,
    showBackground: true,
    showPrices: true,
    showLevels: true,
    levelsWidth: 1,
    levelsStyle: "solid",
  };
}

/** D-FI-04 Fib Time Zone — Fibonacci sequence multipliers of the base interval. */
const DEFAULT_FIB_TIMEZONE_LEVELS: FibLevelStyle[] = [
  { ratio: 0, visible: true, color: "#787b86", fill: "rgba(120,123,134,0.08)" },
  { ratio: 1, visible: true, color: "#f23645", fill: "rgba(242,54,69,0.06)" },
  { ratio: 2, visible: true, color: "#81c784", fill: "rgba(129,199,132,0.06)" },
  { ratio: 3, visible: true, color: "#4caf50", fill: "rgba(76,175,80,0.06)" },
  { ratio: 5, visible: true, color: "#089981", fill: "rgba(8,153,129,0.08)" },
  { ratio: 8, visible: true, color: "#26a69a", fill: "rgba(38,166,154,0.06)" },
  { ratio: 13, visible: true, color: "#2962ff", fill: "rgba(41,98,255,0.06)" },
  { ratio: 21, visible: true, color: "#ab47bc", fill: "rgba(171,71,188,0.06)" },
  { ratio: 34, visible: true, color: "#f57c00", fill: "rgba(245,124,0,0.05)" },
  { ratio: 55, visible: true, color: "#e91e63", fill: "rgba(233,30,99,0.05)" },
];
export function defaultFibTimeZoneStyle(): FibRetraceStyle {
  return fibStyleBase(DEFAULT_FIB_TIMEZONE_LEVELS);
}

/** D-FI-05 Fib Speed Resistance Fan */
const DEFAULT_FIB_FAN_LEVELS: FibLevelStyle[] = [
  { ratio: 0, visible: true, color: "#787b86", fill: "rgba(120,123,134,0.06)" },
  { ratio: 0.236, visible: true, color: "#f23645", fill: "rgba(242,54,69,0.06)" },
  { ratio: 0.382, visible: true, color: "#81c784", fill: "rgba(129,199,132,0.08)" },
  { ratio: 0.5, visible: true, color: "#4caf50", fill: "rgba(76,175,80,0.08)" },
  { ratio: 0.618, visible: true, color: "#089981", fill: "rgba(8,153,129,0.10)" },
  { ratio: 0.786, visible: true, color: "#26a69a", fill: "rgba(38,166,154,0.06)" },
  { ratio: 1, visible: true, color: "#2962ff", fill: "rgba(41,98,255,0.08)" },
];
export function defaultFibFanStyle(): FibRetraceStyle {
  return fibStyleBase(DEFAULT_FIB_FAN_LEVELS);
}

/** D-FI-06 Trend-Based Fib Time */
const DEFAULT_FIB_TIME_LEVELS: FibLevelStyle[] = [
  { ratio: 0, visible: true, color: "#787b86", fill: "rgba(120,123,134,0.08)" },
  { ratio: 0.382, visible: true, color: "#81c784", fill: "rgba(129,199,132,0.08)" },
  { ratio: 0.5, visible: true, color: "#4caf50", fill: "rgba(76,175,80,0.08)" },
  { ratio: 0.618, visible: true, color: "#089981", fill: "rgba(8,153,129,0.10)" },
  { ratio: 1, visible: true, color: "#2962ff", fill: "rgba(41,98,255,0.10)" },
  { ratio: 1.272, visible: true, color: "#26a69a", fill: "rgba(38,166,154,0.08)" },
  { ratio: 1.618, visible: true, color: "#ab47bc", fill: "rgba(171,71,188,0.10)" },
  { ratio: 2.618, visible: true, color: "#f57c00", fill: "rgba(245,124,0,0.08)" },
];
export function defaultFibTimeStyle(): FibRetraceStyle {
  return fibStyleBase(DEFAULT_FIB_TIME_LEVELS);
}

/** D-FI-07 Fib Circles */
const DEFAULT_FIB_CIRCLE_LEVELS: FibLevelStyle[] = [
  { ratio: 0.236, visible: true, color: "#f23645", fill: "rgba(242,54,69,0.05)" },
  { ratio: 0.382, visible: true, color: "#81c784", fill: "rgba(129,199,132,0.06)" },
  { ratio: 0.5, visible: true, color: "#4caf50", fill: "rgba(76,175,80,0.06)" },
  { ratio: 0.618, visible: true, color: "#089981", fill: "rgba(8,153,129,0.08)" },
  { ratio: 0.786, visible: true, color: "#26a69a", fill: "rgba(38,166,154,0.06)" },
  { ratio: 1, visible: true, color: "#2962ff", fill: "rgba(41,98,255,0.08)" },
  { ratio: 1.618, visible: true, color: "#ab47bc", fill: "rgba(171,71,188,0.06)" },
  { ratio: 2.618, visible: true, color: "#f57c00", fill: "rgba(245,124,0,0.05)" },
];
export function defaultFibCirclesStyle(): FibRetraceStyle {
  return fibStyleBase(DEFAULT_FIB_CIRCLE_LEVELS);
}

/** D-FI-08 Fib Spiral — color/width via style; single path */
const DEFAULT_FIB_SPIRAL_LEVELS: FibLevelStyle[] = [
  { ratio: 1, visible: true, color: "#2962ff", fill: "rgba(41,98,255,0.06)" },
  { ratio: 1.618, visible: true, color: "#089981", fill: "rgba(8,153,129,0.06)" },
];
export function defaultFibSpiralStyle(): FibRetraceStyle {
  return fibStyleBase(DEFAULT_FIB_SPIRAL_LEVELS);
}

/** D-FI-09 Fib Speed Resistance Arcs */
export function defaultFibArcsStyle(): FibRetraceStyle {
  return fibStyleBase(DEFAULT_FIB_FAN_LEVELS.filter((l) => l.ratio > 0));
}

/** D-FI-10 Fib Wedge */
export function defaultFibWedgeStyle(): FibRetraceStyle {
  return fibStyleBase(DEFAULT_FIB_FAN_LEVELS);
}

/** D-FI-11…15 Pitchfork family median parallels */
const DEFAULT_PITCH_LEVELS: FibLevelStyle[] = [
  { ratio: 0, visible: true, color: "#26a69a", fill: "rgba(38,166,154,0.06)" },
  { ratio: 0.25, visible: true, color: "#787b86", fill: "rgba(120,123,134,0.05)" },
  { ratio: 0.5, visible: true, color: "#2962ff", fill: "rgba(41,98,255,0.08)" },
  { ratio: 0.75, visible: true, color: "#787b86", fill: "rgba(120,123,134,0.05)" },
  { ratio: 1, visible: true, color: "#ef5350", fill: "rgba(239,83,80,0.06)" },
];
export function defaultPitchforkStyle(): FibRetraceStyle {
  return fibStyleBase(DEFAULT_PITCH_LEVELS);
}

/** D-FI-16…17 Gann Box / Square grid */
const DEFAULT_GANN_BOX_LEVELS: FibLevelStyle[] = [
  { ratio: 0, visible: true, color: "#787b86", fill: "rgba(120,123,134,0.05)" },
  { ratio: 0.25, visible: true, color: "#81c784", fill: "rgba(129,199,132,0.05)" },
  { ratio: 0.333, visible: true, color: "#26a69a", fill: "rgba(38,166,154,0.05)" },
  { ratio: 0.5, visible: true, color: "#2962ff", fill: "rgba(41,98,255,0.08)" },
  { ratio: 0.667, visible: true, color: "#ab47bc", fill: "rgba(171,71,188,0.05)" },
  { ratio: 0.75, visible: true, color: "#f57c00", fill: "rgba(245,124,0,0.05)" },
  { ratio: 1, visible: true, color: "#787b86", fill: "rgba(120,123,134,0.05)" },
];
export function defaultGannBoxStyle(): FibRetraceStyle {
  return fibStyleBase(DEFAULT_GANN_BOX_LEVELS);
}

/** D-FI-19 Gann Square Fixed — 0…5 unit grid (Supercharts defaults). */
const DEFAULT_GANN_SQUARE_FIXED_LEVELS: FibLevelStyle[] = [
  { ratio: 0, visible: true, color: "#787b86", fill: "rgba(120,123,134,0.04)" },
  { ratio: 0.2, visible: true, color: "#81c784", fill: "rgba(129,199,132,0.05)" },
  { ratio: 0.4, visible: true, color: "#26a69a", fill: "rgba(38,166,154,0.05)" },
  { ratio: 0.6, visible: true, color: "#2962ff", fill: "rgba(41,98,255,0.07)" },
  { ratio: 0.8, visible: true, color: "#ab47bc", fill: "rgba(171,71,188,0.05)" },
  { ratio: 1, visible: true, color: "#f23645", fill: "rgba(242,54,69,0.06)" },
];
export function defaultGannSquareFixedStyle(): FibRetraceStyle {
  return fibStyleBase(DEFAULT_GANN_SQUARE_FIXED_LEVELS);
}

/** Classic Gann Square Fixed fan slopes (price:time) inside the locked square. */
const GANN_FIXED_FAN_RATIOS: { ratio: number; label: string; color: string }[] = [
  { ratio: 0.125, label: "1/8", color: "#787b86" },
  { ratio: 0.25, label: "1/4", color: "#81c784" },
  { ratio: 1 / 3, label: "1/3", color: "#26a69a" },
  { ratio: 0.5, label: "1/2", color: "#4caf50" },
  { ratio: 1, label: "1/1", color: "#f23645" },
  { ratio: 2, label: "2/1", color: "#4caf50" },
  { ratio: 3, label: "3/1", color: "#26a69a" },
  { ratio: 4, label: "4/1", color: "#81c784" },
  { ratio: 8, label: "8/1", color: "#787b86" },
];

/** D-FI-18 Gann Fan */
const DEFAULT_GANN_FAN_LEVELS: FibLevelStyle[] = [
  { ratio: 0.125, visible: true, color: "#787b86", fill: "rgba(120,123,134,0.04)" },
  { ratio: 0.25, visible: true, color: "#81c784", fill: "rgba(129,199,132,0.05)" },
  { ratio: 0.333, visible: true, color: "#26a69a", fill: "rgba(38,166,154,0.05)" },
  { ratio: 0.5, visible: true, color: "#4caf50", fill: "rgba(76,175,80,0.05)" },
  { ratio: 1, visible: true, color: "#f23645", fill: "rgba(242,54,69,0.08)" },
  { ratio: 2, visible: true, color: "#4caf50", fill: "rgba(76,175,80,0.05)" },
  { ratio: 3, visible: true, color: "#26a69a", fill: "rgba(38,166,154,0.05)" },
  { ratio: 4, visible: true, color: "#81c784", fill: "rgba(129,199,132,0.05)" },
  { ratio: 8, visible: true, color: "#787b86", fill: "rgba(120,123,134,0.04)" },
];
export function defaultGannFanStyle(): FibRetraceStyle {
  return fibStyleBase(DEFAULT_GANN_FAN_LEVELS);
}

/** D-PA / D-PR / D-SH / D-AN pattern & position defaults — reuse FibRetraceStyle toggles. */
export function defaultPatternStyle(kind: DrawingKind): FibRetraceStyle {
  const accent =
    kind === "long" || kind === "arrowup" || kind === "arrowmarkright"
      ? "#089981"
      : kind === "short" || kind === "arrowdown" || kind === "arrowmarkleft"
        ? "#f23645"
        : kind === "highlighter"
          ? "#f9a825"
          : kind === "note" || kind === "anchorednote"
            ? "#f9a825"
            : kind.startsWith("elliott")
              ? "#ab47bc"
              : kind === "volprofile" || kind === "anchoredvolprofile"
                ? "#2962ff"
                : "#2962ff";
  const thick = kind === "brush" ? 3 : kind === "highlighter" ? 14 : 1;
  return {
    ...fibStyleBase([{ ratio: 1, visible: true, color: accent, fill: `${accent}22` }]),
    showTrendLine: true,
    trendColor: accent,
    trendWidth: thick,
    trendStyle: kind === "ghostfeed" || kind === "projection" ? "dashed" : "solid",
    extendLeft: false,
    extendRight: kind === "cycliclines" || kind === "timecycles" || kind === "sineline" || kind === "projection",
    reverse: false,
    showBackground: true,
    showPrices: true,
    showLevels: true,
    levelsWidth: 1,
    levelsStyle: "solid",
  };
}

export function formatFibRatio(ratio: number): string {
  if (Number.isInteger(ratio)) return String(ratio);
  const fixed = ratio.toFixed(3).replace(/\.?0+$/, "");
  return fixed || "0";
}

const FIB_TIME = [0, 1, 2, 3, 5, 8, 13, 21, 34, 55];
const GANN_LABELS = ["1/8", "1/4", "1/3", "1/2", "1/1", "2/1", "3/1", "4/1", "8/1"];
const FAN_RATIOS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
const HIT = 9;

function applyLineStyle(ctx: CanvasRenderingContext2D, style: LineStyle | undefined): void {
  if (style === "dashed") ctx.setLineDash([6, 4]);
  else if (style === "dotted") ctx.setLineDash([2, 3]);
  else ctx.setLineDash([]);
}

export function paintDrawing(
  ctx: CanvasRenderingContext2D,
  d: Drawing,
  pts: Pt[],
  rect: ViewRect,
  precision: number,
  selected: boolean,
  bars: Bar[],
  yOfPrice: (price: number) => number,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();
  ctx.lineWidth = d.lineWidth ?? 1.2;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = d.color;
  ctx.fillStyle = d.color;
  if (d.lineStyle === "dashed") ctx.setLineDash([7, 5]);
  else if (d.lineStyle === "dotted") ctx.setLineDash([2, 4]);
  else ctx.setLineDash([]);
  const kind = d.kind;
  if (kind === "fib") paintFibRetrace(ctx, d, pts, rect, precision, selected);
  else if (kind === "fibext") paintFibExtension(ctx, d, pts, rect, precision, selected);
  else if (kind === "fibchannel") paintFibChannel(ctx, d, pts, rect, precision, selected);
  else if (kind === "fibtimezone") paintFibTimeZone(ctx, d, pts, rect, selected);
  else if (kind === "fibfan") paintFibFan(ctx, d, pts, rect, selected);
  else if (kind === "fibtime") paintFibTime(ctx, d, pts, rect, selected);
  else if (kind === "fibcircles") paintFibCircles(ctx, d, pts, selected);
  else if (kind === "fibspiral") paintFibSpiral(ctx, d, pts, selected);
  else if (kind === "fibarcs") paintFibArcs(ctx, d, pts, selected);
  else if (kind === "fibwedge") paintFibWedge(ctx, d, pts, rect, selected);
  else if (kind === "gannfan") paintGannFan(ctx, d, pts, rect, selected);
  else if (kind === "gannsquarefixed") paintGannSquareFixed(ctx, d, pts, selected);
  else if (kind === "gannbox" || kind === "gannsquare") paintGannBox(ctx, d, pts, kind, selected);
  else if (kind === "pitchfork" || kind === "schiff" || kind === "modschiff" || kind === "insidepitchfork" || kind === "pitchfan")
    paintPitchfork(ctx, d, pts, rect, kind, selected);
  else if (kind === "hline") stroke(ctx, { x: rect.x, y: pts[0].y }, { x: rect.x + rect.w, y: pts[0].y });
  else if (kind === "vline") stroke(ctx, { x: pts[0].x, y: rect.y }, { x: pts[0].x, y: rect.y + rect.h });
  else if (kind === "horzray") stroke(ctx, pts[0], { x: rect.x + rect.w, y: pts[0].y });
  else if (kind === "crossline") {
    stroke(ctx, { x: rect.x, y: pts[0].y }, { x: rect.x + rect.w, y: pts[0].y });
    stroke(ctx, { x: pts[0].x, y: rect.y }, { x: pts[0].x, y: rect.y + rect.h });
  } else if (kind === "trend" || kind === "arrow") {
    if (pts.length >= 2) {
      stroke(ctx, pts[0], pts[1]);
      if (kind === "arrow") arrowHead(ctx, pts[0], pts[1]);
    }
  } else if (kind === "ray" && pts.length >= 2) extend(ctx, pts[0], pts[1], rect, false, true);
  else if (kind === "extended" && pts.length >= 2) extend(ctx, pts[0], pts[1], rect, true, true);
  else if (kind === "info" && pts.length >= 2) paintInfo(ctx, d, pts, precision);
  else if (kind === "trendangle" && pts.length >= 2) paintTrendAngle(ctx, pts);
  else if (kind === "parallel" && pts.length >= 3) paintParallel(ctx, pts, rect);
  else if (kind === "regression" && pts.length >= 2) paintRegression(ctx, pts, rect, bars);
  else if (kind === "flattop" && pts.length >= 3) paintFlatTop(ctx, pts, rect);
  else if (kind === "disjoint" && pts.length >= 3) paintDisjoint(ctx, pts, rect);
  else if (kind === "rect") paintShapeBox(ctx, d, pts);
  else if (kind === "datepricerange" || kind === "measure") paintDatePriceRange(ctx, d, pts, precision, bars);
  else if (kind === "barspattern") paintBarsPattern(ctx, d, pts, bars, yOfPrice);
  else if (kind === "rotatedrect" && pts.length >= 3) paintRotatedRect(ctx, d, pts);
  else if (kind === "ellipse" && pts.length >= 2) paintEllipse(ctx, d, pts, false);
  else if (kind === "circle" && pts.length >= 2) paintEllipse(ctx, d, pts, true);
  else if (kind === "triangle" && pts.length >= 3) paintShapeTriangle(ctx, d, pts);
  else if (kind === "arc" && pts.length >= 2) paintArc(ctx, d, pts);
  else if (kind === "curve" && pts.length >= 3) paintCurve(ctx, d, pts, false);
  else if (kind === "doublecurve" && pts.length >= 4) paintCurve(ctx, d, pts, true);
  else if (kind === "path" || kind === "polyline" || kind === "brush" || kind === "highlighter") paintFree(ctx, d, pts, kind);
  else if (kind === "long" || kind === "short") paintPosition(ctx, d, pts, precision);
  else if (kind === "pricerange" && pts.length >= 2) paintPriceRange(ctx, d, pts, rect, precision);
  else if (kind === "daterange" && pts.length >= 2) paintDateRange(ctx, d, pts, rect, bars);
  else if (kind === "forecast") paintForecast(ctx, d, pts, precision);
  else if (kind === "projection") paintProjection(ctx, d, pts, rect, precision);
  else if (kind === "ghostfeed") paintGhostFeed(ctx, d, pts, bars, yOfPrice);
  else if (kind === "sector" && pts.length >= 3) paintSector(ctx, d, pts);
  else if (kind === "anchoredvwap") paintAnchoredVwap(ctx, pts[0], rect, bars, yOfPrice);
  else if (kind === "volprofile" || kind === "anchoredvolprofile") paintVolProfile(ctx, d, pts, rect, bars, kind === "anchoredvolprofile", yOfPrice);
  else if (
    kind === "text" ||
    kind === "anchoredtext" ||
    kind === "note" ||
    kind === "anchorednote" ||
    kind === "signpost" ||
    kind === "pricelabel" ||
    kind === "pricenote" ||
    kind === "table"
  )
    paintLabel(ctx, d, pts[0], precision);
  else if (kind === "image" && pts.length >= 2) paintImage(ctx, d, pts);
  else if (kind === "callout" || kind === "comment") paintCallout(ctx, d, pts);
  else if (kind === "arrowmarker" || kind === "arrowup" || kind === "arrowdown" || kind === "arrowmarkleft" || kind === "arrowmarkright")
    paintArrowMark(ctx, d, pts[0], kind);
  else if (kind === "flagmark" || kind === "sticker") {
    ctx.font = kind === "sticker" ? "22px sans-serif" : CHART_FONT_BOLD;
    ctx.fillText(d.text || (kind === "flagmark" ? "⚑" : "★"), pts[0].x - 8, pts[0].y + 8);
  } else if (
    kind === "xabcd" ||
    kind === "cypher" ||
    kind === "abcd" ||
    kind === "headshoulders" ||
    kind === "trianglepattern" ||
    kind === "threedrives" ||
    kind === "elliottimpulse" ||
    kind === "elliottcorrection" ||
    kind === "elliotttriangle" ||
    kind === "elliottdouble" ||
    kind === "elliotttriple"
  )
    paintPattern(ctx, d, pts, kind);
  else if (kind === "cycliclines" || kind === "timecycles") paintCycles(ctx, d, pts, rect, kind === "timecycles");
  else if (kind === "sineline" && pts.length >= 2) paintSine(ctx, d, pts, rect);
  if (selected) pts.forEach((p) => handle(ctx, p));
  ctx.restore();
}

export function hitHandle(pts: Pt[], x: number, y: number): number | null {
  for (let i = 0; i < pts.length; i++) {
    if (Math.hypot(x - pts[i].x, y - pts[i].y) <= 9) return i;
  }
  return null;
}

export function hitTestDrawing(d: Drawing, pts: Pt[], x: number, y: number, rect: ViewRect): boolean {
  if (!pts.length) return false;
  const kind = d.kind;
  if (kind === "hline" || kind === "horzray") return Math.abs(y - pts[0].y) < HIT && (kind === "hline" || x >= pts[0].x - HIT);
  if (kind === "vline") return Math.abs(x - pts[0].x) < HIT;
  if (kind === "crossline") return Math.abs(y - pts[0].y) < HIT || Math.abs(x - pts[0].x) < HIT;
  if (kind === "fibchannel" && pts.length >= 2) {
    const style = resolveFibChannelStyle(d);
    const a = pts[0];
    const b = pts[1];
    const c = pts[2];
    let ox = c ? c.x - a.x : 0;
    let oy = c ? c.y - a.y : (b.y - a.y) * 0.25;
    if (style.reverse) {
      ox = -ox;
      oy = -oy;
    }
    if (style.showTrendLine && distToSegment(x, y, a.x, a.y, b.x, b.y) < HIT) return true;
    return style.levels.some((lvl) => {
      if (!lvl.visible) return false;
      const p = { x: a.x + ox * lvl.ratio, y: a.y + oy * lvl.ratio };
      const q = { x: b.x + ox * lvl.ratio, y: b.y + oy * lvl.ratio };
      const { s, e } = extendedEnds(p, q, rect, style.extendLeft, style.extendRight);
      return distToSegment(x, y, s.x, s.y, e.x, e.y) < HIT;
    });
  }
  if (kind === "fib" && pts.length >= 2) {
    const style = resolveFibStyle(d);
    const a = style.reverse ? pts[1] : pts[0];
    const b = style.reverse ? pts[0] : pts[1];
    const xL = Math.min(pts[0].x, pts[1].x);
    const xBox = Math.max(pts[0].x, pts[1].x);
    const x0 = style.extendLeft ? rect.x : xL;
    const x1 = style.extendRight ? rect.x + rect.w : xBox;
    if (style.showTrendLine && distToSegment(x, y, pts[0].x, pts[0].y, pts[1].x, pts[1].y) < HIT) return true;
    return style.levels.some((lvl) => {
      if (!lvl.visible) return false;
      const ly = a.y + (b.y - a.y) * lvl.ratio;
      return distToSegment(x, y, x0, ly, x1, ly) < HIT;
    });
  }
  if (kind === "fibext" && pts.length >= 3) {
    const style = resolveFibExtStyle(d);
    const a = pts[0];
    const b = pts[1];
    const c = pts[2];
    const sign = style.reverse ? -1 : 1;
    const dy = (b.y - a.y) * sign;
    const xL = Math.min(a.x, b.x, c.x);
    const xBox = Math.max(a.x, b.x, c.x);
    const x0 = style.extendLeft ? rect.x : xL;
    const x1 = style.extendRight ? rect.x + rect.w : xBox;
    if (style.showTrendLine) {
      if (distToSegment(x, y, a.x, a.y, b.x, b.y) < HIT) return true;
      if (distToSegment(x, y, b.x, b.y, c.x, c.y) < HIT) return true;
    }
    return style.levels.some((lvl) => {
      if (!lvl.visible) return false;
      const ly = c.y + dy * lvl.ratio;
      return distToSegment(x, y, x0, ly, x1, ly) < HIT;
    });
  }
  if (kind === "fibtimezone" && pts.length >= 2) {
    const unit = pts[1].x - pts[0].x || 1;
    return FIB_TIME.some((n) => Math.abs(x - (pts[0].x + unit * n)) < HIT);
  }
  if (kind === "fibcircles" && pts.length >= 2) {
    const r = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
    return FAN_RATIOS.some((lvl) => Math.abs(Math.hypot(x - pts[0].x, y - pts[0].y) - r * (lvl || 0.01)) < HIT);
  }
  if ((kind === "cycliclines" || kind === "timecycles") && pts.length >= 2) {
    const unit = pts[1].x - pts[0].x || 40;
    for (let i = -8; i < 24; i++) {
      if (Math.abs(x - (pts[0].x + unit * i)) < HIT) return true;
    }
  }
  if (kind === "sineline" && pts.length >= 2) {
    const amp = pts[1].y - pts[0].y;
    const len = Math.abs(pts[1].x - pts[0].x) || 80;
    for (let sx = Math.min(pts[0].x, rect.x); sx < rect.x + rect.w; sx += 6) {
      const sy = pts[0].y + amp * Math.sin(((sx - pts[0].x) / len) * Math.PI * 2);
      if (Math.hypot(x - sx, y - sy) < HIT) return true;
    }
  }
  if (
    (kind === "gannbox" ||
      kind === "gannsquare" ||
      kind === "gannsquarefixed" ||
      kind === "rect" ||
      kind === "measure" ||
      kind === "datepricerange" ||
      kind === "barspattern" ||
      kind === "image") &&
    pts.length >= 2
  ) {
    const box = gannScreenBox(pts, kind);
    const x0 = box.x;
    const y0 = box.y;
    const x1 = box.x + box.w;
    const y1 = box.y + box.h;
    const near = x >= x0 - HIT && x <= x1 + HIT && y >= y0 - HIT && y <= y1 + HIT;
    const onEdge = Math.abs(x - x0) < HIT || Math.abs(x - x1) < HIT || Math.abs(y - y0) < HIT || Math.abs(y - y1) < HIT;
    return near && (onEdge || (x >= x0 && x <= x1 && y >= y0 && y <= y1));
  }
  if (pts.length >= 2 && distToSegment(x, y, pts[0].x, pts[0].y, pts[1].x, pts[1].y) < HIT) return true;
  for (let i = 1; i < pts.length; i++) {
    if (distToSegment(x, y, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y) < HIT) return true;
  }
  if (pts.length === 1) return Math.hypot(x - pts[0].x, y - pts[0].y) < 14;
  if (kind === "extended" && pts.length >= 2) return distToLine(x, y, pts[0].x, pts[0].y, pts[1].x, pts[1].y) < HIT;
  if (kind === "ray" && pts.length >= 2) {
    const t = ((x - pts[0].x) * (pts[1].x - pts[0].x) + (y - pts[0].y) * (pts[1].y - pts[0].y)) / (Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) ** 2 || 1);
    return t >= -0.02 && distToLine(x, y, pts[0].x, pts[0].y, pts[1].x, pts[1].y) < HIT;
  }
  return false;
}

function stroke(ctx: CanvasRenderingContext2D, a: Pt, b: Pt): void {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

function handle(ctx: CanvasRenderingContext2D, p: Pt): void {
  ctx.save();
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#2962ff";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function extendedEnds(a: Pt, b: Pt, rect: ViewRect, left: boolean, right: boolean): { s: Pt; e: Pt } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const reach = Math.hypot(rect.w, rect.h) * 2;
  return {
    s: left ? { x: a.x - ux * reach, y: a.y - uy * reach } : { ...a },
    e: right ? { x: b.x + ux * reach, y: b.y + uy * reach } : { ...b },
  };
}

function extend(ctx: CanvasRenderingContext2D, a: Pt, b: Pt, rect: ViewRect, left: boolean, right: boolean): void {
  const { s, e } = extendedEnds(a, b, rect, left, right);
  stroke(ctx, s, e);
}

function arrowHead(ctx: CanvasRenderingContext2D, a: Pt, b: Pt): void {
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  ctx.beginPath();
  ctx.moveTo(b.x, b.y);
  ctx.lineTo(b.x - 10 * Math.cos(ang - 0.4), b.y - 10 * Math.sin(ang - 0.4));
  ctx.lineTo(b.x - 10 * Math.cos(ang + 0.4), b.y - 10 * Math.sin(ang + 0.4));
  ctx.closePath();
  ctx.fill();
}

function paintFibRetrace(
  ctx: CanvasRenderingContext2D,
  d: Drawing,
  pts: Pt[],
  rect: ViewRect,
  precision: number,
  selected: boolean,
): void {
  if (pts.length < 2) return;
  const style = resolveFibStyle(d);
  const aPt = style.reverse ? pts[1] : pts[0];
  const bPt = style.reverse ? pts[0] : pts[1];
  const p0 = style.reverse ? d.points[1].price : d.points[0].price;
  const p1 = style.reverse ? d.points[0].price : d.points[1].price;
  const xL = Math.min(pts[0].x, pts[1].x);
  const xBox = Math.max(pts[0].x, pts[1].x);
  const x0 = style.extendLeft ? rect.x : xL;
  const x1 = style.extendRight ? rect.x + rect.w : xBox;
  const visible = style.levels.filter((l) => l.visible).sort((u, v) => u.ratio - v.ratio);

  if (style.showBackground && visible.length >= 2) {
    for (let i = 0; i < visible.length - 1; i++) {
      const y0 = aPt.y + (bPt.y - aPt.y) * visible[i].ratio;
      const y1 = aPt.y + (bPt.y - aPt.y) * visible[i + 1].ratio;
      ctx.fillStyle = visible[i].fill;
      ctx.fillRect(x0, Math.min(y0, y1), Math.max(1, x1 - x0), Math.abs(y1 - y0) || 1);
    }
  }

  if (style.showTrendLine) {
    ctx.save();
    applyLineStyle(ctx, style.trendStyle);
    ctx.strokeStyle = selected ? "#2962ff" : style.trendColor;
    ctx.lineWidth = style.trendWidth;
    stroke(ctx, pts[0], pts[1]);
    ctx.restore();
  }

  ctx.font = AXIS_FONT;
  ctx.textAlign = "left";
  for (const lvl of visible) {
    const y = aPt.y + (bPt.y - aPt.y) * lvl.ratio;
    const price = p0 + (p1 - p0) * lvl.ratio;
    ctx.save();
    applyLineStyle(ctx, style.levelsStyle);
    ctx.strokeStyle = lvl.color;
    ctx.lineWidth =
      style.levelsWidth * (lvl.ratio === 0 || lvl.ratio === 1 || Math.abs(lvl.ratio - 0.618) < 1e-6 ? 1.35 : 1);
    stroke(ctx, { x: x0, y }, { x: x1, y });
    ctx.restore();

    if (!style.showLevels && !style.showPrices) continue;
    const parts: string[] = [];
    if (style.showLevels) parts.push(formatFibRatio(lvl.ratio));
    if (style.showPrices) parts.push(`(${formatPrice(price, precision)})`);
    const tag = parts.length === 2 ? `${parts[0]} ${parts[1]}` : parts[0];
    ctx.fillStyle = lvl.color;
    const labelX = xBox + 6 > x1 - 80 ? x0 + 6 : xBox + 6;
    ctx.fillText(tag, labelX, y - 3);
  }
}

function paintFibExtension(ctx: CanvasRenderingContext2D, d: Drawing, pts: Pt[], rect: ViewRect, precision: number, selected: boolean): void {
  if (pts.length < 2) return;
  const style = resolveFibExtStyle(d);
  const a = pts[0];
  const b = pts[1];
  const c = pts[2] ?? b;

  if (style.showTrendLine) {
    ctx.save();
    applyLineStyle(ctx, style.trendStyle);
    ctx.strokeStyle = selected ? "#2962ff" : style.trendColor;
    ctx.lineWidth = style.trendWidth;
    stroke(ctx, a, b);
    if (pts.length >= 3) stroke(ctx, b, c);
    ctx.restore();
  }

  if (pts.length < 3 || d.points.length < 3) return;

  const sign = style.reverse ? -1 : 1;
  const range = (d.points[1].price - d.points[0].price) * sign;
  const base = d.points[2].price;
  const dy = (b.y - a.y) * sign;
  const xL = Math.min(a.x, b.x, c.x);
  const xBox = Math.max(a.x, b.x, c.x);
  const x0 = style.extendLeft ? rect.x : xL;
  const x1 = style.extendRight ? rect.x + rect.w : xBox;
  const visible = style.levels.filter((l) => l.visible).sort((u, v) => u.ratio - v.ratio);

  if (style.showBackground && visible.length >= 2) {
    for (let i = 0; i < visible.length - 1; i++) {
      const y0 = c.y + dy * visible[i].ratio;
      const y1 = c.y + dy * visible[i + 1].ratio;
      ctx.fillStyle = visible[i].fill;
      ctx.fillRect(x0, Math.min(y0, y1), Math.max(1, x1 - x0), Math.abs(y1 - y0) || 1);
    }
  }

  ctx.font = AXIS_FONT;
  ctx.textAlign = "left";
  for (const lvl of visible) {
    const y = c.y + dy * lvl.ratio;
    const price = base + range * lvl.ratio;
    ctx.save();
    applyLineStyle(ctx, style.levelsStyle);
    ctx.strokeStyle = lvl.color;
    ctx.lineWidth =
      style.levelsWidth *
      (lvl.ratio === 0 || lvl.ratio === 1 || Math.abs(lvl.ratio - 1.618) < 1e-6 ? 1.35 : 1);
    stroke(ctx, { x: x0, y }, { x: x1, y });
    ctx.restore();

    if (!style.showLevels && !style.showPrices) continue;
    const parts: string[] = [];
    if (style.showLevels) parts.push(formatFibRatio(lvl.ratio));
    if (style.showPrices) parts.push(`(${formatPrice(price, precision)})`);
    const tag = parts.length === 2 ? `${parts[0]} ${parts[1]}` : parts[0];
    ctx.fillStyle = lvl.color;
    const labelX = xBox + 6 > x1 - 80 ? x0 + 6 : xBox + 6;
    ctx.fillText(tag, labelX, y - 3);
  }
}

function paintFibChannel(
  ctx: CanvasRenderingContext2D,
  d: Drawing,
  pts: Pt[],
  rect: ViewRect,
  precision: number,
  selected: boolean,
): void {
  if (pts.length < 2) return;
  const style = resolveFibChannelStyle(d);
  const a = pts[0];
  const b = pts[1];
  const c = pts[2];
  let ox = c ? c.x - a.x : 0;
  let oy = c ? c.y - a.y : (b.y - a.y) * 0.25;
  if (style.reverse) {
    ox = -ox;
    oy = -oy;
  }

  if (style.showTrendLine) {
    ctx.save();
    applyLineStyle(ctx, style.trendStyle);
    ctx.strokeStyle = selected ? "#2962ff" : style.trendColor;
    ctx.lineWidth = style.trendWidth;
    stroke(ctx, a, b);
    ctx.restore();
  }

  const visible = style.levels.filter((l) => l.visible).sort((u, v) => u.ratio - v.ratio);
  const p0 = d.points[0]?.price ?? 0;
  const pC = d.points[2]?.price ?? p0;
  const priceDelta = style.reverse ? p0 - pC : pC - p0;

  if (style.showBackground && visible.length >= 2) {
    for (let i = 0; i < visible.length - 1; i++) {
      const r0 = visible[i].ratio;
      const r1 = visible[i + 1].ratio;
      const p0pt = { x: a.x + ox * r0, y: a.y + oy * r0 };
      const q0pt = { x: b.x + ox * r0, y: b.y + oy * r0 };
      const p1pt = { x: a.x + ox * r1, y: a.y + oy * r1 };
      const q1pt = { x: b.x + ox * r1, y: b.y + oy * r1 };
      const e0 = extendedEnds(p0pt, q0pt, rect, style.extendLeft, style.extendRight);
      const e1 = extendedEnds(p1pt, q1pt, rect, style.extendLeft, style.extendRight);
      ctx.fillStyle = visible[i].fill;
      ctx.beginPath();
      ctx.moveTo(e0.s.x, e0.s.y);
      ctx.lineTo(e0.e.x, e0.e.y);
      ctx.lineTo(e1.e.x, e1.e.y);
      ctx.lineTo(e1.s.x, e1.s.y);
      ctx.closePath();
      ctx.fill();
    }
  }

  ctx.font = AXIS_FONT;
  ctx.textAlign = "left";
  for (const lvl of visible) {
    const p = { x: a.x + ox * lvl.ratio, y: a.y + oy * lvl.ratio };
    const q = { x: b.x + ox * lvl.ratio, y: b.y + oy * lvl.ratio };
    const { s, e } = extendedEnds(p, q, rect, style.extendLeft, style.extendRight);
    ctx.save();
    applyLineStyle(ctx, style.levelsStyle);
    ctx.strokeStyle = lvl.color;
    ctx.lineWidth =
      style.levelsWidth * (lvl.ratio === 0 || lvl.ratio === 1 || Math.abs(lvl.ratio - 0.618) < 1e-6 ? 1.35 : 1);
    stroke(ctx, s, e);
    ctx.restore();

    if (!style.showLevels && !style.showPrices) continue;
    const price = p0 + priceDelta * lvl.ratio;
    const parts: string[] = [];
    if (style.showLevels) parts.push(formatFibRatio(lvl.ratio));
    if (style.showPrices) parts.push(`(${formatPrice(price, precision)})`);
    const tag = parts.length === 2 ? `${parts[0]} ${parts[1]}` : parts[0];
    ctx.fillStyle = lvl.color;
    ctx.fillText(tag, e.x + 6, e.y - 3);
  }
}

function paintFibTimeZone(ctx: CanvasRenderingContext2D, d: Drawing, pts: Pt[], rect: ViewRect, selected: boolean): void {
  if (pts.length < 2) return;
  const style = resolveFibStyleForKind(d);
  const unit = (pts[1].x - pts[0].x) * (style.reverse ? -1 : 1) || 1;
  if (style.showTrendLine) {
    ctx.save();
    applyLineStyle(ctx, style.trendStyle);
    ctx.strokeStyle = selected ? "#2962ff" : style.trendColor;
    ctx.lineWidth = style.trendWidth;
    stroke(ctx, pts[0], pts[1]);
    ctx.restore();
  }
  ctx.font = AXIS_FONT;
  for (const lvl of style.levels) {
    if (!lvl.visible) continue;
    const x = pts[0].x + unit * lvl.ratio;
    ctx.save();
    applyLineStyle(ctx, style.levelsStyle);
    ctx.strokeStyle = lvl.color;
    ctx.lineWidth = style.levelsWidth;
    stroke(ctx, { x, y: rect.y }, { x, y: rect.y + rect.h });
    ctx.restore();
    if (style.showLevels) {
      ctx.fillStyle = lvl.color;
      ctx.fillText(formatFibRatio(lvl.ratio), x + 4, rect.y + 14);
    }
  }
}

function paintFibFan(ctx: CanvasRenderingContext2D, d: Drawing, pts: Pt[], rect: ViewRect, selected: boolean): void {
  if (pts.length < 2) return;
  const style = resolveFibStyleForKind(d);
  const a = pts[0];
  const b = pts[1];
  const dx = (b.x - a.x) * (style.reverse ? -1 : 1);
  const dy = (b.y - a.y) * (style.reverse ? -1 : 1);
  if (style.showTrendLine) {
    ctx.save();
    applyLineStyle(ctx, style.trendStyle);
    ctx.strokeStyle = selected ? "#2962ff" : style.trendColor;
    ctx.lineWidth = style.trendWidth;
    stroke(ctx, a, b);
    ctx.restore();
  }
  ctx.font = AXIS_FONT;
  for (const lvl of style.levels) {
    if (!lvl.visible) continue;
    ctx.save();
    applyLineStyle(ctx, style.levelsStyle);
    ctx.strokeStyle = lvl.color;
    ctx.lineWidth = style.levelsWidth * (Math.abs(lvl.ratio - 0.618) < 1e-6 || lvl.ratio === 1 ? 1.35 : 1);
    extend(ctx, a, { x: a.x + dx, y: a.y + dy * lvl.ratio }, rect, style.extendLeft, style.extendRight);
    extend(ctx, a, { x: a.x + dx * lvl.ratio, y: a.y + dy }, rect, style.extendLeft, style.extendRight);
    ctx.restore();
    if (style.showLevels) {
      ctx.fillStyle = lvl.color;
      ctx.fillText(formatFibRatio(lvl.ratio), a.x + dx * 0.72, a.y + dy * lvl.ratio * 0.72);
    }
  }
}

function paintFibTime(ctx: CanvasRenderingContext2D, d: Drawing, pts: Pt[], rect: ViewRect, selected: boolean): void {
  if (pts.length < 2) return;
  const style = resolveFibStyleForKind(d);
  const a = pts[0];
  const b = pts[1];
  const c = pts[2] ?? b;
  const unit = (b.x - a.x) * (style.reverse ? -1 : 1) || 1;
  if (style.showTrendLine) {
    ctx.save();
    applyLineStyle(ctx, style.trendStyle);
    ctx.strokeStyle = selected ? "#2962ff" : style.trendColor;
    ctx.lineWidth = style.trendWidth;
    stroke(ctx, a, b);
    if (pts.length >= 3) stroke(ctx, b, c);
    ctx.restore();
  }
  ctx.font = AXIS_FONT;
  for (const lvl of style.levels) {
    if (!lvl.visible) continue;
    const x = c.x + unit * lvl.ratio;
    ctx.save();
    applyLineStyle(ctx, style.levelsStyle);
    ctx.strokeStyle = lvl.color;
    ctx.lineWidth = style.levelsWidth;
    stroke(ctx, { x, y: rect.y }, { x, y: rect.y + rect.h });
    ctx.restore();
    if (style.showLevels) {
      ctx.fillStyle = lvl.color;
      ctx.fillText(formatFibRatio(lvl.ratio), x + 4, rect.y + 14);
    }
  }
}

function paintFibCircles(ctx: CanvasRenderingContext2D, d: Drawing, pts: Pt[], selected: boolean): void {
  if (pts.length < 2) return;
  const style = resolveFibStyleForKind(d);
  const r = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) || 1;
  if (style.showTrendLine) {
    ctx.save();
    applyLineStyle(ctx, style.trendStyle);
    ctx.strokeStyle = selected ? "#2962ff" : style.trendColor;
    ctx.lineWidth = style.trendWidth;
    stroke(ctx, pts[0], pts[1]);
    ctx.restore();
  }
  const visible = style.levels.filter((l) => l.visible && l.ratio > 0).sort((u, v) => u.ratio - v.ratio);
  if (style.showBackground) {
    for (let i = 0; i < visible.length - 1; i++) {
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, r * visible[i + 1].ratio, 0, Math.PI * 2);
      ctx.arc(pts[0].x, pts[0].y, r * visible[i].ratio, 0, Math.PI * 2, true);
      ctx.fillStyle = visible[i].fill;
      ctx.fill();
    }
  }
  ctx.font = AXIS_FONT;
  for (const lvl of visible) {
    ctx.save();
    applyLineStyle(ctx, style.levelsStyle);
    ctx.strokeStyle = lvl.color;
    ctx.lineWidth = style.levelsWidth;
    ctx.beginPath();
    ctx.arc(pts[0].x, pts[0].y, r * lvl.ratio, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    if (style.showLevels) {
      ctx.fillStyle = lvl.color;
      ctx.fillText(formatFibRatio(lvl.ratio), pts[0].x + r * lvl.ratio + 4, pts[0].y);
    }
  }
}

function paintFibSpiral(ctx: CanvasRenderingContext2D, d: Drawing, pts: Pt[], selected: boolean): void {
  if (pts.length < 2) return;
  const style = resolveFibStyleForKind(d);
  const a = pts[0];
  const b = pts[1];
  const r0 = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const ang0 = Math.atan2(b.y - a.y, b.x - a.x) + (style.reverse ? Math.PI : 0);
  const phi = Math.log(1.618) / (Math.PI / 2);
  if (style.showTrendLine) {
    ctx.save();
    applyLineStyle(ctx, style.trendStyle);
    ctx.strokeStyle = selected ? "#2962ff" : style.trendColor;
    ctx.lineWidth = style.trendWidth;
    stroke(ctx, a, b);
    ctx.restore();
  }
  const color = style.levels.find((l) => l.visible)?.color ?? "#2962ff";
  ctx.save();
  applyLineStyle(ctx, style.levelsStyle);
  ctx.strokeStyle = color;
  ctx.lineWidth = style.levelsWidth * 1.2;
  ctx.beginPath();
  for (let i = 0; i <= 420; i++) {
    const t = (i / 360) * Math.PI * 3.5;
    const r = r0 * Math.exp(phi * t);
    const x = a.x + r * Math.cos(ang0 + t);
    const y = a.y + r * Math.sin(ang0 + t);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();
}

function paintFibArcs(ctx: CanvasRenderingContext2D, d: Drawing, pts: Pt[], selected: boolean): void {
  if (pts.length < 2) return;
  const style = resolveFibStyleForKind(d);
  const r = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) || 1;
  const ang = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
  const sweep = style.reverse ? -1 : 1;
  if (style.showTrendLine) {
    ctx.save();
    applyLineStyle(ctx, style.trendStyle);
    ctx.strokeStyle = selected ? "#2962ff" : style.trendColor;
    ctx.lineWidth = style.trendWidth;
    stroke(ctx, pts[0], pts[1]);
    ctx.restore();
  }
  ctx.font = AXIS_FONT;
  for (const lvl of style.levels) {
    if (!lvl.visible || lvl.ratio <= 0) continue;
    ctx.save();
    applyLineStyle(ctx, style.levelsStyle);
    ctx.strokeStyle = lvl.color;
    ctx.lineWidth = style.levelsWidth;
    ctx.beginPath();
    ctx.arc(pts[0].x, pts[0].y, r * lvl.ratio, ang - (Math.PI / 2) * sweep, ang + (Math.PI / 2) * sweep, sweep < 0);
    ctx.stroke();
    ctx.restore();
    if (style.showLevels) {
      const lx = pts[0].x + r * lvl.ratio * Math.cos(ang);
      const ly = pts[0].y + r * lvl.ratio * Math.sin(ang);
      ctx.fillStyle = lvl.color;
      ctx.fillText(formatFibRatio(lvl.ratio), lx + 4, ly);
    }
  }
}

function paintFibWedge(ctx: CanvasRenderingContext2D, d: Drawing, pts: Pt[], rect: ViewRect, selected: boolean): void {
  if (pts.length < 2) return;
  const style = resolveFibStyleForKind(d);
  const o = pts[0];
  const a = pts[1];
  const b = pts[2] ?? { x: a.x, y: o.y };
  if (style.showTrendLine) {
    ctx.save();
    applyLineStyle(ctx, style.trendStyle);
    ctx.strokeStyle = selected ? "#2962ff" : style.trendColor;
    ctx.lineWidth = style.trendWidth;
    extend(ctx, o, a, rect, false, style.extendRight);
    extend(ctx, o, b, rect, false, style.extendRight);
    ctx.restore();
  }
  ctx.font = AXIS_FONT;
  for (const lvl of style.levels) {
    if (!lvl.visible) continue;
    const t = style.reverse ? 1 - lvl.ratio : lvl.ratio;
    const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    ctx.save();
    applyLineStyle(ctx, style.levelsStyle);
    ctx.strokeStyle = lvl.color;
    ctx.lineWidth = style.levelsWidth;
    extend(ctx, o, p, rect, false, style.extendRight);
    ctx.restore();
    if (style.showLevels) {
      ctx.fillStyle = lvl.color;
      ctx.fillText(formatFibRatio(lvl.ratio), o.x + (p.x - o.x) * 0.75 + 4, o.y + (p.y - o.y) * 0.75);
    }
  }
}

function paintGannFan(ctx: CanvasRenderingContext2D, d: Drawing, pts: Pt[], rect: ViewRect, selected: boolean): void {
  if (pts.length < 2) return;
  const style = resolveFibStyleForKind(d);
  const dx = (pts[1].x - pts[0].x) * (style.reverse ? -1 : 1);
  const dy = (pts[1].y - pts[0].y) * (style.reverse ? -1 : 1);
  if (style.showTrendLine) {
    ctx.save();
    applyLineStyle(ctx, style.trendStyle);
    ctx.strokeStyle = selected ? "#2962ff" : style.trendColor;
    ctx.lineWidth = style.trendWidth;
    stroke(ctx, pts[0], pts[1]);
    ctx.restore();
  }
  ctx.font = AXIS_FONT;
  style.levels.forEach((lvl, i) => {
    if (!lvl.visible) return;
    const isOne = Math.abs(lvl.ratio - 1) < 1e-6;
    ctx.save();
    applyLineStyle(ctx, style.levelsStyle);
    ctx.strokeStyle = isOne ? "#f23645" : lvl.color;
    ctx.lineWidth = style.levelsWidth * (isOne ? 1.6 : 1);
    extend(ctx, pts[0], { x: pts[0].x + dx, y: pts[0].y + dy * lvl.ratio }, rect, style.extendLeft, style.extendRight);
    ctx.restore();
    if (style.showLevels) {
      const label = GANN_LABELS[i] ?? formatFibRatio(lvl.ratio);
      ctx.fillStyle = ctx.strokeStyle = isOne ? "#f23645" : lvl.color;
      ctx.fillText(label, pts[0].x + dx * 0.55, pts[0].y + dy * lvl.ratio * 0.55);
    }
  });
}

function gannScreenBox(pts: Pt[], kind: DrawingKind): { x: number; y: number; w: number; h: number } {
  let x0 = Math.min(pts[0].x, pts[1].x);
  let y0 = Math.min(pts[0].y, pts[1].y);
  let w = Math.abs(pts[1].x - pts[0].x);
  let h = Math.abs(pts[1].y - pts[0].y);
  if (kind === "gannsquare") {
    const s = Math.max(w, h) || 80;
    w = s;
    h = s;
    x0 = pts[1].x < pts[0].x ? pts[0].x - s : pts[0].x;
    y0 = pts[1].y < pts[0].y ? pts[0].y - s : pts[0].y;
  }
  // gannsquarefixed keeps data-space corners (price/bar locked); no pixel squaring.
  return { x: x0, y: y0, w, h };
}

function paintGannBox(ctx: CanvasRenderingContext2D, d: Drawing, pts: Pt[], kind: DrawingKind, selected: boolean): void {
  if (pts.length < 2) return;
  const style = resolveFibStyleForKind(d);
  const { x: x0, y: y0, w, h } = gannScreenBox(pts, kind);
  ctx.save();
  applyLineStyle(ctx, style.levelsStyle);
  ctx.strokeStyle = selected ? "#2962ff" : style.trendColor;
  ctx.lineWidth = style.trendWidth;
  ctx.strokeRect(x0, y0, w, h);
  ctx.restore();
  for (const lvl of style.levels) {
    if (!lvl.visible) continue;
    const r = style.reverse ? 1 - lvl.ratio : lvl.ratio;
    ctx.save();
    applyLineStyle(ctx, style.levelsStyle);
    ctx.strokeStyle = lvl.color;
    ctx.lineWidth = style.levelsWidth * (Math.abs(lvl.ratio - 0.5) < 1e-6 ? 1.35 : 1);
    stroke(ctx, { x: x0 + w * r, y: y0 }, { x: x0 + w * r, y: y0 + h });
    stroke(ctx, { x: x0, y: y0 + h * r }, { x: x0 + w, y: y0 + h * r });
    ctx.restore();
  }
  ctx.strokeStyle = "#f23645";
  ctx.lineWidth = 1.2;
  stroke(ctx, { x: x0, y: y0 + h }, { x: x0 + w, y: y0 });
  stroke(ctx, { x: x0, y: y0 }, { x: x0 + w, y: y0 + h });
}

/** D-FI-19 Gann Square Fixed — locked price/bar square with unit grid, fans, arcs, and range labels. */
function paintGannSquareFixed(ctx: CanvasRenderingContext2D, d: Drawing, pts: Pt[], selected: boolean): void {
  if (pts.length < 2) return;
  const style = resolveFibStyleForKind(d);
  const a = pts[0];
  const b = pts[1];
  const ox = style.reverse ? b.x : a.x;
  const oy = style.reverse ? b.y : a.y;
  const ex = style.reverse ? a.x : b.x;
  const ey = style.reverse ? a.y : b.y;
  const dx = ex - ox;
  const dy = ey - oy;
  const x0 = Math.min(ox, ex);
  const y0 = Math.min(oy, ey);
  const w = Math.abs(dx) || 1;
  const h = Math.abs(dy) || 1;

  if (style.showBackground) {
    ctx.fillStyle = "rgba(41,98,255,0.05)";
    ctx.fillRect(x0, y0, w, h);
  }

  ctx.save();
  applyLineStyle(ctx, style.trendStyle);
  ctx.strokeStyle = selected ? "#2962ff" : style.trendColor;
  ctx.lineWidth = style.trendWidth;
  ctx.strokeRect(x0, y0, w, h);
  ctx.restore();

  // Unit grid (0…5)
  for (const lvl of style.levels) {
    if (!lvl.visible) continue;
    const r = style.reverse ? 1 - lvl.ratio : lvl.ratio;
    ctx.save();
    applyLineStyle(ctx, style.levelsStyle);
    ctx.strokeStyle = lvl.color;
    ctx.lineWidth = style.levelsWidth * (Math.abs(lvl.ratio - 0.5) < 1e-6 || lvl.ratio === 0 || lvl.ratio === 1 ? 1.35 : 1);
    stroke(ctx, { x: ox + dx * r, y: oy }, { x: ox + dx * r, y: ey });
    stroke(ctx, { x: ox, y: oy + dy * r }, { x: ex, y: oy + dy * r });
    ctx.restore();
    if (style.showLevels) {
      ctx.fillStyle = lvl.color;
      ctx.font = AXIS_FONT;
      const unit = Math.round(lvl.ratio * 5);
      ctx.fillText(String(unit), ox + dx * r + 3, oy + 12);
    }
  }

  // Fan rays from origin through the square
  ctx.font = AXIS_FONT;
  for (const fan of GANN_FIXED_FAN_RATIOS) {
    let tx: number;
    let ty: number;
    if (fan.ratio <= 1) {
      tx = ex;
      ty = oy + dy * fan.ratio;
    } else {
      tx = ox + dx / fan.ratio;
      ty = ey;
    }
    // Stay inside the square bounds
    if (fan.ratio <= 1) {
      if ((dy >= 0 && (ty < Math.min(oy, ey) || ty > Math.max(oy, ey))) || (dy < 0 && (ty > Math.max(oy, ey) || ty < Math.min(oy, ey)))) {
        continue;
      }
    } else if ((dx >= 0 && (tx < Math.min(ox, ex) || tx > Math.max(ox, ex))) || (dx < 0 && (tx > Math.max(ox, ex) || tx < Math.min(ox, ex)))) {
      continue;
    }
    ctx.save();
    applyLineStyle(ctx, style.levelsStyle);
    ctx.strokeStyle = fan.ratio === 1 ? "#f23645" : fan.color;
    ctx.lineWidth = style.levelsWidth * (fan.ratio === 1 ? 1.6 : 1);
    stroke(ctx, { x: ox, y: oy }, { x: tx, y: ty });
    ctx.restore();
    if (style.showLevels) {
      ctx.fillStyle = fan.ratio === 1 ? "#f23645" : fan.color;
      ctx.fillText(fan.label, ox + (tx - ox) * 0.62, oy + (ty - oy) * 0.62);
    }
  }

  // Quarter arcs centered at origin (radii at each grid level)
  for (const lvl of style.levels) {
    if (!lvl.visible || lvl.ratio <= 0) continue;
    const rx = Math.abs(dx) * lvl.ratio;
    const ry = Math.abs(dy) * lvl.ratio;
    const xSign = Math.sign(dx) || 1;
    const ySign = Math.sign(dy) || 1;
    ctx.save();
    applyLineStyle(ctx, style.levelsStyle);
    ctx.strokeStyle = lvl.color;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = style.levelsWidth;
    ctx.beginPath();
    for (let i = 0; i <= 24; i++) {
      const t = (i / 24) * (Math.PI / 2);
      const px = ox + xSign * rx * Math.cos(t);
      const py = oy + ySign * ry * Math.sin(t);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.restore();
  }

  // 1×1 diagonals
  ctx.strokeStyle = "#f23645";
  ctx.lineWidth = 1.25;
  stroke(ctx, { x: ox, y: oy }, { x: ex, y: ey });
  stroke(ctx, { x: ox, y: ey }, { x: ex, y: oy });

  // Ranges & ratio labels (Supercharts “Ranges and ratio”)
  if (style.showPrices || style.showLevels) {
    const priceSpan = Math.abs(d.points[1].price - d.points[0].price);
    const ratio = d.scaleRatio && d.scaleRatio > 0 ? d.scaleRatio : NaN;
    const barsApprox = ratio > 0 ? priceSpan / ratio : NaN;
    ctx.fillStyle = selected ? "#2962ff" : "#d1d4dc";
    ctx.font = AXIS_FONT;
    ctx.fillText(`ΔP ${priceSpan.toPrecision(5)}`, x0 + 4, y0 + h - 34);
    if (Number.isFinite(barsApprox)) ctx.fillText(`ΔB ${barsApprox.toFixed(1)}`, x0 + 4, y0 + h - 20);
    if (Number.isFinite(ratio)) ctx.fillText(`ratio ${ratio.toPrecision(4)}`, x0 + 4, y0 + h - 6);
  }
}

function pitchOrigin(kind: DrawingKind, p1: Pt, p2: Pt, p3: Pt): Pt {
  const mid = { x: (p2.x + p3.x) / 2, y: (p2.y + p3.y) / 2 };
  if (kind === "schiff") return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  if (kind === "modschiff") return { x: p1.x, y: (p1.y + p2.y) / 2 };
  if (kind === "insidepitchfork") return { x: (p1.x + mid.x) / 2, y: (p1.y + mid.y) / 2 };
  return p1;
}

function paintPitchfork(
  ctx: CanvasRenderingContext2D,
  d: Drawing,
  pts: Pt[],
  rect: ViewRect,
  kind: DrawingKind,
  selected: boolean,
): void {
  if (pts.length < 3) {
    if (pts.length >= 2) stroke(ctx, pts[0], pts[1]);
    return;
  }
  const style = resolveFibStyleForKind(d);
  const [p1, p2, p3] = pts;
  const mid = { x: (p2.x + p3.x) / 2, y: (p2.y + p3.y) / 2 };
  const o = pitchOrigin(kind, p1, p2, p3);
  const dx = (mid.x - o.x) * (style.reverse ? -1 : 1);
  const dy = (mid.y - o.y) * (style.reverse ? -1 : 1);

  if (style.showTrendLine) {
    ctx.save();
    applyLineStyle(ctx, style.trendStyle);
    ctx.strokeStyle = selected ? "#2962ff" : style.trendColor;
    ctx.lineWidth = style.trendWidth;
    stroke(ctx, p2, p3);
    ctx.restore();
  }

  const median = style.levels.find((l) => Math.abs(l.ratio - 0.5) < 1e-6) ?? style.levels[2];
  ctx.save();
  applyLineStyle(ctx, style.levelsStyle);
  ctx.strokeStyle = median?.color ?? "#2962ff";
  ctx.lineWidth = style.levelsWidth * 1.4;
  extend(ctx, o, { x: o.x + dx, y: o.y + dy }, rect, style.extendLeft, style.extendRight);
  ctx.restore();

  if (kind === "pitchfan") {
    for (const lvl of style.levels) {
      if (!lvl.visible) continue;
      const s = { x: p2.x + (p3.x - p2.x) * lvl.ratio, y: p2.y + (p3.y - p2.y) * lvl.ratio };
      ctx.save();
      applyLineStyle(ctx, style.levelsStyle);
      ctx.strokeStyle = lvl.color;
      ctx.lineWidth = style.levelsWidth;
      extend(ctx, o, s, rect, false, style.extendRight);
      ctx.restore();
      if (style.showLevels) {
        ctx.fillStyle = lvl.color;
        ctx.font = AXIS_FONT;
        ctx.fillText(formatFibRatio(lvl.ratio), o.x + (s.x - o.x) * 0.7, o.y + (s.y - o.y) * 0.7);
      }
    }
  } else {
    const upper = style.levels.find((l) => l.ratio === 0) ?? style.levels[0];
    const lower = style.levels.find((l) => l.ratio === 1) ?? style.levels[style.levels.length - 1];
    ctx.save();
    applyLineStyle(ctx, style.levelsStyle);
    ctx.strokeStyle = upper.color;
    ctx.lineWidth = style.levelsWidth;
    extend(ctx, p2, { x: p2.x + dx, y: p2.y + dy }, rect, false, style.extendRight);
    ctx.strokeStyle = lower.color;
    extend(ctx, p3, { x: p3.x + dx, y: p3.y + dy }, rect, false, style.extendRight);
    ctx.restore();
    for (const lvl of style.levels) {
      if (!lvl.visible || lvl.ratio === 0 || lvl.ratio === 1 || Math.abs(lvl.ratio - 0.5) < 1e-6) continue;
      const a = { x: p2.x + (mid.x - p2.x) * lvl.ratio * 2, y: p2.y + (mid.y - p2.y) * lvl.ratio * 2 };
      const b = { x: p3.x + (mid.x - p3.x) * (1 - lvl.ratio) * 2, y: p3.y + (mid.y - p3.y) * (1 - lvl.ratio) * 2 };
      // Parallel at ratio between p2-mid and p3-mid
      const fromP2 = { x: p2.x + (mid.x - p2.x) * lvl.ratio, y: p2.y + (mid.y - p2.y) * lvl.ratio };
      const fromP3 = { x: p3.x + (mid.x - p3.x) * lvl.ratio, y: p3.y + (mid.y - p3.y) * lvl.ratio };
      ctx.save();
      applyLineStyle(ctx, "dashed");
      ctx.strokeStyle = lvl.color;
      ctx.lineWidth = style.levelsWidth;
      extend(ctx, fromP2, { x: fromP2.x + dx, y: fromP2.y + dy }, rect, false, style.extendRight);
      extend(ctx, fromP3, { x: fromP3.x + dx, y: fromP3.y + dy }, rect, false, style.extendRight);
      ctx.restore();
      void a;
      void b;
    }
  }
}

function paintInfo(ctx: CanvasRenderingContext2D, d: Drawing, pts: Pt[], precision: number): void {
  stroke(ctx, pts[0], pts[1]);
  const dp = d.points[1].price - d.points[0].price;
  const pct = (dp / d.points[0].price) * 100;
  const bars = Math.abs(d.points[1].time - d.points[0].time);
  const ang = (Math.atan2(pts[0].y - pts[1].y, pts[1].x - pts[0].x) * 180) / Math.PI;
  const mx = (pts[0].x + pts[1].x) / 2;
  const my = (pts[0].y + pts[1].y) / 2;
  ctx.font = CHART_FONT;
  ctx.fillStyle = "#d1d4dc";
  ctx.fillText(`${formatPrice(dp, precision)} (${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%)  ${ang.toFixed(1)}°  Δt ${bars}s`, mx + 8, my - 6);
}

function paintTrendAngle(ctx: CanvasRenderingContext2D, pts: Pt[]): void {
  stroke(ctx, pts[0], pts[1]);
  stroke(ctx, pts[0], { x: pts[1].x, y: pts[0].y });
  const ang = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
  ctx.beginPath();
  ctx.arc(pts[0].x, pts[0].y, 28, 0, ang, ang < 0);
  ctx.stroke();
  ctx.font = CHART_FONT;
  ctx.fillText(`${((-ang * 180) / Math.PI).toFixed(1)}°`, pts[0].x + 32, pts[0].y - 8);
}

function paintParallel(ctx: CanvasRenderingContext2D, pts: Pt[], rect: ViewRect): void {
  const [a, b, c] = pts;
  const ox = c.x - a.x;
  const oy = c.y - a.y;
  extend(ctx, a, b, rect, true, true);
  extend(ctx, { x: a.x + ox, y: a.y + oy }, { x: b.x + ox, y: b.y + oy }, rect, true, true);
  ctx.globalAlpha = 0.12;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(b.x + ox, b.y + oy);
  ctx.lineTo(a.x + ox, a.y + oy);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
}

function paintRegression(ctx: CanvasRenderingContext2D, pts: Pt[], rect: ViewRect, bars: Bar[]): void {
  const t0 = Math.min(pts[0].x, pts[1].x);
  const t1 = Math.max(pts[0].x, pts[1].x);
  extend(ctx, pts[0], pts[1], rect, false, true);
  if (bars.length < 3) return;
  const midY = (pts[0].y + pts[1].y) / 2;
  const amp = Math.abs(pts[1].y - pts[0].y) * 0.35 + 12;
  ctx.setLineDash([6, 4]);
  extend(ctx, { x: t0, y: midY - amp }, { x: t1, y: midY - amp }, rect, false, true);
  extend(ctx, { x: t0, y: midY + amp }, { x: t1, y: midY + amp }, rect, false, true);
  ctx.setLineDash([]);
}

function paintFlatTop(ctx: CanvasRenderingContext2D, pts: Pt[], rect: ViewRect): void {
  extend(ctx, pts[0], pts[1], rect, true, true);
  stroke(ctx, { x: rect.x, y: pts[2].y }, { x: rect.x + rect.w, y: pts[2].y });
}

function paintDisjoint(ctx: CanvasRenderingContext2D, pts: Pt[], rect: ViewRect): void {
  extend(ctx, pts[0], pts[1], rect, false, true);
  extend(ctx, pts[0], pts[2], rect, false, true);
}

function paintShapeBox(ctx: CanvasRenderingContext2D, d: Drawing, pts: Pt[]): void {
  if (pts.length < 2) return;
  const style = resolveFibStyleForKind(d);
  const x = Math.min(pts[0].x, pts[1].x);
  const y = Math.min(pts[0].y, pts[1].y);
  const w = Math.abs(pts[1].x - pts[0].x);
  const h = Math.abs(pts[1].y - pts[0].y);
  if (style.showBackground) {
    ctx.fillStyle = style.levels[0]?.fill ?? `${d.color}22`;
    ctx.fillRect(x, y, w, h);
  }
  applyLineStyle(ctx, style.levelsStyle);
  ctx.strokeStyle = style.trendColor;
  ctx.lineWidth = style.trendWidth;
  ctx.strokeRect(x, y, w, h);
  ctx.setLineDash([]);
}

function paintDatePriceRange(ctx: CanvasRenderingContext2D, d: Drawing, pts: Pt[], precision: number, bars: Bar[]): void {
  if (pts.length < 2) return;
  const style = resolveFibStyleForKind(d);
  const x = Math.min(pts[0].x, pts[1].x);
  const y = Math.min(pts[0].y, pts[1].y);
  const w = Math.abs(pts[1].x - pts[0].x);
  const h = Math.abs(pts[1].y - pts[0].y);
  if (style.showBackground) {
    ctx.fillStyle = style.levels[0]?.fill ?? `${d.color}22`;
    ctx.fillRect(x, y, w, h);
  }
  applyLineStyle(ctx, style.levelsStyle);
  ctx.strokeStyle = style.trendColor;
  ctx.lineWidth = style.trendWidth;
  ctx.strokeRect(x, y, w, h);
  ctx.setLineDash([]);
  if (!style.showLevels && !style.showPrices) return;
  const t0 = Math.min(d.points[0].time, d.points[1].time);
  const t1 = Math.max(d.points[0].time, d.points[1].time);
  const n = bars.filter((b) => b.time >= t0 && b.time <= t1).length;
  const dp = d.points[1].price - d.points[0].price;
  const pct = (dp / (Math.abs(d.points[0].price) || 1)) * 100;
  const ms = Math.abs(d.points[1].time - d.points[0].time);
  const hours = ms / 3_600_000;
  const timeLabel = hours >= 48 ? `${(hours / 24).toFixed(1)}d` : hours >= 1 ? `${hours.toFixed(1)}h` : `${Math.round(ms / 60_000)}m`;
  ctx.font = CHART_FONT_BOLD;
  ctx.fillStyle = "#d1d4dc";
  const lines: string[] = [];
  if (style.showLevels) lines.push(`${n} bars · ${timeLabel}`);
  if (style.showPrices) lines.push(`${pct >= 0 ? "+" : ""}${pct.toFixed(2)}% · ${formatPrice(dp, precision)}`);
  lines.forEach((line, i) => ctx.fillText(line, x + 8, y + 16 + i * 14));
}

function paintBarsPattern(ctx: CanvasRenderingContext2D, d: Drawing, pts: Pt[], bars: Bar[], yOfPrice: (price: number) => number): void {
  if (pts.length < 2 || !bars.length) return;
  const style = resolveFibStyleForKind(d);
  const x0 = Math.min(pts[0].x, pts[1].x);
  const x1 = Math.max(pts[0].x, pts[1].x);
  const y0 = Math.min(pts[0].y, pts[1].y);
  const y1 = Math.max(pts[0].y, pts[1].y);
  if (style.showBackground) {
    ctx.fillStyle = "rgba(41,98,255,0.08)";
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  }
  applyLineStyle(ctx, "dashed");
  ctx.strokeStyle = style.trendColor;
  ctx.lineWidth = 1;
  ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
  ctx.setLineDash([]);
  const tLo = Math.min(d.points[0].time, d.points[1].time);
  const tHi = Math.max(d.points[0].time, d.points[1].time);
  const subset = bars.filter((b) => b.time >= tLo && b.time <= tHi);
  if (subset.length < 1) return;
  const slot = (x1 - x0) / Math.max(subset.length, 1);
  // Replay pattern forward immediately to the right of the selection.
  subset.forEach((b, i) => {
    const cx = x1 + slot * (i + 0.5);
    const openY = yOfPrice(b.open);
    const closeY = yOfPrice(b.close);
    const highY = yOfPrice(b.high);
    const lowY = yOfPrice(b.low);
    const up = b.close >= b.open;
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = up ? "#089981" : "#f23645";
    ctx.fillStyle = up ? "rgba(8,153,129,0.35)" : "rgba(242,54,69,0.35)";
    ctx.beginPath();
    ctx.moveTo(cx, highY);
    ctx.lineTo(cx, lowY);
    ctx.stroke();
    const top = Math.min(openY, closeY);
    const bh = Math.max(1, Math.abs(closeY - openY));
    ctx.fillRect(cx - slot * 0.35, top, slot * 0.7, bh);
    ctx.globalAlpha = 1;
  });
  if (style.showLevels) {
    ctx.font = CHART_FONT;
    ctx.fillStyle = "#d1d4dc";
    ctx.fillText(`Pattern ×${subset.length}`, x1 + 6, y0 + 14);
  }
}

function paintRotatedRect(ctx: CanvasRenderingContext2D, d: Drawing, pts: Pt[]): void {
  const style = resolveFibStyleForKind(d);
  const [a, b, c] = pts;
  const ox = c.x - a.x;
  const oy = c.y - a.y;
  const poly = [a, b, { x: b.x + ox, y: b.y + oy }, { x: a.x + ox, y: a.y + oy }];
  paintPoly(ctx, poly, true, style.showBackground ? style.levels[0]?.fill ?? "rgba(41,98,255,0.12)" : undefined);
}

function paintEllipse(ctx: CanvasRenderingContext2D, d: Drawing, pts: Pt[], circle: boolean): void {
  const style = resolveFibStyleForKind(d);
  const cx = (pts[0].x + pts[1].x) / 2;
  const cy = (pts[0].y + pts[1].y) / 2;
  let rx = Math.abs(pts[1].x - pts[0].x) / 2;
  let ry = Math.abs(pts[1].y - pts[0].y) / 2;
  if (circle) rx = ry = Math.max(rx, ry);
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx || 1, ry || 1, 0, 0, Math.PI * 2);
  applyLineStyle(ctx, style.levelsStyle);
  ctx.strokeStyle = style.trendColor;
  ctx.lineWidth = style.trendWidth;
  ctx.stroke();
  if (style.showBackground) {
    ctx.fillStyle = style.levels[0]?.fill ?? "rgba(41,98,255,0.08)";
    ctx.fill();
  }
  ctx.setLineDash([]);
}

function paintShapeTriangle(ctx: CanvasRenderingContext2D, d: Drawing, pts: Pt[]): void {
  const style = resolveFibStyleForKind(d);
  paintPoly(ctx, pts, true, style.showBackground ? style.levels[0]?.fill ?? `${d.color}18` : undefined);
}

function paintPoly(ctx: CanvasRenderingContext2D, pts: Pt[], close: boolean, fill?: string): void {
  if (pts.length < 2) return;
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  if (close) ctx.closePath();
  ctx.stroke();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
}

function paintArc(ctx: CanvasRenderingContext2D, d: Drawing, pts: Pt[]): void {
  const style = resolveFibStyleForKind(d);
  const r = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
  const ang = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
  ctx.beginPath();
  ctx.arc(pts[0].x, pts[0].y, r, ang - 0.9, ang + 0.9);
  applyLineStyle(ctx, style.levelsStyle);
  ctx.strokeStyle = style.trendColor;
  ctx.lineWidth = style.trendWidth;
  ctx.stroke();
  ctx.setLineDash([]);
}

function paintCurve(ctx: CanvasRenderingContext2D, d: Drawing, pts: Pt[], cubic: boolean): void {
  const style = resolveFibStyleForKind(d);
  applyLineStyle(ctx, style.levelsStyle);
  ctx.strokeStyle = style.trendColor;
  ctx.lineWidth = style.trendWidth;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  if (cubic && pts.length >= 4) ctx.bezierCurveTo(pts[1].x, pts[1].y, pts[2].x, pts[2].y, pts[3].x, pts[3].y);
  else ctx.quadraticCurveTo(pts[1].x, pts[1].y, pts[2].x, pts[2].y);
  ctx.stroke();
  ctx.setLineDash([]);
}

function paintFree(ctx: CanvasRenderingContext2D, d: Drawing, pts: Pt[], kind: DrawingKind): void {
  if (pts.length < 2) return;
  const style = resolveFibStyleForKind(d);
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  if (kind === "highlighter") {
    ctx.lineWidth = Math.max(12, style.trendWidth);
    ctx.globalAlpha = 0.28;
    ctx.strokeStyle = style.trendColor;
  } else if (kind === "brush") {
    ctx.lineWidth = Math.max(2.5, style.trendWidth);
    ctx.strokeStyle = style.trendColor;
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function paintPosition(ctx: CanvasRenderingContext2D, d: Drawing, pts: Pt[], precision: number): void {
  if (!pts[0]) return;
  const style = resolveFibStyleForKind(d);
  const entry = pts[0];
  const long = d.kind === "long";
  const tp = pts[1] ?? { x: entry.x + 120, y: entry.y - (long ? 50 : -50) };
  const sl = pts[2] ?? { x: entry.x + 120, y: entry.y + (long ? 30 : -30) };
  const w = Math.max(110, Math.abs(tp.x - entry.x) + 90);
  const profit = long ? "rgba(8,153,129,0.20)" : "rgba(242,54,69,0.20)";
  const loss = long ? "rgba(242,54,69,0.20)" : "rgba(8,153,129,0.20)";
  if (style.showBackground) {
    ctx.fillStyle = profit;
    ctx.fillRect(entry.x, Math.min(entry.y, tp.y), w, Math.abs(tp.y - entry.y) || 1);
    ctx.fillStyle = loss;
    ctx.fillRect(entry.x, Math.min(entry.y, sl.y), w, Math.abs(sl.y - entry.y) || 1);
  }
  applyLineStyle(ctx, style.levelsStyle);
  ctx.strokeStyle = style.trendColor;
  ctx.lineWidth = style.trendWidth;
  ctx.strokeRect(entry.x, Math.min(entry.y, tp.y, sl.y), w, Math.max(Math.abs(tp.y - entry.y), Math.abs(sl.y - entry.y)) || 1);
  ctx.beginPath();
  ctx.moveTo(entry.x, entry.y);
  ctx.lineTo(entry.x + w, entry.y);
  ctx.strokeStyle = "#d1d4dc";
  ctx.stroke();
  const eP = d.points[0]?.price ?? 0;
  const tpP = d.points[1]?.price ?? eP;
  const slP = d.points[2]?.price ?? eP;
  const reward = Math.abs(tpP - eP);
  const risk = Math.abs(slP - eP) || 1e-9;
  const rr = reward / risk;
  const stopPct = (risk / (Math.abs(eP) || 1)) * 100;
  const tgtPct = (reward / (Math.abs(eP) || 1)) * 100;
  ctx.font = CHART_FONT;
  ctx.fillStyle = "#d1d4dc";
  if (style.showLevels) {
    ctx.fillText(long ? "Long" : "Short", entry.x + 8, Math.min(entry.y, tp.y, sl.y) + 14);
    ctx.fillText(`Entry ${formatPrice(eP, precision)}`, entry.x + 8, entry.y - 6);
  }
  if (style.showPrices) {
    ctx.fillStyle = long ? "#089981" : "#f23645";
    ctx.fillText(`Target ${formatPrice(tpP, precision)}  (+${tgtPct.toFixed(2)}%)`, entry.x + 8, Math.min(entry.y, tp.y) + (style.showLevels ? 28 : 14));
    ctx.fillStyle = long ? "#f23645" : "#089981";
    ctx.fillText(`Stop ${formatPrice(slP, precision)}  (−${stopPct.toFixed(2)}%)`, entry.x + 8, Math.max(entry.y, sl.y) - 8);
    ctx.fillStyle = "#d1d4dc";
    ctx.fillText(`RR ${rr.toFixed(2)}`, entry.x + w - 64, entry.y - 6);
  }
}

function priceDelta(a: { price: number } | undefined, b: { price: number } | undefined): number {
  if (!a || !b) return 0;
  return Math.abs(a.price - b.price);
}

function ratioLabel(num: number, den: number): string {
  if (!(den > 0) || !Number.isFinite(num / den)) return "—";
  return formatFibRatio(num / den);
}

function fillPoly(ctx: CanvasRenderingContext2D, pts: Pt[], fill: string): void {
  if (pts.length < 3) return;
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function mid(a: Pt, b: Pt): Pt {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function paintPattern(ctx: CanvasRenderingContext2D, d: Drawing, pts: Pt[], kind: DrawingKind): void {
  if (pts.length < 2) return;
  const style = resolveFibStyleForKind(d);
  const labels =
    kind === "abcd"
      ? ["A", "B", "C", "D"]
      : kind === "trianglepattern"
        ? ["A", "B", "C", "D"]
        : kind === "headshoulders"
          ? ["LS", "N", "H", "N", "RS", "E", "E"]
          : kind === "threedrives"
            ? ["0", "1", "2", "3", "4", "5", "6"]
            : kind === "elliottimpulse"
              ? ["0", "1", "2", "3", "4", "5"]
              : kind === "elliottcorrection"
                ? ["0", "A", "B", "C"]
                : kind === "elliotttriangle"
                  ? ["A", "B", "C", "D", "E"]
                  : kind === "elliottdouble"
                    ? ["W", "X", "Y"]
                    : kind === "elliotttriple"
                      ? ["W", "X", "Y", "X", "Z"]
                      : ["X", "A", "B", "C", "D"];

  // Fills
  if (style.showBackground) {
    if (kind === "trianglepattern" && pts.length >= 4) {
      fillPoly(ctx, [pts[0], pts[1], pts[2]], "rgba(41,98,255,0.10)");
      fillPoly(ctx, [pts[1], pts[2], pts[3]], "rgba(8,153,129,0.10)");
    } else if ((kind === "xabcd" || kind === "cypher") && pts.length >= 5) {
      fillPoly(ctx, [pts[0], pts[1], pts[2]], "rgba(41,98,255,0.12)");
      fillPoly(ctx, [pts[1], pts[2], pts[3]], "rgba(171,71,188,0.10)");
      fillPoly(ctx, [pts[2], pts[3], pts[4]], "rgba(8,153,129,0.12)");
    } else if (kind === "abcd" && pts.length >= 4) {
      fillPoly(ctx, [pts[0], pts[1], pts[2]], "rgba(41,98,255,0.12)");
      fillPoly(ctx, [pts[1], pts[2], pts[3]], "rgba(8,153,129,0.12)");
    } else if (kind === "headshoulders" && pts.length >= 5) {
      fillPoly(ctx, [pts[0], pts[1], pts[2], pts[3], pts[4]], "rgba(242,54,69,0.08)");
    } else if (kind.startsWith("elliott") && pts.length >= 3) {
      fillPoly(ctx, pts.slice(0, Math.min(pts.length, 6)), "rgba(171,71,188,0.08)");
    } else if (kind === "threedrives" && pts.length >= 5) {
      fillPoly(ctx, pts.slice(0, 5), "rgba(41,98,255,0.08)");
    }
  }

  // Neckline for H&S
  if (kind === "headshoulders" && pts.length >= 5) {
    applyLineStyle(ctx, "dashed");
    ctx.strokeStyle = "#f23645";
    ctx.lineWidth = Math.max(1, style.levelsWidth);
    stroke(ctx, pts[1], pts[3]);
    ctx.setLineDash([]);
  }

  // Elliott impulse channel (0-2 / 1-3 guides)
  if (kind === "elliottimpulse" && pts.length >= 4 && style.showTrendLine) {
    applyLineStyle(ctx, "dashed");
    ctx.strokeStyle = style.trendColor;
    ctx.lineWidth = 1;
    stroke(ctx, pts[0], pts[2]);
    if (pts[3]) stroke(ctx, pts[1], pts[3]);
    ctx.setLineDash([]);
  }

  // Main polyline (+ close triangle)
  applyLineStyle(ctx, style.levelsStyle);
  ctx.strokeStyle = style.trendColor;
  ctx.lineWidth = style.trendWidth;
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  if (kind === "trianglepattern" && pts.length >= 4) ctx.closePath();
  ctx.stroke();

  // Point labels
  if (style.showLevels) {
    ctx.font = CHART_FONT_BOLD;
    pts.forEach((p, i) => {
      ctx.fillStyle = style.trendColor;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#d1d4dc";
      ctx.fillText(labels[i] ?? String(i), p.x + 6, p.y - 6);
    });
  }

  // Ratio labels (price-based)
  if (style.showPrices && d.points.length >= 3) {
    ctx.font = AXIS_FONT;
    ctx.fillStyle = "#b2b5be";
    const P = d.points;
    const put = (text: string, a: Pt, b: Pt) => {
      const m = mid(a, b);
      ctx.fillText(text, m.x + 4, m.y - 4);
    };
    if ((kind === "xabcd" || kind === "cypher") && pts.length >= 5 && P.length >= 5) {
      const xa = priceDelta(P[0], P[1]);
      const ab = priceDelta(P[1], P[2]);
      const bc = priceDelta(P[2], P[3]);
      const cd = priceDelta(P[3], P[4]);
      const xb = priceDelta(P[0], P[2]);
      const xd = priceDelta(P[0], P[4]);
      put(`AB/XA ${ratioLabel(ab, xa)}`, pts[1], pts[2]);
      put(`BC/AB ${ratioLabel(bc, ab)}`, pts[2], pts[3]);
      put(`CD/BC ${ratioLabel(cd, bc)}`, pts[3], pts[4]);
      put(`XB/XA ${ratioLabel(xb, xa)}`, pts[0], pts[2]);
      put(`XD/XA ${ratioLabel(xd, xa)}`, pts[0], pts[4]);
    } else if (kind === "abcd" && pts.length >= 4 && P.length >= 4) {
      const ab = priceDelta(P[0], P[1]);
      const bc = priceDelta(P[1], P[2]);
      const cd = priceDelta(P[2], P[3]);
      put(`AB ${formatFibRatio(ab)}`, pts[0], pts[1]);
      put(`BC/AB ${ratioLabel(bc, ab)}`, pts[1], pts[2]);
      put(`CD/AB ${ratioLabel(cd, ab)}`, pts[2], pts[3]);
    } else if (kind === "threedrives" && pts.length >= 7 && P.length >= 7) {
      const d1 = priceDelta(P[0], P[1]);
      const d2 = priceDelta(P[2], P[3]);
      const d3 = priceDelta(P[4], P[5]);
      put(`D2/D1 ${ratioLabel(d2, d1)}`, pts[2], pts[3]);
      put(`D3/D2 ${ratioLabel(d3, d2)}`, pts[4], pts[5]);
    } else if (kind === "elliottimpulse" && pts.length >= 6 && P.length >= 6) {
      const w1 = priceDelta(P[0], P[1]);
      const w3 = priceDelta(P[2], P[3]);
      const w5 = priceDelta(P[4], P[5]);
      put(`3/1 ${ratioLabel(w3, w1)}`, pts[2], pts[3]);
      put(`5/1 ${ratioLabel(w5, w1)}`, pts[4], pts[5]);
    } else if (kind === "elliottcorrection" && pts.length >= 4 && P.length >= 4) {
      const wa = priceDelta(P[0], P[1]);
      const wb = priceDelta(P[1], P[2]);
      const wc = priceDelta(P[2], P[3]);
      put(`B/A ${ratioLabel(wb, wa)}`, pts[1], pts[2]);
      put(`C/A ${ratioLabel(wc, wa)}`, pts[2], pts[3]);
    }
  }
}

function paintCycles(ctx: CanvasRenderingContext2D, d: Drawing, pts: Pt[], rect: ViewRect, showInterval: boolean): void {
  if (pts.length < 2) return;
  const style = resolveFibStyleForKind(d);
  const unit = pts[1].x - pts[0].x || 40;
  const count = 24;
  const start = style.extendLeft ? -Math.ceil((pts[0].x - rect.x) / Math.abs(unit || 1)) : 0;
  const end = style.extendRight ? count : Math.max(2, count);
  for (let i = start; i < end; i++) {
    const x = pts[0].x + unit * i;
    if (x < rect.x - 2 || x > rect.x + rect.w + 2) continue;
    applyLineStyle(ctx, style.levelsStyle);
    ctx.strokeStyle = i === 0 || i === 1 ? style.trendColor : "rgba(120,123,134,0.65)";
    ctx.lineWidth = i === 0 || i === 1 ? style.trendWidth + 0.4 : style.levelsWidth;
    stroke(ctx, { x, y: rect.y }, { x, y: rect.y + rect.h });
    if (style.showLevels && (showInterval || i === 0 || i === 1) && i >= 0) {
      ctx.fillStyle = i <= 1 ? style.trendColor : "#787b86";
      ctx.font = AXIS_FONT;
      ctx.fillText(String(i), x + 3, rect.y + 12);
    }
  }
  if (style.showPrices) {
    ctx.fillStyle = "#b2b5be";
    ctx.font = AXIS_FONT;
    ctx.fillText(`period ${Math.abs(unit).toFixed(0)}px`, pts[0].x + 4, rect.y + rect.h - 8);
  }
}

function paintSine(ctx: CanvasRenderingContext2D, d: Drawing, pts: Pt[], rect: ViewRect): void {
  const style = resolveFibStyleForKind(d);
  const amp = pts[1].y - pts[0].y;
  const len = Math.abs(pts[1].x - pts[0].x) || 80;
  if (style.showTrendLine) {
    applyLineStyle(ctx, "dashed");
    ctx.strokeStyle = "rgba(120,123,134,0.7)";
    ctx.lineWidth = 1;
    stroke(ctx, { x: rect.x, y: pts[0].y }, { x: rect.x + rect.w, y: pts[0].y });
    ctx.setLineDash([]);
  }
  applyLineStyle(ctx, style.levelsStyle);
  ctx.strokeStyle = style.trendColor;
  ctx.lineWidth = style.trendWidth;
  ctx.beginPath();
  const xStart = style.extendLeft ? rect.x : pts[0].x;
  const xEnd = style.extendRight ? rect.x + rect.w : Math.max(pts[0].x, pts[1].x) + len * 2;
  let started = false;
  for (let x = xStart; x <= xEnd; x += 2) {
    const y = pts[0].y + amp * Math.sin(((x - pts[0].x) / len) * Math.PI * 2);
    if (!started) {
      ctx.moveTo(x, y);
      started = true;
    } else ctx.lineTo(x, y);
  }
  ctx.stroke();
  if (style.showLevels) {
    ctx.fillStyle = style.trendColor;
    ctx.beginPath();
    ctx.arc(pts[0].x, pts[0].y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(pts[1].x, pts[1].y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintPriceRange(ctx: CanvasRenderingContext2D, d: Drawing, pts: Pt[], rect: ViewRect, precision: number): void {
  const style = resolveFibStyleForKind(d);
  const top = Math.min(pts[0].y, pts[1].y);
  const bot = Math.max(pts[0].y, pts[1].y);
  if (style.showBackground) {
    ctx.fillStyle = style.levels[0]?.fill ?? `${d.color}18`;
    ctx.fillRect(rect.x, top, rect.w, bot - top);
  }
  applyLineStyle(ctx, style.levelsStyle);
  ctx.strokeStyle = style.trendColor;
  ctx.lineWidth = style.trendWidth;
  stroke(ctx, { x: rect.x, y: pts[0].y }, { x: rect.x + rect.w, y: pts[0].y });
  stroke(ctx, { x: rect.x, y: pts[1].y }, { x: rect.x + rect.w, y: pts[1].y });
  ctx.setLineDash([]);
  if (!style.showPrices && !style.showLevels) return;
  const dp = d.points[1].price - d.points[0].price;
  const pct = (dp / (Math.abs(d.points[0].price) || 1)) * 100;
  ctx.font = CHART_FONT_BOLD;
  ctx.fillStyle = style.trendColor;
  const label = style.showPrices
    ? `${formatPrice(dp, precision)}  (${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%)`
    : `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
  ctx.fillText(label, rect.x + 10, (top + bot) / 2);
}

function paintDateRange(ctx: CanvasRenderingContext2D, d: Drawing, pts: Pt[], rect: ViewRect, bars: Bar[]): void {
  const style = resolveFibStyleForKind(d);
  const left = Math.min(pts[0].x, pts[1].x);
  const right = Math.max(pts[0].x, pts[1].x);
  if (style.showBackground) {
    ctx.fillStyle = style.levels[0]?.fill ?? "rgba(41,98,255,0.10)";
    ctx.fillRect(left, rect.y, right - left, rect.h);
  }
  applyLineStyle(ctx, style.levelsStyle);
  ctx.strokeStyle = style.trendColor;
  ctx.lineWidth = style.trendWidth;
  stroke(ctx, { x: pts[0].x, y: rect.y }, { x: pts[0].x, y: rect.y + rect.h });
  stroke(ctx, { x: pts[1].x, y: rect.y }, { x: pts[1].x, y: rect.y + rect.h });
  ctx.setLineDash([]);
  if (!style.showLevels && !style.showPrices) return;
  const t0 = Math.min(d.points[0].time, d.points[1].time);
  const t1 = Math.max(d.points[0].time, d.points[1].time);
  const n = bars.filter((b) => b.time >= t0 && b.time <= t1).length;
  const ms = Math.abs(t1 - t0);
  const hours = ms / 3_600_000;
  const timeLabel = hours >= 48 ? `${(hours / 24).toFixed(1)}d` : hours >= 1 ? `${hours.toFixed(1)}h` : `${Math.round(ms / 60_000)}m`;
  ctx.font = CHART_FONT_BOLD;
  ctx.fillStyle = style.trendColor;
  ctx.fillText(`${n} bars · ${timeLabel}`, left + 8, rect.y + 18);
}

function paintForecast(ctx: CanvasRenderingContext2D, d: Drawing, pts: Pt[], precision: number): void {
  if (pts.length < 2) return;
  const style = resolveFibStyleForKind(d);
  const a = pts[0];
  const b = pts[1];
  const c = pts[2] ?? { x: b.x + (b.x - a.x), y: b.y + (b.y - a.y) };
  if (style.showBackground) {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.closePath();
    ctx.fillStyle = style.levels[0]?.fill ?? "rgba(41,98,255,0.12)";
    ctx.fill();
  }
  applyLineStyle(ctx, style.trendStyle);
  ctx.strokeStyle = style.trendColor;
  ctx.lineWidth = style.trendWidth;
  stroke(ctx, a, b);
  stroke(ctx, b, c);
  stroke(ctx, a, c);
  ctx.setLineDash([]);
  arrowHead(ctx, b, c);
  if (style.showLevels || style.showPrices) {
    const dp = (d.points[2]?.price ?? d.points[1].price) - d.points[0].price;
    const pct = (dp / (Math.abs(d.points[0].price) || 1)) * 100;
    ctx.font = CHART_FONT;
    ctx.fillStyle = style.trendColor;
    const bits: string[] = ["Forecast"];
    if (style.showPrices) bits.push(`${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`, formatPrice(d.points[2]?.price ?? d.points[1].price, precision));
    ctx.fillText(bits.join(" · "), c.x + 6, c.y - 4);
  }
}

function paintProjection(ctx: CanvasRenderingContext2D, d: Drawing, pts: Pt[], rect: ViewRect, precision: number): void {
  if (pts.length < 2) return;
  const style = resolveFibStyleForKind(d);
  const a = pts[0];
  const b = pts[1];
  const c = pts[2] ?? { x: b.x + (b.x - a.x), y: b.y - (a.y - b.y) };
  applyLineStyle(ctx, style.trendStyle);
  ctx.strokeStyle = style.trendColor;
  ctx.lineWidth = style.trendWidth;
  stroke(ctx, a, b);
  if (style.extendRight) extend(ctx, b, c, rect, false, true);
  else stroke(ctx, b, c);
  ctx.setLineDash([]);
  arrowHead(ctx, b, c);
  if (style.showBackground) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * 10;
    const ny = (dx / len) * 10;
    ctx.beginPath();
    ctx.moveTo(a.x + nx, a.y + ny);
    ctx.lineTo(b.x + nx, b.y + ny);
    ctx.lineTo(c.x + nx, c.y + ny);
    ctx.lineTo(c.x - nx, c.y - ny);
    ctx.lineTo(b.x - nx, b.y - ny);
    ctx.lineTo(a.x - nx, a.y - ny);
    ctx.closePath();
    ctx.fillStyle = style.levels[0]?.fill ?? "rgba(41,98,255,0.10)";
    ctx.fill();
  }
  if (style.showLevels || style.showPrices) {
    const src = Math.abs((d.points[1]?.price ?? 0) - (d.points[0]?.price ?? 0));
    const proj = Math.abs((d.points[2]?.price ?? d.points[1]?.price ?? 0) - (d.points[1]?.price ?? 0));
    const ratio = src > 0 ? proj / src : 0;
    ctx.font = CHART_FONT;
    ctx.fillStyle = style.trendColor;
    const label = style.showPrices
      ? `Proj ${formatFibRatio(ratio)} · ${formatPrice(d.points[2]?.price ?? d.points[1].price, precision)}`
      : `Proj ${formatFibRatio(ratio)}`;
    ctx.fillText(label, c.x + 6, c.y - 4);
  }
}

function paintGhostFeed(ctx: CanvasRenderingContext2D, d: Drawing, pts: Pt[], bars: Bar[], yOfPrice: (price: number) => number): void {
  if (pts.length < 2 || !bars.length) return;
  const style = resolveFibStyleForKind(d);
  const a = pts[0];
  const b = pts[1];
  const slot = Math.max(4, Math.abs(b.x - a.x) / 8);
  const last = bars[bars.length - 1];
  let px = last.close;
  applyLineStyle(ctx, "dashed");
  ctx.strokeStyle = style.trendColor;
  for (let i = 0; i < 12; i++) {
    const drift = ((b.y - a.y) / Math.max(Math.abs(b.x - a.x), 1)) * (last.close * 0.002);
    const open = px;
    const close = px - drift + (i % 2 === 0 ? 1 : -1) * Math.abs(drift) * 0.4;
    const high = Math.max(open, close) + Math.abs(drift) * 0.3;
    const low = Math.min(open, close) - Math.abs(drift) * 0.3;
    const cx = b.x + slot * (i + 0.5);
    ctx.globalAlpha = Math.max(0.15, 0.7 - i * 0.05);
    ctx.beginPath();
    ctx.moveTo(cx, yOfPrice(high));
    ctx.lineTo(cx, yOfPrice(low));
    ctx.stroke();
    const top = Math.min(yOfPrice(open), yOfPrice(close));
    const bh = Math.max(1, Math.abs(yOfPrice(close) - yOfPrice(open)));
    ctx.fillStyle = close >= open ? "rgba(8,153,129,0.35)" : "rgba(242,54,69,0.35)";
    ctx.fillRect(cx - slot * 0.35, top, slot * 0.7, bh);
    px = close;
  }
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);
  if (style.showLevels) {
    ctx.font = CHART_FONT;
    ctx.fillStyle = style.trendColor;
    ctx.fillText("Ghost feed", b.x + 4, b.y - 6);
  }
}

function paintSector(ctx: CanvasRenderingContext2D, d: Drawing, pts: Pt[]): void {
  if (pts.length < 3) return;
  const style = resolveFibStyleForKind(d);
  const o = pts[0];
  const a = pts[1];
  const b = pts[2];
  const r = Math.hypot(a.x - o.x, a.y - o.y) || 1;
  const ang0 = Math.atan2(a.y - o.y, a.x - o.x);
  const ang1 = Math.atan2(b.y - o.y, b.x - o.x);
  let delta = ang1 - ang0;
  while (delta <= -Math.PI) delta += Math.PI * 2;
  while (delta > Math.PI) delta -= Math.PI * 2;
  ctx.beginPath();
  ctx.moveTo(o.x, o.y);
  ctx.arc(o.x, o.y, r, ang0, ang0 + delta, delta < 0);
  ctx.closePath();
  if (style.showBackground) {
    ctx.fillStyle = style.levels[0]?.fill ?? "rgba(41,98,255,0.16)";
    ctx.fill();
  }
  applyLineStyle(ctx, style.levelsStyle);
  ctx.strokeStyle = style.trendColor;
  ctx.lineWidth = style.trendWidth;
  ctx.stroke();
  ctx.setLineDash([]);
  if (style.showLevels) {
    const deg = (Math.abs(delta) * 180) / Math.PI;
    ctx.font = CHART_FONT;
    ctx.fillStyle = style.trendColor;
    ctx.fillText(`${deg.toFixed(1)}°`, o.x + 8, o.y - 8);
  }
}

function paintAnchoredVwap(ctx: CanvasRenderingContext2D, p: Pt, rect: ViewRect, bars: Bar[], yOfPrice: (price: number) => number): void {
  if (!bars.length) return;
  const slot = rect.w / bars.length;
  const start = Math.max(
    0,
    bars.findIndex((_, i) => rect.x + slot * (i + 0.5) >= p.x - slot),
  );
  ctx.beginPath();
  let pv = 0;
  let vol = 0;
  let started = false;
  for (let i = start; i < bars.length; i++) {
    const b = bars[i];
    const tp = (b.high + b.low + b.close) / 3;
    pv += tp * b.volume;
    vol += b.volume;
    const vwap = vol ? pv / vol : tp;
    const x = rect.x + slot * (i + 0.5);
    const y = yOfPrice(vwap);
    if (!started) {
      ctx.moveTo(x, y);
      started = true;
    } else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = "#e1a218";
  ctx.lineWidth = 1.4;
  ctx.stroke();
}

function paintVolProfile(
  ctx: CanvasRenderingContext2D,
  d: Drawing,
  pts: Pt[],
  rect: ViewRect,
  bars: Bar[],
  anchored: boolean,
  yOfPrice: (price: number) => number,
): void {
  if (!bars.length || !pts[0]) return;
  const style = resolveFibStyleForKind(d);
  const x0 = anchored ? pts[0].x : Math.min(pts[0].x, pts[1]?.x ?? pts[0].x);
  const x1 = anchored ? rect.x + rect.w : Math.max(pts[0].x, pts[1]?.x ?? pts[0].x);
  const slot = rect.w / bars.length;
  const subset = bars.filter((_, i) => {
    const x = rect.x + slot * (i + 0.5);
    return x >= x0 && x <= x1;
  });
  if (!subset.length) return;
  const lo = Math.min(...subset.map((b) => b.low));
  const hi = Math.max(...subset.map((b) => b.high));
  const bins = 32;
  const vol = new Array(bins).fill(0);
  for (const b of subset) {
    const idx = Math.min(bins - 1, Math.floor(((b.close - lo) / (hi - lo || 1)) * bins));
    vol[idx] += b.volume;
  }
  const max = Math.max(...vol, 1);
  const total = vol.reduce((s, v) => s + v, 0) || 1;
  const width = Math.min(140, Math.max(48, (x1 - x0) * 0.45));
  // Value area ~70% around POC
  let poc = 0;
  for (let i = 1; i < bins; i++) if (vol[i] > vol[poc]) poc = i;
  let loBin = poc;
  let hiBin = poc;
  let covered = vol[poc];
  while (covered / total < 0.7 && (loBin > 0 || hiBin < bins - 1)) {
    const nextLo = loBin > 0 ? vol[loBin - 1] : -1;
    const nextHi = hiBin < bins - 1 ? vol[hiBin + 1] : -1;
    if (nextHi >= nextLo) {
      hiBin++;
      covered += vol[hiBin];
    } else {
      loBin--;
      covered += vol[loBin];
    }
  }
  vol.forEach((v, i) => {
    const y1 = yOfPrice(lo + ((i + 1) / bins) * (hi - lo));
    const y0 = yOfPrice(lo + (i / bins) * (hi - lo));
    const inVA = i >= loBin && i <= hiBin;
    ctx.fillStyle = inVA ? "rgba(41,98,255,0.38)" : "rgba(41,98,255,0.18)";
    if (!style.showBackground && !inVA) return;
    ctx.fillRect(x0, Math.min(y0, y1), (v / max) * width, Math.abs(y1 - y0) || 1);
  });
  // POC line
  const pocPrice = lo + ((poc + 0.5) / bins) * (hi - lo);
  const pocY = yOfPrice(pocPrice);
  ctx.strokeStyle = "#f9a825";
  ctx.lineWidth = 1.2;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(x0, pocY);
  ctx.lineTo(x0 + width, pocY);
  ctx.stroke();
  ctx.setLineDash([]);
  if (style.showLevels) {
    ctx.font = CHART_FONT;
    ctx.fillStyle = "#f9a825";
    ctx.fillText("POC", x0 + width + 4, pocY + 3);
    const vah = yOfPrice(lo + ((hiBin + 1) / bins) * (hi - lo));
    const val = yOfPrice(lo + (loBin / bins) * (hi - lo));
    ctx.fillStyle = "#2962ff";
    ctx.fillText("VAH", x0 + width + 4, Math.min(vah, val) + 3);
    ctx.fillText("VAL", x0 + width + 4, Math.max(vah, val) + 3);
  }
}

function paintLabel(ctx: CanvasRenderingContext2D, d: Drawing, p: Pt, precision: number): void {
  const style = resolveFibStyleForKind(d);
  const price = formatPrice(d.points[0].price, precision);
  if (d.kind === "pricelabel") {
    ctx.fillStyle = style.trendColor;
    ctx.fillRect(p.x + 6, p.y - 10, 78, 18);
    ctx.fillStyle = "#fff";
    ctx.font = CHART_FONT;
    ctx.fillText(price, p.x + 10, p.y + 3);
    return;
  }
  if (d.kind === "note" || d.kind === "anchorednote") {
    const w = 132;
    const h = 52;
    ctx.fillStyle = style.trendColor;
    ctx.fillRect(p.x, p.y, w, h);
    ctx.fillStyle = "#131722";
    ctx.font = CHART_FONT_BOLD;
    ctx.fillText(d.kind === "anchorednote" ? "Anchored note" : "Note", p.x + 8, p.y + 16);
    ctx.font = CHART_FONT;
    ctx.fillText(d.text || "Note", p.x + 8, p.y + 34);
    return;
  }
  if (d.kind === "table") {
    const rows = 3;
    const cols = 3;
    const cw = 44;
    const rh = 18;
    ctx.strokeStyle = style.trendColor;
    ctx.fillStyle = style.showBackground ? "rgba(30,34,45,0.92)" : "transparent";
    ctx.fillRect(p.x, p.y, cw * cols, rh * rows);
    ctx.strokeRect(p.x, p.y, cw * cols, rh * rows);
    for (let r = 1; r < rows; r++) {
      ctx.beginPath();
      ctx.moveTo(p.x, p.y + r * rh);
      ctx.lineTo(p.x + cw * cols, p.y + r * rh);
      ctx.stroke();
    }
    for (let c = 1; c < cols; c++) {
      ctx.beginPath();
      ctx.moveTo(p.x + c * cw, p.y);
      ctx.lineTo(p.x + c * cw, p.y + rh * rows);
      ctx.stroke();
    }
    ctx.font = CHART_FONT;
    ctx.fillStyle = "#d1d4dc";
    ctx.fillText(d.text || "Table", p.x + 6, p.y + 13);
    return;
  }
  if (d.kind === "signpost") {
    stroke(ctx, p, { x: p.x, y: p.y - 28 });
    ctx.fillStyle = style.trendColor;
    ctx.fillRect(p.x, p.y - 46, 90, 20);
    ctx.fillStyle = "#fff";
    ctx.font = CHART_FONT;
    ctx.fillText(d.text || "Signpost", p.x + 6, p.y - 32);
    return;
  }
  if (d.kind === "anchoredtext" || d.kind === "text") {
    if (style.showBackground) {
      const label = d.text || "Text";
      ctx.font = CHART_FONT_BOLD;
      const tw = ctx.measureText(label).width + 12;
      ctx.fillStyle = "rgba(30,34,45,0.85)";
      ctx.fillRect(p.x, p.y - 16, tw, 22);
      ctx.strokeStyle = style.trendColor;
      ctx.strokeRect(p.x, p.y - 16, tw, 22);
      ctx.fillStyle = "#d1d4dc";
      ctx.fillText(label, p.x + 6, p.y);
      return;
    }
    ctx.font = CHART_FONT_BOLD;
    ctx.fillStyle = style.trendColor;
    ctx.fillText(d.text || "Text", p.x + 4, p.y - 4);
    return;
  }
  ctx.font = CHART_FONT_BOLD;
  ctx.fillStyle = style.trendColor;
  ctx.fillText(d.kind === "pricenote" ? `${d.text || "Note"}  ${price}` : d.text || "Text", p.x + 4, p.y - 4);
}

function paintImage(ctx: CanvasRenderingContext2D, d: Drawing, pts: Pt[]): void {
  if (pts.length < 2) return;
  const style = resolveFibStyleForKind(d);
  const x = Math.min(pts[0].x, pts[1].x);
  const y = Math.min(pts[0].y, pts[1].y);
  const w = Math.abs(pts[1].x - pts[0].x);
  const h = Math.abs(pts[1].y - pts[0].y);
  if (style.showBackground) {
    ctx.fillStyle = "rgba(30,34,45,0.55)";
    ctx.fillRect(x, y, w, h);
  }
  ctx.strokeStyle = style.trendColor;
  ctx.lineWidth = style.trendWidth;
  ctx.strokeRect(x, y, w, h);
  // Placeholder X
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y + h);
  ctx.moveTo(x + w, y);
  ctx.lineTo(x, y + h);
  ctx.stroke();
  ctx.font = CHART_FONT;
  ctx.fillStyle = "#d1d4dc";
  ctx.fillText(d.text || "Image", x + 8, y + 16);
}

function paintCallout(ctx: CanvasRenderingContext2D, d: Drawing, pts: Pt[]): void {
  const style = resolveFibStyleForKind(d);
  const a = pts[0];
  const b = pts[1] ?? { x: a.x + 90, y: a.y - 36 };
  stroke(ctx, a, b);
  const label = d.text || (d.kind === "comment" ? "Comment" : "Callout");
  ctx.font = CHART_FONT;
  const tw = Math.max(110, ctx.measureText(label).width + 16);
  ctx.fillStyle = style.showBackground ? "rgba(30,34,45,0.95)" : "transparent";
  ctx.strokeStyle = style.trendColor;
  ctx.lineWidth = style.trendWidth;
  ctx.fillRect(b.x, b.y - 16, tw, 28);
  ctx.strokeRect(b.x, b.y - 16, tw, 28);
  ctx.fillStyle = "#d1d4dc";
  ctx.fillText(label, b.x + 8, b.y + 3);
}

function paintArrowMark(ctx: CanvasRenderingContext2D, d: Drawing, p: Pt, kind: DrawingKind): void {
  const style = resolveFibStyleForKind(d);
  ctx.fillStyle = style.trendColor;
  ctx.beginPath();
  if (kind === "arrowmarkleft") {
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + 16, p.y - 8);
    ctx.lineTo(p.x + 16, p.y + 8);
  } else if (kind === "arrowmarkright") {
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x - 16, p.y - 8);
    ctx.lineTo(p.x - 16, p.y + 8);
  } else if (kind === "arrowmarker") {
    ctx.moveTo(p.x, p.y - 10);
    ctx.lineTo(p.x + 8, p.y + 6);
    ctx.lineTo(p.x, p.y + 2);
    ctx.lineTo(p.x - 8, p.y + 6);
  } else {
    const up = kind !== "arrowdown";
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x - 7, p.y + (up ? 14 : -14));
    ctx.lineTo(p.x + 7, p.y + (up ? 14 : -14));
  }
  ctx.closePath();
  ctx.fill();
}


