/**
 * Real Swing High / Swing Low — confirmed structural pivots with styleable markers.
 *
 * A Real Swing High is a bar whose high is strictly above `leftBars` bars to the
 * left and `rightBars` bars to the right (same for lows). Optional zigzag filter
 * keeps only alternating H→L→H structure so noise fractals drop out.
 */

import type { EntityId, IChartWidgetApi } from "@/infrastructure/tradingview";
import {
  DEFAULT_STRUCTURE_SCALES,
  resolveStructureScales,
  scaleFontSize,
  scaleStrength,
} from "@/features/chart/structure-scales";

export interface SwingBar {
  readonly time: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume?: number;
}

/**
 * 0 Letters (H/L)
 * 1 Arrows
 * 2 Letters + arrows
 * 3 Triangles (▲/▼)
 * 4 Dots
 * 5 Badge pills (filled H/L)
 */
export type SwingDisplayMode = 0 | 1 | 2 | 3 | 4 | 5;

export interface RealSwingInputs {
  readonly leftBars: number;
  readonly rightBars: number;
  /** Run all scale tiers at once (minor → major). */
  readonly smartScales: boolean;
  /** Comma list of pivot widths, e.g. "2,5,10,20,30". */
  readonly scalesText: string;
  readonly alternateOnly: boolean;
  readonly minSwingAtr: number;
  readonly atrLen: number;
  readonly showHighs: boolean;
  readonly showLows: boolean;
  readonly displayMode: SwingDisplayMode;
  readonly highLabel: string;
  readonly lowLabel: string;
  readonly highColor: string;
  readonly lowColor: string;
  readonly fontSize: number;
  readonly offsetAtr: number;
  readonly maxMarkers: number;
}

export const REAL_SWING_DEFAULTS: RealSwingInputs = {
  leftBars: 2,
  rightBars: 2,
  smartScales: true,
  scalesText: DEFAULT_STRUCTURE_SCALES.join(","),
  alternateOnly: true,
  minSwingAtr: 0,
  atrLen: 14,
  showHighs: true,
  showLows: true,
  displayMode: 0,
  highLabel: "H",
  lowLabel: "L",
  highColor: "#26a69a",
  lowColor: "#ef5350",
  fontSize: 13,
  offsetAtr: 0.15,
  maxMarkers: 200,
};

export type SwingKind = "high" | "low";

export interface SwingPivot {
  readonly kind: SwingKind;
  readonly index: number;
  readonly time: number;
  readonly price: number;
  /** Pivot width (bars). Larger = more major. */
  readonly scale: number;
}

export type SwingDrawCmd =
  | {
      readonly kind: "arrow";
      readonly dir: 1 | -1;
      readonly t1: number;
      readonly p1: number;
      readonly color: string;
    }
  | {
      readonly kind: "label";
      readonly t1: number;
      readonly p1: number;
      readonly text: string;
      readonly color: string;
      readonly fill?: string;
      readonly fontSize: number;
      readonly badge: boolean;
    }
  | {
      readonly kind: "dot";
      readonly t1: number;
      readonly p1: number;
      readonly color: string;
      readonly fontSize: number;
    };

function atrAt(bars: readonly SwingBar[], i: number, len: number): number {
  const n = Math.max(1, Math.min(100, Math.floor(len)));
  let sum = 0;
  let count = 0;
  for (let k = Math.max(1, i - n + 1); k <= i; k += 1) {
    const cur = bars[k]!;
    const prev = bars[k - 1]!;
    const tr = Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prev.close),
      Math.abs(cur.low - prev.close),
    );
    if (Number.isFinite(tr)) {
      sum += tr;
      count += 1;
    }
  }
  return count > 0 ? sum / count : Math.max(1e-8, bars[i]!.high - bars[i]!.low);
}

