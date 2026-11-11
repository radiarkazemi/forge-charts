/**
 * Inversion fair value gap (IFVG) and balanced price range (BPR).
 *
 * A fair value gap is the untraded space between candle 1 and candle 3.
 * It inverts only when a later candle *closes* through the far side of that
 * gap — a wick is not enough. The box is the original gap, with a dashed
 * line on its midpoint (consequent encroachment).
 *
 * A BPR is the price overlap of a bullish gap and a bearish gap. The box is
 * only that shared slice, from the bar the second gap formed.
 */

import type { EntityId, IChartWidgetApi } from "@/infrastructure/tradingview";

export interface IfvgBar {
  readonly time: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
}

export interface IfvgBprInputs {
  /** Gap must be at least this multiple of ATR. */
  readonly minGapAtr: number;
  /** Middle candle body must be at least this multiple of ATR. */
  readonly displacement: number;
  readonly showBull: boolean;
  readonly showBear: boolean;
  readonly showBpr: boolean;
  readonly showMitigated: boolean;
  readonly projectBars: number;
  readonly maxZones: number;
  readonly bullColor: string;
  readonly bearColor: string;
  readonly bprColor: string;
  readonly lineWidth: number;
}

export const IFVG_BPR_DEFAULTS: IfvgBprInputs = {
  minGapAtr: 0.15,
  displacement: 0.3,
  showBull: true,
  showBear: true,
  showBpr: true,
  showMitigated: false,
  projectBars: 12,
  maxZones: 8,
  bullColor: "#26C6DA",
  bearColor: "#EC407A",
  bprColor: "#FFB300",
  lineWidth: 1,
};

export interface IfvgBprZone {
  readonly kind: "ifvg" | "bpr";
  /** 1 = bullish IFVG (demand after a bearish gap inverts). BPR is 0-direction via kind. */
  readonly dir: 1 | -1;
  readonly t0: number;
  readonly t1: number;
  readonly hi: number;
  readonly lo: number;
  readonly mid: number;
  readonly mitigated: boolean;
}

interface Gap {
  dir: 1 | -1;
  i0: number;
  i2: number;
  lo: number;
  hi: number;
  inverted: boolean;
  /** Direction after inversion. */
  invDir: 1 | -1;
  invertAt: number;
  mitigated: boolean;
  mitAt: number;
  paired: boolean;
}

function computeAtr(bars: readonly IfvgBar[], length: number): number[] {
  const out = new Array<number>(bars.length).fill(0);
  let sum = 0;
  for (let i = 0; i < bars.length; i += 1) {
    const bar = bars[i]!;
    const prevClose = i > 0 ? bars[i - 1]!.close : bar.close;
    const tr = Math.max(
      bar.high - bar.low,
      Math.abs(bar.high - prevClose),
      Math.abs(bar.low - prevClose),
    );
    sum += tr;
    if (i >= length) {
      const old = bars[i - length]!;
      const oldPrev = i - length > 0 ? bars[i - length - 1]!.close : old.close;
      sum -= Math.max(
        old.high - old.low,
        Math.abs(old.high - oldPrev),
        Math.abs(old.low - oldPrev),
      );
    }
    out[i] = sum / Math.min(i + 1, length);
  }
  return out;
}

function atrFloor(atr: number, price: number): number {
  const basis = Math.abs(price) * 1e-5;
  return atr > basis ? atr : basis;
}

