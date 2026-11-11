/**
 * Order block + CISD (change in the state of delivery).
 *
 * A delivery is a run of candles closing the same way. The order block is the
 * last meaningful candle of that run — an up candle before a bearish shift, a
 * down candle before a bullish shift. Its open is the CISD level.
 *
 * The zone prints when the new delivery *closes* through that open. One candle
 * can do it, or the next few, as long as delivery stays in the new direction.
 * A wick through the open does not count. The box is that candle's high–low,
 * extended until a close through the far side: soft fill, dotted border, dashed
 * line on the open. Bullish and bearish use the same rule.
 */

import type { EntityId, IChartWidgetApi } from "@/infrastructure/tradingview";

export interface ObCisdBar {
  readonly time: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
}

export interface ObCisdInputs {
  /** Minimum same-direction candles before a CISD can print. */
  readonly minSeries: number;
  /** Confirming candle body must be at least this multiple of ATR. */
  readonly displacement: number;
  /** The delivery's high–low must be at least this multiple of ATR. */
  readonly seriesAtr: number;
  readonly showBull: boolean;
  readonly showBear: boolean;
  readonly showMitigated: boolean;
  /** How many bar-widths an active zone projects past the last candle. */
  readonly projectBars: number;
  readonly maxZones: number;
  readonly bullColor: string;
  readonly bearColor: string;
  readonly lineWidth: number;
}

export const OB_CISD_DEFAULTS: ObCisdInputs = {
  minSeries: 2,
  displacement: 0.35,
  seriesAtr: 0.55,
  showBull: true,
  showBear: true,
  showMitigated: false,
  projectBars: 12,
  maxZones: 6,
  bullColor: "#26A69A",
  bearColor: "#42A5F5",
  lineWidth: 1,
};

export interface ObCisdZone {
  /** 1 = bullish order block (demand), -1 = bearish (supply). */
  readonly dir: 1 | -1;
  readonly t0: number;
  readonly t1: number;
  readonly hi: number;
  readonly lo: number;
  /** Open of the order-block candle — the level the close went through. */
  readonly cisd: number;
  readonly mitigated: boolean;
}

interface Series {
  dir: 1 | -1;
  start: number;
  last: number;
  count: number;
  hi: number;
  lo: number;
}

/** Bars the new delivery may take to close through the order-block open. */
const CONFIRM_WINDOW = 8;

interface Pending {
  /** Direction of the delivery being invalidated. */
  leg: 1 | -1;
  obIndex: number;
  cisd: number;
  hi: number;
  lo: number;
  count: number;
  rangeHi: number;
  rangeLo: number;
  born: number;
}

interface MutableZone {
  dir: 1 | -1;
  t0: number;
  obIndex: number;
  confirmIndex: number;
  hi: number;
  lo: number;
  cisd: number;
  mitigated: boolean;
  mitIndex: number;
}

function computeAtr(bars: readonly ObCisdBar[], length: number): number[] {
  const out = new Array<number>(bars.length).fill(0);
  let sum = 0;
  for (let i = 0; i < bars.length; i += 1) {
    const bar = bars[i]!;
    const prevClose = i > 0 ? bars[i - 1]!.close : bar.close;
    const tr = Math.max(bar.high - bar.low, Math.abs(bar.high - prevClose), Math.abs(bar.low - prevClose));
    sum += tr;
    if (i >= length) {
      const old = bars[i - length]!;
      const oldPrev = i - length > 0 ? bars[i - length - 1]!.close : old.close;
      sum -= Math.max(old.high - old.low, Math.abs(old.high - oldPrev), Math.abs(old.low - oldPrev));
    }
    const n = Math.min(i + 1, length);
    out[i] = sum / n;
  }
  return out;
}

function atrFloor(atr: number, price: number): number {
  const basis = Math.abs(price) * 1e-5;
  return atr > basis ? atr : basis;
}

