/**
 * BOS+ / BOS− / MSS+ / MSS− structure marker — multi-scale (minor → major).
 *
 * Smart mode runs several pivot widths at once (default 2,5,10,20,30) so a
 * 5-candle BOS and a 30-candle BOS both show — same idea as Dealing Ranges
 * stacking chart TF + HTF structure.
 *
 * Visual: solid horizontal line swing → break, label centered on the line.
 */

import type { EntityId, IChartWidgetApi } from "@/infrastructure/tradingview";
import {
  bosEventDedupeKey,
  DEFAULT_STRUCTURE_SCALES,
  resolveStructureScales,
  scaleFontSize,
  scaleLineWidth,
  scaleStrength,
} from "@/features/chart/structure-scales";

export interface BosMssBar {
  readonly time: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume?: number;
}

export type BosMssKind = "BOS+" | "BOS-" | "MSS+" | "MSS-";

export interface BosMssInputs {
  readonly leftBars: number;
  readonly rightBars: number;
  /** true = break on wick; false = break on close */
  readonly breakOnWick: boolean;
  /** Run all scale tiers at once (minor → major). */
  readonly smartScales: boolean;
  /** Comma list of pivot widths, e.g. "2,5,10,20,30". */
  readonly scalesText: string;
  readonly showBosPlus: boolean;
  readonly showBosMinus: boolean;
  readonly showMssPlus: boolean;
  readonly showMssMinus: boolean;
  readonly showLines: boolean;
  readonly showLabels: boolean;
  readonly bosPlusLabel: string;
  readonly bosMinusLabel: string;
  readonly mssPlusLabel: string;
  readonly mssMinusLabel: string;
  readonly bosPlusColor: string;
  readonly bosMinusColor: string;
  readonly mssPlusColor: string;
  readonly mssMinusColor: string;
  readonly lineWidth: number;
  /** 0 solid · 1 dotted · 2 dashed */
  readonly bosLineStyle: number;
  readonly mssLineStyle: number;
  readonly fontSize: number;
  readonly maxEvents: number;
}

export const BOS_MSS_DEFAULTS: BosMssInputs = {
  leftBars: 2,
  rightBars: 2,
  breakOnWick: false,
  smartScales: true,
  scalesText: DEFAULT_STRUCTURE_SCALES.join(","),
  showBosPlus: true,
  showBosMinus: true,
  showMssPlus: true,
  showMssMinus: true,
  showLines: true,
  showLabels: true,
  bosPlusLabel: "BOS+",
  bosMinusLabel: "BOS-",
  mssPlusLabel: "MSS+",
  mssMinusLabel: "MSS-",
  bosPlusColor: "#2962FF",
  bosMinusColor: "#E53935",
  mssPlusColor: "#00BCD4",
  mssMinusColor: "#FF9800",
  lineWidth: 1,
  bosLineStyle: 0,
  mssLineStyle: 0,
  fontSize: 12,
  maxEvents: 180,
};

export interface BosMssEvent {
  readonly kind: BosMssKind;
  readonly t1: number;
  readonly t2: number;
  readonly price: number;
  /** Pivot width used (bars each side). */
  readonly scale: number;
}

export interface BosMssDrawCmd {
  readonly kind: "segment";
  readonly t1: number;
  readonly p1: number;
  readonly t2: number;
  readonly p2: number;
  readonly color: string;
  readonly width: number;
  readonly style: number;
  readonly text?: string;
  readonly fontSize: number;
  readonly scale: number;
}

function pivotHigh(
  bars: readonly BosMssBar[],
  i: number,
  left: number,
  right: number,
): number | null {
  const mid = i - right;
  if (mid < left || i >= bars.length) return null;
  const h = bars[mid]!.high;
  for (let j = mid - left; j <= mid + right; j += 1) {
    if (j === mid) continue;
    if (bars[j]!.high >= h) return null;
  }
  return h;
}

