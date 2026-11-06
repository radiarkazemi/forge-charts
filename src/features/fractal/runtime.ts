/**
 * Fractal (igor-T) — Chart Champions Williams-style swing markers.
 *
 * Swing high: centre bar high beats `periods` bars on each side → green ↓ arrow.
 * Swing low:  centre bar low  beats `periods` bars on each side → red ↑ arrow.
 * Confirmed only after the right-side bars have closed (no live-edge repaint).
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

export interface FractalInputs {
  readonly periods: number;
  readonly showHighs: boolean;
  readonly showLows: boolean;
  readonly highColor: string;
  readonly lowColor: string;
  readonly maxMarkers: number;
}

export const FRACTAL_DEFAULTS: FractalInputs = {
  periods: 2,
  showHighs: true,
  showLows: true,
  highColor: "#26a69a",
  lowColor: "#ef5350",
  maxMarkers: 250,
};

export type FractalKind = "high" | "low";

export interface FractalMarker {
  readonly kind: FractalKind;
  readonly time: number;
  readonly price: number;
}

export interface FractalDrawCmd {
  readonly kind: "arrow";
  readonly dir: 1 | -1;
  readonly t1: number;
  readonly p1: number;
  readonly color: string;
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
    if (isHigh) out.push({ kind: "high", time: mid.time, price: mid.high });
    if (isLow) out.push({ kind: "low", time: mid.time, price: mid.low });
  }
  return out;
}

export function fractalDrawCmds(
  markers: readonly FractalMarker[],
  inputs: FractalInputs,
): FractalDrawCmd[] {
  const cmds: FractalDrawCmd[] = [];
  for (const m of markers) {
    if (m.kind === "high" && inputs.showHighs) {
      cmds.push({
        kind: "arrow",
        dir: -1,
        t1: m.time,
        p1: m.price,
        color: inputs.highColor,
      });
    } else if (m.kind === "low" && inputs.showLows) {
      cmds.push({
        kind: "arrow",
        dir: 1,
        t1: m.time,
        p1: m.price,
        color: inputs.lowColor,
      });
    }
  }
  const cap = Math.max(20, Math.min(500, Math.floor(inputs.maxMarkers)));
  return cmds.length > cap ? cmds.slice(-cap) : cmds;
}

export function computeFractal(
  bars: readonly FractalBar[],
  inputs: FractalInputs,
): FractalDrawCmd[] {
  return fractalDrawCmds(detectFractals(bars, inputs.periods), inputs);
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
      const id = await chart.createShape(
        { time: cmd.t1 as never, price: cmd.p1 },
        {
          ...common,
          shape: (cmd.dir === 1 ? "arrow_up" : "arrow_down") as never,
          text: " ",
          overrides: {
            color: cmd.color,
            fontsize: 12,
          },
        },
      );
      if (id) ids.push(id);
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
