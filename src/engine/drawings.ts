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
    case "signpost":
    case "pricelabel":
    case "pricenote":
    case "arrowmarker":
    case "flagmark":
    case "sticker":
    case "arrowup":
    case "arrowdown":
    case "anchoredvwap":
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
      return 3;
    case "doublecurve":
    case "abcd":
    case "trianglepattern":
      return 4;
    case "callout":
    case "comment":
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
  if (kind === "fib") return defaultFibRetraceStyle();
  if (kind === "fibext") return defaultFibExtensionStyle();
  return undefined;
}

export function formatFibRatio(ratio: number): string {
  if (Number.isInteger(ratio)) return String(ratio);
  const fixed = ratio.toFixed(3).replace(/\.?0+$/, "");
  return fixed || "0";
}

type FibLvl = { ratio: number; color: string; fill: string };

const FIB_RETRACE: FibLvl[] = DEFAULT_FIB_LEVELS.map((l) => ({
  ratio: l.ratio,
  color: l.color,
  fill: l.fill,
}));

const FIB_TIME = [0, 1, 2, 3, 5, 8, 13, 21, 34, 55];
const GANN_RATIOS = [1 / 8, 1 / 4, 1 / 3, 1 / 2, 1, 2, 3, 4, 8];
const GANN_LABELS = ["1/8", "1/4", "1/3", "1/2", "1/1", "2/1", "3/1", "4/1", "8/1"];
const FAN_RATIOS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
const BOX_RATIOS = [0, 0.25, 0.382, 0.5, 0.618, 0.75, 1];
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
  else if (kind === "fibchannel") paintFibChannel(ctx, pts, rect, selected);
  else if (kind === "fibtimezone") paintFibTimeZone(ctx, pts, rect);
  else if (kind === "fibfan") paintFibFan(ctx, pts, rect);
  else if (kind === "fibtime") paintFibTime(ctx, pts, rect);
  else if (kind === "fibcircles") paintFibCircles(ctx, pts);
  else if (kind === "fibspiral") paintFibSpiral(ctx, pts);
  else if (kind === "fibarcs") paintFibArcs(ctx, pts);
  else if (kind === "fibwedge") paintFibWedge(ctx, pts);
  else if (kind === "gannfan") paintGannFan(ctx, pts, rect);
  else if (kind === "gannbox" || kind === "gannsquare" || kind === "gannsquarefixed") paintGannBox(ctx, pts, kind);
  else if (kind === "pitchfork" || kind === "schiff" || kind === "modschiff" || kind === "insidepitchfork" || kind === "pitchfan")
    paintPitchfork(ctx, pts, rect, kind);
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
  else if (kind === "rect" || kind === "datepricerange" || kind === "barspattern" || kind === "measure")
    paintBox(ctx, d, pts, rect, precision, bars);
  else if (kind === "rotatedrect" && pts.length >= 3) paintRotatedRect(ctx, pts);
  else if (kind === "ellipse" && pts.length >= 2) paintEllipse(ctx, pts, false);
  else if (kind === "circle" && pts.length >= 2) paintEllipse(ctx, pts, true);
  else if (kind === "triangle" && pts.length >= 3) paintPoly(ctx, pts, true, `${d.color}18`);
  else if (kind === "arc" && pts.length >= 2) paintArc(ctx, pts);
  else if (kind === "curve" && pts.length >= 3) paintCurve(ctx, pts, false);
  else if (kind === "doublecurve" && pts.length >= 4) paintCurve(ctx, pts, true);
  else if (kind === "path" || kind === "polyline" || kind === "brush" || kind === "highlighter") paintFree(ctx, pts, kind);
  else if (kind === "long" || kind === "short") paintPosition(ctx, d, pts, precision);
  else if (kind === "pricerange" && pts.length >= 2) paintPriceRange(ctx, d, pts, rect, precision);
  else if (kind === "daterange" && pts.length >= 2) paintDateRange(ctx, pts, rect);
  else if (kind === "forecast" || kind === "projection" || kind === "ghostfeed") paintForecast(ctx, pts, kind);
  else if (kind === "anchoredvwap") paintAnchoredVwap(ctx, pts[0], rect, bars, yOfPrice);
  else if (kind === "volprofile" || kind === "anchoredvolprofile") paintVolProfile(ctx, pts, rect, bars, kind === "anchoredvolprofile");
  else if (kind === "text" || kind === "anchoredtext" || kind === "note" || kind === "signpost" || kind === "pricelabel" || kind === "pricenote")
    paintLabel(ctx, d, pts[0], precision);
  else if (kind === "callout" || kind === "comment") paintCallout(ctx, d, pts);
  else if (kind === "arrowmarker" || kind === "arrowup" || kind === "arrowdown") paintArrowMark(ctx, pts[0], kind);
  else if (kind === "flagmark" || kind === "sticker") {
    ctx.font = kind === "sticker" ? "20px sans-serif" : CHART_FONT_BOLD;
    ctx.fillText(d.text || (kind === "flagmark" ? "⚑" : "★"), pts[0].x - 6, pts[0].y + 6);
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
    paintPattern(ctx, pts, kind);
  else if (kind === "cycliclines" || kind === "timecycles") paintCycles(ctx, pts, rect, kind === "timecycles");
  else if (kind === "sineline" && pts.length >= 2) paintSine(ctx, pts, rect);
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
  if ((kind === "gannbox" || kind === "rect" || kind === "measure" || kind === "datepricerange" || kind === "barspattern") && pts.length >= 2) {
    const x0 = Math.min(pts[0].x, pts[1].x);
    const y0 = Math.min(pts[0].y, pts[1].y);
    const x1 = Math.max(pts[0].x, pts[1].x);
    const y1 = Math.max(pts[0].y, pts[1].y);
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

function extend(ctx: CanvasRenderingContext2D, a: Pt, b: Pt, rect: ViewRect, left: boolean, right: boolean): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const reach = Math.hypot(rect.w, rect.h) * 2;
  const s = left ? { x: a.x - ux * reach, y: a.y - uy * reach } : a;
  const e = right ? { x: b.x + ux * reach, y: b.y + uy * reach } : b;
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

function paintFibChannel(ctx: CanvasRenderingContext2D, pts: Pt[], rect: ViewRect, selected: boolean): void {
  if (pts.length < 2) return;
  const a = pts[0];
  const b = pts[1];
  const c = pts[2];
  const ox = c ? c.x - a.x : 0;
  const oy = c ? c.y - a.y : (b.y - a.y) * 0.25;
  ctx.save();
  ctx.setLineDash([4, 3]);
  ctx.strokeStyle = selected ? "#2962ff" : "#5b9cf6";
  stroke(ctx, a, b);
  ctx.restore();
  for (const lvl of FAN_RATIOS) {
    const p = { x: a.x + ox * lvl, y: a.y + oy * lvl };
    const q = { x: b.x + ox * lvl, y: b.y + oy * lvl };
    ctx.strokeStyle = FIB_RETRACE[Math.min(FIB_RETRACE.length - 1, Math.round(lvl * 6))].color;
    extend(ctx, p, q, rect, false, true);
  }
}

function paintFibTimeZone(ctx: CanvasRenderingContext2D, pts: Pt[], rect: ViewRect): void {
  if (pts.length < 2) return;
  const unit = pts[1].x - pts[0].x || 1;
  ctx.font = AXIS_FONT;
  FIB_TIME.forEach((n, i) => {
    const x = pts[0].x + unit * n;
    ctx.strokeStyle = FIB_RETRACE[i % FIB_RETRACE.length].color;
    stroke(ctx, { x, y: rect.y }, { x, y: rect.y + rect.h });
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fillText(String(n), x + 4, rect.y + 14);
  });
}

function paintFibFan(ctx: CanvasRenderingContext2D, pts: Pt[], rect: ViewRect): void {
  if (pts.length < 2) return;
  const a = pts[0];
  const b = pts[1];
  FAN_RATIOS.forEach((lvl, i) => {
    ctx.strokeStyle = FIB_RETRACE[i % FIB_RETRACE.length].color;
    extend(ctx, a, { x: b.x, y: a.y + (b.y - a.y) * lvl }, rect, false, true);
    extend(ctx, a, { x: a.x + (b.x - a.x) * lvl, y: b.y }, rect, false, true);
  });
}

function paintFibTime(ctx: CanvasRenderingContext2D, pts: Pt[], rect: ViewRect): void {
  if (pts.length < 2) return;
  const a = pts[0];
  const b = pts[1];
  const c = pts[2] ?? b;
  const unit = b.x - a.x || 1;
  [0, 0.382, 0.618, 1, 1.272, 1.618, 2.618].forEach((lvl, i) => {
    const x = c.x + unit * lvl;
    ctx.strokeStyle = FIB_RETRACE[i % FIB_RETRACE.length].color;
    stroke(ctx, { x, y: rect.y }, { x, y: rect.y + rect.h });
    ctx.fillStyle = ctx.strokeStyle;
    ctx.font = AXIS_FONT;
    ctx.fillText(lvl.toFixed(3), x + 4, rect.y + 14);
  });
}

function paintFibCircles(ctx: CanvasRenderingContext2D, pts: Pt[]): void {
  if (pts.length < 2) return;
  const r = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
  FAN_RATIOS.filter((v) => v > 0).concat([1.618, 2.618]).forEach((lvl, i) => {
    ctx.strokeStyle = FIB_RETRACE[i % FIB_RETRACE.length].color;
    ctx.beginPath();
    ctx.arc(pts[0].x, pts[0].y, r * lvl, 0, Math.PI * 2);
    ctx.stroke();
  });
}

function paintFibSpiral(ctx: CanvasRenderingContext2D, pts: Pt[]): void {
  if (pts.length < 2) return;
  const a = pts[0];
  const b = pts[1];
  const r0 = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const ang0 = Math.atan2(b.y - a.y, b.x - a.x);
  const phi = Math.log(1.618) / (Math.PI / 2);
  ctx.beginPath();
  for (let i = 0; i <= 360; i++) {
    const t = (i / 360) * Math.PI * 3.5;
    const r = r0 * Math.exp(phi * t);
    const x = a.x + r * Math.cos(ang0 + t);
    const y = a.y + r * Math.sin(ang0 + t);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function paintFibArcs(ctx: CanvasRenderingContext2D, pts: Pt[]): void {
  if (pts.length < 2) return;
  const r = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
  const ang = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
  FAN_RATIOS.filter((v) => v > 0).forEach((lvl, i) => {
    ctx.strokeStyle = FIB_RETRACE[i % FIB_RETRACE.length].color;
    ctx.beginPath();
    ctx.arc(pts[0].x, pts[0].y, r * lvl, ang - Math.PI / 2, ang + Math.PI / 2);
    ctx.stroke();
  });
}

function paintFibWedge(ctx: CanvasRenderingContext2D, pts: Pt[]): void {
  if (pts.length < 2) return;
  const o = pts[0];
  const a = pts[1];
  const b = pts[2] ?? { x: a.x, y: o.y };
  FAN_RATIOS.forEach((lvl, i) => {
    ctx.strokeStyle = FIB_RETRACE[i % FIB_RETRACE.length].color;
    stroke(ctx, o, { x: a.x + (b.x - a.x) * lvl, y: a.y + (b.y - a.y) * lvl });
  });
}

function paintGannFan(ctx: CanvasRenderingContext2D, pts: Pt[], rect: ViewRect): void {
  if (pts.length < 2) return;
  const dx = pts[1].x - pts[0].x;
  const dy = pts[1].y - pts[0].y;
  ctx.font = AXIS_FONT;
  GANN_RATIOS.forEach((r, i) => {
    ctx.strokeStyle = i === 4 ? "#f23645" : "#787b86";
    ctx.lineWidth = i === 4 ? 1.6 : 1;
    extend(ctx, pts[0], { x: pts[0].x + dx, y: pts[0].y + dy * r }, rect, false, true);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fillText(GANN_LABELS[i], pts[0].x + dx * 0.55, pts[0].y + dy * r * 0.55);
  });
}

function paintGannBox(ctx: CanvasRenderingContext2D, pts: Pt[], kind: DrawingKind): void {
  if (pts.length < 2) return;
  let x0 = Math.min(pts[0].x, pts[1].x);
  let y0 = Math.min(pts[0].y, pts[1].y);
  let w = Math.abs(pts[1].x - pts[0].x);
  let h = Math.abs(pts[1].y - pts[0].y);
  if (kind !== "gannbox") {
    const s = kind === "gannsquarefixed" ? Math.min(w, h) || 80 : Math.max(w, h) || 80;
    w = s;
    h = s;
    if (pts[1].x < pts[0].x) x0 = pts[0].x - s;
    else x0 = pts[0].x;
    if (pts[1].y < pts[0].y) y0 = pts[0].y - s;
    else y0 = pts[0].y;
  }
  ctx.strokeStyle = "#787b86";
  ctx.strokeRect(x0, y0, w, h);
  ctx.strokeStyle = "rgba(120,123,134,0.55)";
  for (const r of BOX_RATIOS) {
    stroke(ctx, { x: x0 + w * r, y: y0 }, { x: x0 + w * r, y: y0 + h });
    stroke(ctx, { x: x0, y: y0 + h * r }, { x: x0 + w, y: y0 + h * r });
  }
  ctx.strokeStyle = "#f23645";
  stroke(ctx, { x: x0, y: y0 + h }, { x: x0 + w, y: y0 });
  stroke(ctx, { x: x0, y: y0 }, { x: x0 + w, y: y0 + h });
}

function pitchOrigin(kind: DrawingKind, p1: Pt, p2: Pt, p3: Pt): Pt {
  const mid = { x: (p2.x + p3.x) / 2, y: (p2.y + p3.y) / 2 };
  if (kind === "schiff") return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  if (kind === "modschiff") return { x: p1.x, y: (p1.y + p2.y) / 2 };
  if (kind === "insidepitchfork") return { x: (p1.x + mid.x) / 2, y: (p1.y + mid.y) / 2 };
  return p1;
}

function paintPitchfork(ctx: CanvasRenderingContext2D, pts: Pt[], rect: ViewRect, kind: DrawingKind): void {
  if (pts.length < 3) {
    if (pts.length >= 2) stroke(ctx, pts[0], pts[1]);
    return;
  }
  const [p1, p2, p3] = pts;
  const mid = { x: (p2.x + p3.x) / 2, y: (p2.y + p3.y) / 2 };
  const o = pitchOrigin(kind, p1, p2, p3);
  const dx = mid.x - o.x;
  const dy = mid.y - o.y;
  ctx.strokeStyle = "#2962ff";
  extend(ctx, o, mid, rect, true, true);
  ctx.strokeStyle = "#26a69a";
  extend(ctx, p2, { x: p2.x + dx, y: p2.y + dy }, rect, false, true);
  ctx.strokeStyle = "#ef5350";
  extend(ctx, p3, { x: p3.x + dx, y: p3.y + dy }, rect, false, true);
  stroke(ctx, p2, p3);
  if (kind === "pitchfan") {
    FAN_RATIOS.forEach((lvl) => {
      const s = { x: p2.x + (p3.x - p2.x) * lvl, y: p2.y + (p3.y - p2.y) * lvl };
      ctx.strokeStyle = "rgba(209,212,220,0.45)";
      extend(ctx, o, s, rect, false, true);
    });
  } else {
    [0.25, 0.5, 0.75].forEach((lvl) => {
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = "rgba(120,123,134,0.7)";
      const a = { x: p2.x + (mid.x - p2.x) * lvl, y: p2.y + (mid.y - p2.y) * lvl };
      const b = { x: p3.x + (mid.x - p3.x) * lvl, y: p3.y + (mid.y - p3.y) * lvl };
      extend(ctx, a, { x: a.x + dx, y: a.y + dy }, rect, false, true);
      extend(ctx, b, { x: b.x + dx, y: b.y + dy }, rect, false, true);
      ctx.setLineDash([]);
    });
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

function paintBox(ctx: CanvasRenderingContext2D, d: Drawing, pts: Pt[], _rect: ViewRect, precision: number, bars: Bar[]): void {
  if (pts.length < 2) return;
  const x = Math.min(pts[0].x, pts[1].x);
  const y = Math.min(pts[0].y, pts[1].y);
  const w = Math.abs(pts[1].x - pts[0].x);
  const h = Math.abs(pts[1].y - pts[0].y);
  ctx.fillStyle = `${d.color}22`;
  ctx.fillRect(x, y, w, h);
  ctx.strokeRect(x, y, w, h);
  if (d.kind === "measure" || d.kind === "datepricerange") {
    const dp = d.points[1].price - d.points[0].price;
    const pct = (dp / d.points[0].price) * 100;
    const n = bars.filter((b) => b.time >= Math.min(d.points[0].time, d.points[1].time) && b.time <= Math.max(d.points[0].time, d.points[1].time)).length;
    ctx.font = CHART_FONT_BOLD;
    ctx.fillStyle = "#d1d4dc";
    ctx.fillText(`${n} bars   ${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%   ${formatPrice(dp, precision)}`, x + 8, y + 16);
  }
}

function paintRotatedRect(ctx: CanvasRenderingContext2D, pts: Pt[]): void {
  const [a, b, c] = pts;
  const ox = c.x - a.x;
  const oy = c.y - a.y;
  paintPoly(ctx, [a, b, { x: b.x + ox, y: b.y + oy }, { x: a.x + ox, y: a.y + oy }], true, "rgba(41,98,255,0.12)");
}

function paintEllipse(ctx: CanvasRenderingContext2D, pts: Pt[], circle: boolean): void {
  const cx = (pts[0].x + pts[1].x) / 2;
  const cy = (pts[0].y + pts[1].y) / 2;
  let rx = Math.abs(pts[1].x - pts[0].x) / 2;
  let ry = Math.abs(pts[1].y - pts[0].y) / 2;
  if (circle) rx = ry = Math.max(rx, ry);
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx || 1, ry || 1, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "rgba(41,98,255,0.08)";
  ctx.fill();
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

function paintArc(ctx: CanvasRenderingContext2D, pts: Pt[]): void {
  const r = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
  const ang = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
  ctx.beginPath();
  ctx.arc(pts[0].x, pts[0].y, r, ang - 0.9, ang + 0.9);
  ctx.stroke();
}

function paintCurve(ctx: CanvasRenderingContext2D, pts: Pt[], cubic: boolean): void {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  if (cubic && pts.length >= 4) ctx.bezierCurveTo(pts[1].x, pts[1].y, pts[2].x, pts[2].y, pts[3].x, pts[3].y);
  else ctx.quadraticCurveTo(pts[1].x, pts[1].y, pts[2].x, pts[2].y);
  ctx.stroke();
}

function paintFree(ctx: CanvasRenderingContext2D, pts: Pt[], kind: DrawingKind): void {
  if (pts.length < 2) return;
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  if (kind === "highlighter") {
    ctx.lineWidth = 12;
    ctx.globalAlpha = 0.28;
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function paintPosition(ctx: CanvasRenderingContext2D, d: Drawing, pts: Pt[], precision: number): void {
  if (!pts[0]) return;
  const entry = pts[0];
  const tp = pts[1] ?? { x: entry.x + 120, y: entry.y - (d.kind === "long" ? 50 : -50) };
  const sl = pts[2] ?? { x: entry.x + 120, y: entry.y + (d.kind === "long" ? 30 : -30) };
  const w = Math.max(96, Math.abs((tp.x || entry.x) - entry.x) + 80);
  const long = d.kind === "long";
  ctx.fillStyle = long ? "rgba(8,153,129,0.18)" : "rgba(242,54,69,0.18)";
  ctx.fillRect(entry.x, Math.min(entry.y, tp.y), w, Math.abs(tp.y - entry.y) || 1);
  ctx.fillStyle = long ? "rgba(242,54,69,0.18)" : "rgba(8,153,129,0.18)";
  ctx.fillRect(entry.x, Math.min(entry.y, sl.y), w, Math.abs(sl.y - entry.y) || 1);
  ctx.strokeStyle = "#d1d4dc";
  stroke(ctx, { x: entry.x, y: entry.y }, { x: entry.x + w, y: entry.y });
  ctx.font = CHART_FONT;
  const tpP = d.points[1]?.price ?? entry.y;
  const slP = d.points[2]?.price ?? entry.y;
  const eP = d.points[0].price;
  const reward = Math.abs(tpP - eP);
  const risk = Math.abs(slP - eP) || 1;
  ctx.fillStyle = "#d1d4dc";
  ctx.fillText(`Target ${formatPrice(tpP, precision)}`, entry.x + 8, Math.min(entry.y, tp.y) + 14);
  ctx.fillText(`Stop ${formatPrice(slP, precision)}  RR ${(reward / risk).toFixed(2)}`, entry.x + 8, Math.max(entry.y, sl.y) - 8);
}

function paintPriceRange(ctx: CanvasRenderingContext2D, d: Drawing, pts: Pt[], rect: ViewRect, precision: number): void {
  const top = Math.min(pts[0].y, pts[1].y);
  const bot = Math.max(pts[0].y, pts[1].y);
  ctx.fillStyle = `${d.color}18`;
  ctx.fillRect(rect.x, top, rect.w, bot - top);
  stroke(ctx, { x: rect.x, y: pts[0].y }, { x: rect.x + rect.w, y: pts[0].y });
  stroke(ctx, { x: rect.x, y: pts[1].y }, { x: rect.x + rect.w, y: pts[1].y });
  const dp = d.points[1].price - d.points[0].price;
  const pct = (dp / d.points[0].price) * 100;
  ctx.font = CHART_FONT_BOLD;
  ctx.fillStyle = d.color;
  ctx.fillText(`${formatPrice(dp, precision)}  (${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%)`, rect.x + 10, (top + bot) / 2);
}

function paintDateRange(ctx: CanvasRenderingContext2D, pts: Pt[], rect: ViewRect): void {
  const left = Math.min(pts[0].x, pts[1].x);
  const right = Math.max(pts[0].x, pts[1].x);
  ctx.fillStyle = "rgba(41,98,255,0.10)";
  ctx.fillRect(left, rect.y, right - left, rect.h);
  stroke(ctx, { x: pts[0].x, y: rect.y }, { x: pts[0].x, y: rect.y + rect.h });
  stroke(ctx, { x: pts[1].x, y: rect.y }, { x: pts[1].x, y: rect.y + rect.h });
}

function paintForecast(ctx: CanvasRenderingContext2D, pts: Pt[], kind: DrawingKind): void {
  if (pts.length < 2) return;
  if (kind === "ghostfeed") {
    ctx.setLineDash([2, 4]);
    stroke(ctx, pts[0], pts[1]);
    ctx.setLineDash([]);
    return;
  }
  extend(ctx, pts[0], pts[1], { x: 0, y: 0, w: 4000, h: 4000 }, false, true);
  if (pts[2]) {
    ctx.setLineDash([5, 4]);
    stroke(ctx, pts[1], pts[2]);
    ctx.setLineDash([]);
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

function paintVolProfile(ctx: CanvasRenderingContext2D, pts: Pt[], rect: ViewRect, bars: Bar[], anchored: boolean): void {
  if (!bars.length || !pts[0]) return;
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
  const bins = 24;
  const vol = new Array(bins).fill(0);
  for (const b of subset) {
    const idx = Math.min(bins - 1, Math.floor(((b.close - lo) / (hi - lo || 1)) * bins));
    vol[idx] += b.volume;
  }
  const max = Math.max(...vol, 1);
  const width = Math.min(120, (x1 - x0) * 0.45);
  vol.forEach((v, i) => {
    const y1 = rect.y + rect.h * (1 - i / bins);
    const y0 = rect.y + rect.h * (1 - (i + 1) / bins);
    ctx.fillStyle = "rgba(41,98,255,0.28)";
    ctx.fillRect(x0, y0, (v / max) * width, y1 - y0);
  });
}

function paintLabel(ctx: CanvasRenderingContext2D, d: Drawing, p: Pt, precision: number): void {
  const price = formatPrice(d.points[0].price, precision);
  if (d.kind === "pricelabel") {
    ctx.fillStyle = "#2962ff";
    ctx.fillRect(p.x + 6, p.y - 10, 72, 18);
    ctx.fillStyle = "#fff";
    ctx.font = CHART_FONT;
    ctx.fillText(price, p.x + 10, p.y + 3);
    return;
  }
  if (d.kind === "note") {
    ctx.fillStyle = "#f9a825";
    ctx.fillRect(p.x, p.y, 120, 48);
    ctx.fillStyle = "#131722";
    ctx.font = CHART_FONT;
    ctx.fillText(d.text || "Note", p.x + 8, p.y + 20);
    return;
  }
  if (d.kind === "signpost") {
    stroke(ctx, p, { x: p.x, y: p.y - 28 });
    ctx.fillStyle = "#2962ff";
    ctx.fillRect(p.x, p.y - 46, 86, 20);
    ctx.fillStyle = "#fff";
    ctx.font = CHART_FONT;
    ctx.fillText(d.text || "Signpost", p.x + 6, p.y - 32);
    return;
  }
  ctx.font = CHART_FONT_BOLD;
  ctx.fillText(d.kind === "pricenote" ? `${d.text || "Note"}  ${price}` : d.text || "Text", p.x + 4, p.y - 4);
}

function paintCallout(ctx: CanvasRenderingContext2D, d: Drawing, pts: Pt[]): void {
  const a = pts[0];
  const b = pts[1] ?? { x: a.x + 90, y: a.y - 36 };
  stroke(ctx, a, b);
  ctx.fillStyle = "#1e222d";
  ctx.strokeStyle = d.color;
  ctx.fillRect(b.x, b.y - 16, 110, 28);
  ctx.strokeRect(b.x, b.y - 16, 110, 28);
  ctx.fillStyle = "#d1d4dc";
  ctx.font = CHART_FONT;
  ctx.fillText(d.text || "Callout", b.x + 8, b.y + 3);
}

function paintArrowMark(ctx: CanvasRenderingContext2D, p: Pt, kind: DrawingKind): void {
  const up = kind !== "arrowdown";
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(p.x - 7, p.y + (up ? 14 : -14));
  ctx.lineTo(p.x + 7, p.y + (up ? 14 : -14));
  ctx.closePath();
  ctx.fillStyle = up ? "#089981" : "#f23645";
  ctx.fill();
}

function paintPattern(ctx: CanvasRenderingContext2D, pts: Pt[], kind: DrawingKind): void {
  if (pts.length < 2) return;
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.stroke();
  const labels =
    kind === "abcd"
      ? ["A", "B", "C", "D"]
      : kind.startsWith("elliott")
        ? kind === "elliottimpulse"
          ? ["0", "1", "2", "3", "4", "5"]
          : kind === "elliottcorrection"
            ? ["0", "A", "B", "C"]
            : kind === "elliotttriangle"
              ? ["A", "B", "C", "D", "E"]
              : kind === "elliottdouble"
                ? ["W", "X", "Y"]
                : ["W", "X", "Y", "X", "Z"]
        : kind === "headshoulders"
          ? ["LS", "N", "H", "N", "RS"]
          : kind === "threedrives"
            ? ["0", "1", "2", "3", "4", "5", "6"]
            : ["X", "A", "B", "C", "D"];
  ctx.font = CHART_FONT_BOLD;
  pts.forEach((p, i) => {
    ctx.fillStyle = "#2962ff";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#d1d4dc";
    ctx.fillText(labels[i] ?? String(i), p.x + 6, p.y - 6);
  });
}

function paintCycles(ctx: CanvasRenderingContext2D, pts: Pt[], rect: ViewRect, showInterval: boolean): void {
  if (pts.length < 2) return;
  const unit = pts[1].x - pts[0].x || 40;
  for (let i = 0; i < 18; i++) {
    const x = pts[0].x + unit * i;
    ctx.strokeStyle = i === 0 || i === 1 ? "#2962ff" : "rgba(120,123,134,0.7)";
    stroke(ctx, { x, y: rect.y }, { x, y: rect.y + rect.h });
    if (showInterval && i > 0) {
      ctx.fillStyle = "#787b86";
      ctx.font = AXIS_FONT;
      ctx.fillText(String(i), x + 3, rect.y + 12);
    }
  }
}

function paintSine(ctx: CanvasRenderingContext2D, pts: Pt[], rect: ViewRect): void {
  const amp = pts[1].y - pts[0].y;
  const len = Math.abs(pts[1].x - pts[0].x) || 80;
  ctx.beginPath();
  for (let x = pts[0].x; x < rect.x + rect.w; x += 2) {
    const y = pts[0].y + amp * Math.sin(((x - pts[0].x) / len) * Math.PI * 2);
    if (x === pts[0].x) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}