function pivotLow(
  bars: readonly BosMssBar[],
  i: number,
  left: number,
  right: number,
): number | null {
  const mid = i - right;
  if (mid < left || i >= bars.length) return null;
  const l = bars[mid]!.low;
  for (let j = mid - left; j <= mid + right; j += 1) {
    if (j === mid) continue;
    if (bars[j]!.low <= l) return null;
  }
  return l;
}

/** Single-scale detector (internal). */
export function detectBosMssAtScale(
  bars: readonly BosMssBar[],
  leftBars: number,
  rightBars: number,
  breakOnWick: boolean,
  scale: number,
): BosMssEvent[] {
  const left = Math.max(1, Math.min(50, Math.floor(leftBars)));
  const right = Math.max(1, Math.min(50, Math.floor(rightBars)));
  const events: BosMssEvent[] = [];
  if (bars.length < left + right + 3) return events;

  let lastSH: number | null = null;
  let lastSHBar: number | null = null;
  let lastSL: number | null = null;
  let lastSLBar: number | null = null;
  let brokenSHBar: number | null = null;
  let brokenSLBar: number | null = null;
  let structureDir = 0;

  for (let i = 0; i < bars.length; i += 1) {
    const bar = bars[i]!;
    const ph = pivotHigh(bars, i, left, right);
    const pl = pivotLow(bars, i, left, right);
    if (ph != null) {
      lastSH = ph;
      lastSHBar = i - right;
    }
    if (pl != null) {
      lastSL = pl;
      lastSLBar = i - right;
    }

    const useHigh = breakOnWick ? bar.high : bar.close;
    const useLow = breakOnWick ? bar.low : bar.close;
    const preStructure = structureDir;

    const bullBreak =
      lastSH != null &&
      lastSHBar != null &&
      useHigh > lastSH &&
      (brokenSHBar == null || brokenSHBar !== lastSHBar);
    const bearBreak =
      lastSL != null &&
      lastSLBar != null &&
      useLow < lastSL &&
      (brokenSLBar == null || brokenSLBar !== lastSLBar);

    if (bullBreak && lastSH != null && lastSHBar != null) {
      const kind: BosMssKind = preStructure === -1 ? "MSS+" : "BOS+";
      events.push({
        kind,
        t1: bars[lastSHBar]!.time,
        t2: bar.time,
        price: lastSH,
        scale,
      });
      brokenSHBar = lastSHBar;
      structureDir = 1;
    }

    if (bearBreak && lastSL != null && lastSLBar != null) {
      const kind: BosMssKind = preStructure === 1 ? "MSS-" : "BOS-";
      events.push({
        kind,
        t1: bars[lastSLBar]!.time,
        t2: bar.time,
        price: lastSL,
        scale,
      });
      brokenSLBar = lastSLBar;
      structureDir = -1;
    }
  }

  return events;
}

/**
 * Multi-scale detector — merges minor→major, keeps largest scale on exact dupes.
 */
export function detectBosMss(
  bars: readonly BosMssBar[],
  inputs: BosMssInputs,
): BosMssEvent[] {
  const scales = resolveStructureScales({
    smartScales: inputs.smartScales,
    scalesText: inputs.scalesText,
    single: Math.max(inputs.leftBars, inputs.rightBars),
  });
  const byKey = new Map<string, BosMssEvent>();
  for (const scale of scales) {
    // Each tier uses equal left/right = scale (classic symmetric pivots).
    const tier = detectBosMssAtScale(bars, scale, scale, inputs.breakOnWick, scale);
    for (const ev of tier) {
      const key = bosEventDedupeKey(ev);
      const prev = byKey.get(key);
      if (!prev || ev.scale > prev.scale) byKey.set(key, ev);
    }
  }
  return [...byKey.values()].sort((a, b) => a.t2 - b.t2 || a.scale - b.scale);
}

function kindEnabled(kind: BosMssKind, inputs: BosMssInputs): boolean {
  if (kind === "BOS+") return inputs.showBosPlus;
  if (kind === "BOS-") return inputs.showBosMinus;
  if (kind === "MSS+") return inputs.showMssPlus;
  return inputs.showMssMinus;
}