/** Raw confirmed pivots at one left/right width (no zigzag / ATR filter). */
export function detectRawSwings(
  bars: readonly SwingBar[],
  leftBars: number,
  rightBars: number,
  scale?: number,
): SwingPivot[] {
  const left = Math.max(1, Math.min(50, Math.floor(leftBars)));
  const right = Math.max(1, Math.min(50, Math.floor(rightBars)));
  const sc = scale ?? Math.max(left, right);
  const out: SwingPivot[] = [];
  if (bars.length < left + right + 1) return out;

  for (let i = left; i < bars.length - right; i += 1) {
    const mid = bars[i]!;
    let isHigh = true;
    let isLow = true;
    for (let j = 1; j <= left; j += 1) {
      const b = bars[i - j]!;
      if (!(mid.high > b.high)) isHigh = false;
      if (!(mid.low < b.low)) isLow = false;
      if (!isHigh && !isLow) break;
    }
    if (isHigh || isLow) {
      for (let j = 1; j <= right; j += 1) {
        const b = bars[i + j]!;
        if (isHigh && !(mid.high > b.high)) isHigh = false;
        if (isLow && !(mid.low < b.low)) isLow = false;
        if (!isHigh && !isLow) break;
      }
    }
    // Prefer a single kind if both fire (rare equal extremes) — keep high.
    if (isHigh) out.push({ kind: "high", index: i, time: mid.time, price: mid.high, scale: sc });
    else if (isLow) out.push({ kind: "low", index: i, time: mid.time, price: mid.low, scale: sc });
  }
  return out;
}

/** Keep only alternating H/L structure (real swings, not every fractal). */
export function alternateSwings(pivots: readonly SwingPivot[]): SwingPivot[] {
  if (pivots.length === 0) return [];
  const out: SwingPivot[] = [];
  for (const p of pivots) {
    const last = out[out.length - 1];
    if (!last) {
      out.push(p);
      continue;
    }
    if (last.kind === p.kind) {
      // Same side — keep the more extreme pivot.
      if (p.kind === "high" && p.price >= last.price) out[out.length - 1] = p;
      if (p.kind === "low" && p.price <= last.price) out[out.length - 1] = p;
      continue;
    }
    out.push(p);
  }
  return out;
}

export function filterByMinSwing(
  bars: readonly SwingBar[],
  pivots: readonly SwingPivot[],
  minSwingAtr: number,
  atrLen: number,
): SwingPivot[] {
  if (!(minSwingAtr > 0) || pivots.length < 2) return [...pivots];
  const out: SwingPivot[] = [pivots[0]!];
  for (let i = 1; i < pivots.length; i += 1) {
    const prev = out[out.length - 1]!;
    const cur = pivots[i]!;
    const atr = atrAt(bars, cur.index, atrLen);
    const move = Math.abs(cur.price - prev.price);
    if (move >= minSwingAtr * atr) out.push(cur);
  }
  return out;
}

export function detectRealSwings(
  bars: readonly SwingBar[],
  inputs: RealSwingInputs,
): SwingPivot[] {
  const scales = resolveStructureScales({
    smartScales: inputs.smartScales,
    scalesText: inputs.scalesText,
    single: Math.max(inputs.leftBars, inputs.rightBars),
  });
  // Per-scale structure, then overlay — same bar keeps the largest scale.
  const byKey = new Map<string, SwingPivot>();
  for (const scale of scales) {
    let tier = detectRawSwings(bars, scale, scale, scale);
    if (inputs.alternateOnly) tier = alternateSwings(tier);
    tier = filterByMinSwing(bars, tier, inputs.minSwingAtr, inputs.atrLen);
    for (const p of tier) {
      const key = `${p.kind}|${p.time}`;
      const prev = byKey.get(key);
      if (!prev || p.scale > prev.scale) byKey.set(key, p);
    }
  }
  const pivots = [...byKey.values()].sort((a, b) => a.index - b.index);
  return pivots.filter((p) => (p.kind === "high" ? inputs.showHighs : inputs.showLows));
}

function offsetPrice(
  bars: readonly SwingBar[],
  pivot: SwingPivot,
  inputs: RealSwingInputs,
): number {
  const atr = atrAt(bars, pivot.index, inputs.atrLen);
  const off = Math.max(0, inputs.offsetAtr) * atr;
  return pivot.kind === "high" ? pivot.price + off : pivot.price - off;
}

