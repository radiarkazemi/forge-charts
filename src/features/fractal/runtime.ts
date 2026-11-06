/**
 * Fractal (igor-T) — Chart Champions Williams-style swing markers.
 *
 * Swing high: centre bar high beats `periods` bars on each side.
 * Swing low:  centre bar low  beats `periods` bars on each side.
 * Confirmed only after the right-side bars have closed (no live-edge repaint).
 * Markers support H/L letters and the same display modes as Real Swings.
 */

import type { EntityId, IChartWidgetApi } from "@/infrastructure/tradingview";

/** Minimal OHLC bar (matches chart export / OrcaBar). */
export interface FractalBar {
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
export type FractalDisplayMode = 0 | 1 | 2 | 3 | 4 | 5;

export interface FractalInputs {
  readonly periods: number;
  readonly showHighs: boolean;
  readonly showLows: boolean;
  readonly displayMode: FractalDisplayMode;
  readonly highLabel: string;
  readonly lowLabel: string;
  readonly highColor: string;
  readonly lowColor: string;
  readonly fontSize: number;
  readonly offsetAtr: number;
  readonly atrLen: number;
  readonly maxMarkers: number;
}

export const FRACTAL_DEFAULTS: FractalInputs = {
  periods: 2,
  showHighs: true,
  showLows: true,
  displayMode: 0,
  highLabel: "H",
  lowLabel: "L",
  highColor: "#26a69a",
  lowColor: "#ef5350",
  fontSize: 13,
  offsetAtr: 0.15,
  atrLen: 14,
  maxMarkers: 250,
};

export type FractalKind = "high" | "low";

export interface FractalMarker {
  readonly kind: FractalKind;
  readonly index: number;
  readonly time: number;
  readonly price: number;
}

export type FractalDrawCmd =
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

function atrAt(bars: readonly FractalBar[], i: number, len: number): number {
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

/** Strict Williams fractal (TV / Igor-T / Chart Champions). */
export function detectFractals(
  bars: readonly FractalBar[],
  periods: number,
): FractalMarker[] {
  const n = Math.max(1, Math.min(10, Math.floor(periods)));
  const out: FractalMarker[] = [];
  if (bars.length < n * 2 + 1) return out;

  for (let i = n; i < bars.length - n; i += 1) {
    const mid = bars[i]!;
    let isHigh = true;
    let isLow = true;
    for (let j = 1; j <= n; j += 1) {
      const left = bars[i - j]!;
      const right = bars[i + j]!;
      if (!(mid.high > left.high && mid.high > right.high)) isHigh = false;
      if (!(mid.low < left.low && mid.low < right.low)) isLow = false;
      if (!isHigh && !isLow) break;
    }
    if (isHigh) out.push({ kind: "high", index: i, time: mid.time, price: mid.high });
    if (isLow) out.push({ kind: "low", index: i, time: mid.time, price: mid.low });
  }
  return out;
}

function offsetPrice(
  bars: readonly FractalBar[],
  marker: FractalMarker,
  inputs: FractalInputs,
): number {
  const atr = atrAt(bars, marker.index, inputs.atrLen);
  const off = Math.max(0, inputs.offsetAtr) * atr;
  return marker.kind === "high" ? marker.price + off : marker.price - off;
}

export function fractalDrawCmds(
  bars: readonly FractalBar[],
  markers: readonly FractalMarker[],
  inputs: FractalInputs,
): FractalDrawCmd[] {
  const mode = inputs.displayMode;
  const cmds: FractalDrawCmd[] = [];
  const highText = (inputs.highLabel || "H").slice(0, 8);
  const lowText = (inputs.lowLabel || "L").slice(0, 8);
  const fontSize = Math.max(8, Math.min(28, Math.floor(inputs.fontSize)));

  for (const m of markers) {
    if (m.kind === "high" && !inputs.showHighs) continue;
    if (m.kind === "low" && !inputs.showLows) continue;

    const price = offsetPrice(bars, m, inputs);
    const color = m.kind === "high" ? inputs.highColor : inputs.lowColor;
    const label = m.kind === "high" ? highText : lowText;
    const dir: 1 | -1 = m.kind === "high" ? -1 : 1;

    if (mode === 1 || mode === 2) {
      cmds.push({ kind: "arrow", dir, t1: m.time, p1: price, color });
    }
    if (mode === 0 || mode === 2 || mode === 5) {
      cmds.push({
        kind: "label",
        t1: m.time,
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
        t1: m.time,
        p1: price,
        text: m.kind === "high" ? "▼" : "▲",
        color,
        fontSize: fontSize + 2,
        badge: false,
      });
    }
    if (mode === 4) {
      cmds.push({ kind: "dot", t1: m.time, p1: price, color, fontSize });
    }
  }

  const cap = Math.max(20, Math.min(500, Math.floor(inputs.maxMarkers)));
  return cmds.length > cap ? cmds.slice(-cap) : cmds;
}

export function computeFractal(
  bars: readonly FractalBar[],
  inputs: FractalInputs,
): FractalDrawCmd[] {
  return fractalDrawCmds(bars, detectFractals(bars, inputs.periods), inputs);
}

export async function paintFractal(
  chart: IChartWidgetApi,
  cmds: readonly FractalDrawCmd[],
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