export function detectOrderBlockCisd(
  bars: readonly ObCisdBar[],
  inputs: ObCisdInputs,
): ObCisdZone[] {
  if (bars.length < 5) return [];
  const atrs = computeAtr(bars, 14);
  const zones: MutableZone[] = [];
  let series: Series | null = null;
  let pending: Pending | null = null;

  const candleDir = (bar: ObCisdBar): 1 | -1 | 0 =>
    bar.close > bar.open ? 1 : bar.close < bar.open ? -1 : 0;

  /** Last candle of the run with a real body. Falls back to the final candle. */
  const orderBlockIndex = (run: Series): number => {
    for (let i = run.last; i >= run.start; i -= 1) {
      const bar = bars[i]!;
      if (candleDir(bar) !== run.dir) continue;
      const atr = atrFloor(atrs[i] ?? 0, bar.close);
      if (Math.abs(bar.close - bar.open) >= atr * Math.min(0.25, inputs.displacement)) return i;
    }
    return run.last;
  };

  const pushZone = (shift: Pending, confirmIndex: number) => {
    const ob = bars[shift.obIndex]!;
    const confirm = bars[confirmIndex]!;
    const atr = atrFloor(atrs[confirmIndex] ?? 0, confirm.close);
    const dir: 1 | -1 = shift.leg === 1 ? -1 : 1;
    for (let z = zones.length - 1; z >= 0; z -= 1) {
      const prev = zones[z]!;
      if (prev.mitigated || prev.dir !== dir) continue;
      if (Math.abs(prev.cisd - shift.cisd) <= atr * 0.2) return;
    }
    zones.push({
      dir,
      t0: ob.time,
      obIndex: shift.obIndex,
      confirmIndex,
      hi: shift.hi,
      lo: shift.lo,
      cisd: shift.cisd,
      mitigated: false,
      mitIndex: -1,
    });
  };

  /**
   * `emit` once the new delivery closes through the open with a real push.
   * `drop` if delivery flips back, the window expires, or the leg was too small.
   * `wait` while the new delivery is still working toward that open.
   */
  const consider = (shift: Pending, index: number): "emit" | "wait" | "drop" => {
    if (index - shift.born >= CONFIRM_WINDOW) return "drop";
    const bar = bars[index]!;
    const dir = candleDir(bar);
    if (dir === shift.leg) return "drop";
    if (shift.leg === 1 && bar.close > shift.hi) return "drop";
    if (shift.leg === -1 && bar.close < shift.lo) return "drop";
    if (shift.count < inputs.minSeries) return "drop";
    const atr = atrFloor(atrs[index] ?? 0, bar.close);
    if (shift.rangeHi - shift.rangeLo < atr * inputs.seriesAtr) return "drop";
    if (dir === 0) return "wait";
    const broke = shift.leg === 1 ? bar.close < shift.cisd : bar.close > shift.cisd;
    if (!broke) return "wait";
    const body = Math.abs(bar.close - bar.open);
    const push = shift.leg === 1 ? shift.rangeHi - bar.close : bar.close - shift.rangeLo;
    if (body < atr * inputs.displacement && push < atr * inputs.displacement) return "wait";
    if (!(shift.hi > shift.lo) || shift.cisd < shift.lo || shift.cisd > shift.hi) return "drop";
    return "emit";
  };

  const arm = (run: Series, index: number) => {
    const obAt = orderBlockIndex(run);
    const ob = bars[obAt]!;
    const shift: Pending = {
      leg: run.dir,
      obIndex: obAt,
      cisd: ob.open,
      hi: ob.high,
      lo: ob.low,
      count: run.count,
      rangeHi: run.hi,
      rangeLo: run.lo,
      born: index,
    };
    const decision = consider(shift, index);
    if (decision === "emit") pushZone(shift, index);
    else if (decision === "wait") pending = shift;
  };

  for (let i = 0; i < bars.length; i += 1) {
    const bar = bars[i]!;
    for (const zone of zones) {
      if (zone.mitigated || i <= zone.confirmIndex) continue;
      // Close through the far side invalidates the block. A wick into it does not.
      if (zone.dir === -1 && bar.close > zone.hi) {
        zone.mitigated = true;
        zone.mitIndex = i;
      } else if (zone.dir === 1 && bar.close < zone.lo) {
        zone.mitigated = true;
        zone.mitIndex = i;
      }
    }

    if (pending) {
      const decision = consider(pending, i);
      if (decision === "emit") {
        pushZone(pending, i);
        pending = null;
      } else if (decision === "drop") pending = null;
    }

    const dir = candleDir(bar);
    if (dir === 0) {
      if (series) {
        series.hi = Math.max(series.hi, bar.high);
        series.lo = Math.min(series.lo, bar.low);
      }
      continue;
    }

    if (!series || series.dir !== dir) {
      if (series && dir === -series.dir) arm(series, i);
      series = {
        dir,
        start: i,
        last: i,
        count: 1,
        hi: bar.high,
        lo: bar.low,
      };
      continue;
    }

    series.last = i;
    series.count += 1;
    series.hi = Math.max(series.hi, bar.high);
    series.lo = Math.min(series.lo, bar.low);
  }

  const last = bars[bars.length - 1]!;
  const prev = bars[bars.length - 2]!;
  const step = Math.max(1, last.time - prev.time);
  const projected = last.time + step * Math.max(1, inputs.projectBars);

  const visible = zones.filter((zone) => {
    if (zone.dir === 1 && !inputs.showBull) return false;
    if (zone.dir === -1 && !inputs.showBear) return false;
    if (zone.mitigated && !inputs.showMitigated) return false;
    return zone.hi > zone.lo;
  });

  const ranked = visible.slice().sort((a, b) => {
    if (a.mitigated !== b.mitigated) return a.mitigated ? 1 : -1;
    return b.confirmIndex - a.confirmIndex;
  });
  // Cap each side on its own so a run of bearish shifts cannot hide every bullish block.
  const limit = Math.max(1, inputs.maxZones);
  const capped = [
    ...ranked.filter((zone) => zone.dir === 1).slice(0, limit),
    ...ranked.filter((zone) => zone.dir === -1).slice(0, limit),
  ];

  return capped
    .map((zone) => ({
      dir: zone.dir,
      t0: zone.t0,
      t1: zone.mitigated && zone.mitIndex >= 0 ? bars[zone.mitIndex]!.time : projected,
      hi: zone.hi,
      lo: zone.lo,
      cisd: zone.cisd,
      mitigated: zone.mitigated,
    }))
    .filter((zone) => zone.t1 > zone.t0)
    .sort((a, b) => a.t0 - b.t0);
}