function kindColor(kind: BosMssKind, inputs: BosMssInputs): string {
  if (kind === "BOS+") return inputs.bosPlusColor;
  if (kind === "BOS-") return inputs.bosMinusColor;
  if (kind === "MSS+") return inputs.mssPlusColor;
  return inputs.mssMinusColor;
}

function kindLabel(kind: BosMssKind, inputs: BosMssInputs): string {
  if (kind === "BOS+") return inputs.bosPlusLabel || "BOS+";
  if (kind === "BOS-") return inputs.bosMinusLabel || "BOS-";
  if (kind === "MSS+") return inputs.mssPlusLabel || "MSS+";
  return inputs.mssMinusLabel || "MSS-";
}

function kindLineStyle(kind: BosMssKind, inputs: BosMssInputs): number {
  return kind.startsWith("MSS") ? inputs.mssLineStyle : inputs.bosLineStyle;
}

export function bosMssDrawCmds(
  events: readonly BosMssEvent[],
  inputs: BosMssInputs,
): BosMssDrawCmd[] {
  const cmds: BosMssDrawCmd[] = [];
  const scales = resolveStructureScales({
    smartScales: inputs.smartScales,
    scalesText: inputs.scalesText,
    single: Math.max(inputs.leftBars, inputs.rightBars),
  });
  const baseFont = Math.max(8, Math.min(24, Math.floor(inputs.fontSize)));
  const baseWidth = Math.max(1, Math.min(4, Math.floor(inputs.lineWidth)));

  for (const ev of events) {
    if (!kindEnabled(ev.kind, inputs)) continue;
    if (!inputs.showLines && !inputs.showLabels) continue;
    const color = kindColor(ev.kind, inputs);
    const strength = scaleStrength(ev.scale, scales);
    cmds.push({
      kind: "segment",
      t1: ev.t1,
      p1: ev.price,
      t2: ev.t2,
      p2: ev.price,
      color,
      width: inputs.showLines ? scaleLineWidth(baseWidth, strength) : 1,
      style: Math.max(0, Math.min(2, Math.floor(kindLineStyle(ev.kind, inputs)))),
      text: inputs.showLabels ? kindLabel(ev.kind, inputs) : undefined,
      fontSize: scaleFontSize(baseFont, strength),
      scale: ev.scale,
    });
  }

  const cap = Math.max(10, Math.min(500, Math.floor(inputs.maxEvents)));
  return cmds.length > cap ? cmds.slice(-cap) : cmds;
}

export function computeBosMss(
  bars: readonly BosMssBar[],
  inputs: BosMssInputs,
): BosMssDrawCmd[] {
  const events = detectBosMss(bars, inputs);
  const capped =
    events.length > inputs.maxEvents ? events.slice(-inputs.maxEvents) : events;
  return bosMssDrawCmds(capped, inputs);
}

const LINE_STYLES = [0, 1, 2] as const;

export async function paintBosMss(
  chart: IChartWidgetApi,
  cmds: readonly BosMssDrawCmd[],
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
      const label = (cmd.text ?? "").trim();
      const id = await chart.createMultipointShape(
        [
          { time: cmd.t1 as never, price: cmd.p1 },
          { time: cmd.t2 as never, price: cmd.p2 },
        ],
        {
          ...common,
          shape: "trend_line",
          text: label,
          overrides: {
            linecolor: cmd.color,
            linewidth: Math.max(1, cmd.width || 1),
            linestyle: LINE_STYLES[cmd.style] ?? 0,
            showLabel: label.length > 0,
            text: label,
            textcolor: cmd.color,
            fontsize: cmd.fontSize,
            bold: true,
            horzLabelsAlign: "center",
            vertLabelsAlign: "middle",
            showPrice: false,
            extendLeft: false,
            extendRight: false,
          },
        },
      );
      if (id) ids.push(id);
    } catch {
      /* skip */
    }
    if (i > 0 && i % 6 === 0) {
      await new Promise<void>((r) => {
        window.setTimeout(r, 0);
      });
    }
  }
  return ids;
}