export function detectIfvgBpr(bars: readonly IfvgBar[], inputs: IfvgBprInputs): IfvgBprZone[] {
  if (bars.length < 8) return [];
  const atrs = computeAtr(bars, 14);
  const gaps: Gap[] = [];

  for (let i = 2; i < bars.length; i += 1) {
    const b0 = bars[i - 2]!;
    const mid = bars[i - 1]!;
    const b2 = bars[i]!;
    const atr = atrFloor(atrs[i] ?? 0, b2.close);
    const body = Math.abs(mid.close - mid.open);
    if (body < atr * inputs.displacement) continue;

    // Bullish gap: candle 3's low is above candle 1's high.
    if (b2.low - b0.high >= atr * inputs.minGapAtr) {
      gaps.push({
        dir: 1,
        i0: i - 2,
        i2: i,
        lo: b0.high,
        hi: b2.low,
        inverted: false,
        invDir: -1,
        invertAt: -1,
        mitigated: false,
        mitAt: -1,
        paired: false,
      });
    }
    // Bearish gap: candle 3's high is below candle 1's low.
    if (b0.low - b2.high >= atr * inputs.minGapAtr) {
      gaps.push({
        dir: -1,
        i0: i - 2,
        i2: i,
        lo: b2.high,
        hi: b0.low,
        inverted: false,
        invDir: 1,
        invertAt: -1,
        mitigated: false,
        mitAt: -1,
        paired: false,
      });
    }
  }

  // Keep the recent gaps. Older ones cannot still be the active inversion.
  const recent = gaps.length > 80 ? gaps.slice(-80) : gaps;

  for (let i = 0; i < bars.length; i += 1) {
    const close = bars[i]!.close;
    for (const gap of recent) {
      if (i <= gap.i2) continue;
      if (!gap.inverted) {
        // Close through the far side flips the gap. A wick does not.
        if (gap.dir === 1 && close < gap.lo) {
          gap.inverted = true;
          gap.invDir = -1;
          gap.invertAt = i;
        } else if (gap.dir === -1 && close > gap.hi) {
          gap.inverted = true;
          gap.invDir = 1;
          gap.invertAt = i;
        }
      } else if (!gap.mitigated && i > gap.invertAt) {
        if (gap.invDir === -1 && close > gap.hi) {
          gap.mitigated = true;
          gap.mitAt = i;
        } else if (gap.invDir === 1 && close < gap.lo) {
          gap.mitigated = true;
          gap.mitAt = i;
        }
      }
    }
  }

  const last = bars[bars.length - 1]!;
  const prev = bars[bars.length - 2]!;
  const step = Math.max(1, last.time - prev.time);
  const projected = last.time + step * Math.max(1, inputs.projectBars);
  const endTime = (index: number, mitigated: boolean) =>
    mitigated && index >= 0 ? bars[index]!.time : projected;

  const zones: IfvgBprZone[] = [];

  for (const gap of recent) {
    if (!gap.inverted) continue;
    if (gap.mitigated && !inputs.showMitigated) continue;
    if (gap.invDir === 1 && !inputs.showBull) continue;
    if (gap.invDir === -1 && !inputs.showBear) continue;
    const t0 = bars[gap.i0]!.time;
    const t1 = endTime(gap.mitAt, gap.mitigated);
    if (!(t1 > t0) || !(gap.hi > gap.lo)) continue;
    zones.push({
      kind: "ifvg",
      dir: gap.invDir,
      t0,
      t1,
      hi: gap.hi,
      lo: gap.lo,
      mid: (gap.hi + gap.lo) / 2,
      mitigated: gap.mitigated,
    });
  }

  if (inputs.showBpr) {
    // Newest gap claims the nearest older opposite gap, so the latest balance wins.
    for (let i = recent.length - 1; i >= 0; i -= 1) {
      const gap = recent[i]!;
      if (gap.paired) continue;
      let partner: Gap | null = null;
      for (let j = i - 1; j >= 0; j -= 1) {
        const older = recent[j]!;
        if (older.dir === gap.dir || older.paired) continue;
        if (gap.i2 - older.i2 > 80) break;
        const lo = Math.max(gap.lo, older.lo);
        const hi = Math.min(gap.hi, older.hi);
        const atr = atrFloor(atrs[gap.i2] ?? 0, bars[gap.i2]!.close);
        if (hi - lo < atr * Math.max(0.05, inputs.minGapAtr * 0.5)) continue;
        partner = older;
        break;
      }
      if (!partner) continue;
      gap.paired = true;
      partner.paired = true;
      const lo = Math.max(gap.lo, partner.lo);
      const hi = Math.min(gap.hi, partner.hi);
      let mitigated = false;
      let mitAt = -1;
      for (let k = gap.i2 + 1; k < bars.length; k += 1) {
        const close = bars[k]!.close;
        if (close > hi || close < lo) {
          mitigated = true;
          mitAt = k;
          break;
        }
      }
      if (mitigated && !inputs.showMitigated) continue;
      const t0 = bars[gap.i2]!.time;
      const t1 = endTime(mitAt, mitigated);
      if (!(t1 > t0)) continue;
      zones.push({
        kind: "bpr",
        dir: gap.dir,
        t0,
        t1,
        hi,
        lo,
        mid: (hi + lo) / 2,
        mitigated,
      });
    }
  }

  const ranked = zones.slice().sort((a, b) => {
    if (a.mitigated !== b.mitigated) return a.mitigated ? 1 : -1;
    return b.t0 - a.t0;
  });
  return ranked.slice(0, Math.max(1, inputs.maxZones)).sort((a, b) => a.t0 - b.t0);
}

