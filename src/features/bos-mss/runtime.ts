/**
 * BOS+ / BOS− / MSS+ / MSS− structure marker.
 *
 * Visual style (TV / ICT reference):
 * - Solid horizontal line from swing pivot → break bar
 * - Label (e.g. BOS+) centered on the line in the same color
 *
 * Default ICT-style logic (easy to swap later in `detectBosMss`):
 * - Track confirmed swing high / swing low (left/right bars).
 * - Break above last swing high → bullish event:
 *     prior structure bearish → MSS+  else BOS+
 * - Break below last swing low → bearish event:
 *     prior structure bullish → MSS−  else BOS−
 */

import type { EntityId, IChartWidgetApi } from "@/infrastructure/tradingview";

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
  // Screenshot reference: solid blue BOS+ line + matching text
  bosPlusColor: "#2962FF",
  bosMinusColor: "#E53935",
  mssPlusColor: "#00BCD4",
  mssMinusColor: "#FF9800",
  lineWidth: 1,
  bosLineStyle: 0,
  mssLineStyle: 0,
  fontSize: 12,
  maxEvents: 120,
};

export interface BosMssEvent {
  readonly kind: BosMssKind;
  /** Swing pivot time (line start). */
  readonly t1: number;
  /** Break bar time (line end / label). */
  readonly t2: number;
  readonly price: number;
}

/** One trend-line shape with optional centered label (screenshot style). */
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

/**
 * Core detector — edit this function when customizing BOS/MSS rules later.
 */
export function detectBosMss(
  bars: readonly BosMssBar[],
  inputs: BosMssInputs,
): BosMssEvent[] {
  const left = Math.max(1, Math.min(50, Math.floor(inputs.leftBars)));
  const right = Math.max(1, Math.min(50, Math.floor(inputs.rightBars)));
  const events: BosMssEvent[] = [];
  if (bars.length < left + right + 3) return events;

  let lastSH: number | null = null;
  let lastSHBar: number | null = null;
  let lastSL: number | null = null;
  let lastSLBar: number | null = null;
  let brokenSHBar: number | null = null;
  let brokenSLBar: number | null = null;
  /** 1 bullish structure · -1 bearish · 0 unknown */
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

    const useHigh = inputs.breakOnWick ? bar.high : bar.close;
    const useLow = inputs.breakOnWick ? bar.low : bar.close;
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
      });
      brokenSLBar = lastSLBar;
      structureDir = -1;
    }
  }

  return events;
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
  const fontSize = Math.max(8, Math.min(24, Math.floor(inputs.fontSize)));
  const width = Math.max(1, Math.min(4, Math.floor(inputs.lineWidth)));

  for (const ev of events) {
    if (!kindEnabled(ev.kind, inputs)) continue;
    if (!inputs.showLines && !inputs.showLabels) continue;
    const color = kindColor(ev.kind, inputs);
    cmds.push({
      kind: "segment",
      t1: ev.t1,
      p1: ev.price,
      t2: ev.t2,
      p2: ev.price,
      color,
      width: inputs.showLines ? width : 0,
      style: Math.max(0, Math.min(2, Math.floor(kindLineStyle(ev.kind, inputs)))),
      text: inputs.showLabels ? kindLabel(ev.kind, inputs) : undefined,
      fontSize,
    });
  }

  const cap = Math.max(10, Math.min(400, Math.floor(inputs.maxEvents)));
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

const LINE_STYLES = [0, 1, 2] as const; // solid, dotted, dashed (CL)

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
            // Screenshot: label centered on the line, same color, no badge
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