export function realSwingDrawCmds(
  bars: readonly SwingBar[],
  pivots: readonly SwingPivot[],
  inputs: RealSwingInputs,
): SwingDrawCmd[] {
  const mode = inputs.displayMode;
  const cmds: SwingDrawCmd[] = [];
  const highText = (inputs.highLabel || "H").slice(0, 8);
  const lowText = (inputs.lowLabel || "L").slice(0, 8);
  const baseFont = Math.max(8, Math.min(28, Math.floor(inputs.fontSize)));
  const scales = resolveStructureScales({
    smartScales: inputs.smartScales,
    scalesText: inputs.scalesText,
    single: Math.max(inputs.leftBars, inputs.rightBars),
  });

  for (const p of pivots) {
    const price = offsetPrice(bars, p, inputs);
    const color = p.kind === "high" ? inputs.highColor : inputs.lowColor;
    const label = p.kind === "high" ? highText : lowText;
    const dir: 1 | -1 = p.kind === "high" ? -1 : 1;
    const fontSize = scaleFontSize(
      baseFont,
      scaleStrength(p.scale ?? Math.max(inputs.leftBars, inputs.rightBars), scales),
    );

    if (mode === 1 || mode === 2) {
      cmds.push({ kind: "arrow", dir, t1: p.time, p1: price, color });
    }
    if (mode === 0 || mode === 2 || mode === 5) {
      cmds.push({
        kind: "label",
        t1: p.time,
        p1: price,
        text: label,
        color: mode === 5 ? "#ffffff" : color,
        fill: mode === 5 ? color : undefined,
        fontSize,
        badge: mode === 5,
      });
    }
    if (mode === 3) {
      cmds.push({
        kind: "label",
        t1: p.time,
        p1: price,
        text: p.kind === "high" ? "▼" : "▲",
        color,
        fontSize: fontSize + 2,
        badge: false,
      });
    }
    if (mode === 4) {
      cmds.push({ kind: "dot", t1: p.time, p1: price, color, fontSize });
    }
  }

  const cap = Math.max(20, Math.min(500, Math.floor(inputs.maxMarkers)));
  return cmds.length > cap ? cmds.slice(-cap) : cmds;
}

export function computeRealSwings(
  bars: readonly SwingBar[],
  inputs: RealSwingInputs,
): SwingDrawCmd[] {
  return realSwingDrawCmds(bars, detectRealSwings(bars, inputs), inputs);
}

export async function paintRealSwings(
  chart: IChartWidgetApi,
  cmds: readonly SwingDrawCmd[],
  options?: { readonly ownerStudyId?: EntityId },
): Promise<EntityId[]> {
  const ids: EntityId[] = [];
  const common = {
    lock: true,
    disableSelection: true,
    disableSave: true,
    disableUndo: true,
    showInObjectsTree: false,
    ownerStudyId: options?.ownerStudyId,
  } as const;

  for (let i = 0; i < cmds.length; i += 1) {
    const cmd = cmds[i]!;
    try {
      if (cmd.kind === "arrow") {
        const id = await chart.createShape(
          { time: cmd.t1 as never, price: cmd.p1 },
          {
            ...common,
            shape: (cmd.dir === 1 ? "arrow_up" : "arrow_down") as never,
            text: " ",
            overrides: { color: cmd.color, fontsize: 12 },
          },
        );
        if (id) ids.push(id);
      } else if (cmd.kind === "label") {
        const text = cmd.badge ? ` ${cmd.text} ` : cmd.text;
        const id = await chart.createShape(
          { time: cmd.t1 as never, price: cmd.p1 },
          {
            ...common,
            shape: "text",
            text,
            overrides: {
              color: cmd.color,
              fontsize: cmd.fontSize,
              bold: true,
              fillBackground: cmd.badge,
              backgroundColor: cmd.fill ?? "rgba(0,0,0,0)",
              drawBorder: false,
              horzLabelsAlign: "center",
              vertLabelsAlign: "middle",
            },
          },
        );
        if (id) ids.push(id);
      } else if (cmd.kind === "dot") {
        const id = await chart.createShape(
          { time: cmd.t1 as never, price: cmd.p1 },
          {
            ...common,
            shape: "text",
            text: "●",
            overrides: {
              color: cmd.color,
              fontsize: cmd.fontSize,
              fillBackground: false,
              drawBorder: false,
            },
          },
        );
        if (id) ids.push(id);
      }
    } catch {
      /* skip */
    }
    if (i > 0 && i % 8 === 0) {
      await new Promise<void>((r) => {
        window.setTimeout(r, 0);
      });
    }
  }
  return ids;
}