export type IfvgDrawCmd =
  | {
      readonly kind: "rect";
      readonly t1: number;
      readonly p1: number;
      readonly t2: number;
      readonly p2: number;
      readonly color: string;
      readonly transparency: number;
      readonly layer: "ifvg" | "bpr";
    }
  | {
      readonly kind: "line";
      readonly t1: number;
      readonly p1: number;
      readonly t2: number;
      readonly p2: number;
      readonly color: string;
      readonly width: number;
    };

export function ifvgBprDrawCmds(zones: readonly IfvgBprZone[], inputs: IfvgBprInputs): IfvgDrawCmd[] {
  const rects: IfvgDrawCmd[] = [];
  const lines: IfvgDrawCmd[] = [];
  const ordered = [...zones.filter((z) => z.kind === "ifvg"), ...zones.filter((z) => z.kind === "bpr")];
  for (const zone of ordered) {
    const color =
      zone.kind === "bpr" ? inputs.bprColor : zone.dir === 1 ? inputs.bullColor : inputs.bearColor;
    rects.push({
      kind: "rect",
      t1: zone.t0,
      p1: zone.hi,
      t2: zone.t1,
      p2: zone.lo,
      color,
      transparency: zone.mitigated ? 90 : zone.kind === "bpr" ? 68 : 78,
      layer: zone.kind,
    });
    lines.push({
      kind: "line",
      t1: zone.t0,
      p1: zone.mid,
      t2: zone.t1,
      p2: zone.mid,
      color,
      width: inputs.lineWidth,
    });
  }
  return [...rects, ...lines];
}

export function computeIfvgBpr(bars: readonly IfvgBar[], inputs: IfvgBprInputs): IfvgDrawCmd[] {
  return ifvgBprDrawCmds(detectIfvgBpr(bars, inputs), inputs);
}

const LINE_STYLES = [0, 1, 2] as const;

export async function paintIfvgBpr(
  chart: IChartWidgetApi,
  cmds: readonly IfvgDrawCmd[],
  options?: { readonly ownerStudyId?: EntityId },
): Promise<EntityId[]> {
  const ids: EntityId[] = [];
  const common = {
    lock: true,
    disableSelection: true,
    disableSave: true,
    disableUndo: true,
    showInObjectsTree: false,
    ...(options?.ownerStudyId ? { ownerStudyId: options.ownerStudyId } : {}),
  } as const;

  for (const cmd of cmds) {
    try {
      if (cmd.kind === "rect") {
        const id = await chart.createMultipointShape(
          [
            { time: cmd.t1 as never, price: cmd.p1 },
            { time: cmd.t2 as never, price: cmd.p2 },
          ],
          {
            ...common,
            zOrder: "bottom",
            shape: "rectangle",
            overrides: {
              color: cmd.color,
              linecolor: cmd.color,
              backgroundColor: cmd.color,
              fillBackground: true,
              filled: true,
              linewidth: 1,
              linestyle: LINE_STYLES[1],
              transparency: cmd.transparency,
            },
          },
        );
        if (id) ids.push(id);
      } else {
        const id = await chart.createMultipointShape(
          [
            { time: cmd.t1 as never, price: cmd.p1 },
            { time: cmd.t2 as never, price: cmd.p2 },
          ],
          {
            ...common,
            shape: "trend_line",
            overrides: {
              linecolor: cmd.color,
              linewidth: Math.max(1, cmd.width || 1),
              linestyle: LINE_STYLES[2],
              showLabel: false,
              text: "",
            },
          },
        );
        if (id) ids.push(id);
      }
    } catch {
      /* one shape failing should not drop the rest of the zone */
    }
  }
  return ids;
}