export type ObCisdDrawCmd =
  | {
      readonly kind: "rect";
      readonly t1: number;
      readonly p1: number;
      readonly t2: number;
      readonly p2: number;
      readonly color: string;
      readonly transparency: number;
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

export function orderBlockCisdDrawCmds(
  zones: readonly ObCisdZone[],
  inputs: ObCisdInputs,
): ObCisdDrawCmd[] {
  const cmds: ObCisdDrawCmd[] = [];
  for (const zone of zones) {
    const color = zone.dir === 1 ? inputs.bullColor : inputs.bearColor;
    cmds.push({
      kind: "rect",
      t1: zone.t0,
      p1: zone.hi,
      t2: zone.t1,
      p2: zone.lo,
      color,
      transparency: zone.mitigated ? 90 : 78,
    });
    cmds.push({
      kind: "line",
      t1: zone.t0,
      p1: zone.cisd,
      t2: zone.t1,
      p2: zone.cisd,
      color,
      width: inputs.lineWidth,
    });
  }
  return cmds;
}

export function computeOrderBlockCisd(
  bars: readonly ObCisdBar[],
  inputs: ObCisdInputs,
): ObCisdDrawCmd[] {
  return orderBlockCisdDrawCmds(detectOrderBlockCisd(bars, inputs), inputs);
}

const LINE_STYLES = [0, 1, 2] as const;

export async function paintOrderBlockCisd(
  chart: IChartWidgetApi,
  cmds: readonly ObCisdDrawCmd[],
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
