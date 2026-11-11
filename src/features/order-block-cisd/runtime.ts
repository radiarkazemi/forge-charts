/**
 * Order block + CISD (change in the state of delivery).
 *
 * A delivery is a run of candles closing the same way. The order block is the
 * candle that printed the extreme of that run (highest high of an up-delivery,
 * lowest low of a down-delivery). Its open is the CISD level.
 *
 * The level prints only when an opposite candle *closes* through that open,
 * after a real push (series range and confirming body both vs ATR). The box is
 * that candle's high–low, extended forward until a close through the far side.
 * Drawing matches the sample: soft fill, dotted border, dashed line on the open.
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
  /** Index of the candle that owns the extreme and the CISD open. */
  extreme: number;
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

  const tryEmit = (run: Series, confirmIndex: number) => {
    const ob = bars[run.extreme]!;
    const confirm = bars[confirmIndex]!;
    const atr = atrFloor(atrs[confirmIndex] ?? 0, confirm.close);
    const body = Math.abs(confirm.close - confirm.open);
    if (body < atr * inputs.displacement) return;
    if (run.hi - run.lo < atr * inputs.seriesAtr) return;
    if (run.count < inputs.minSeries) return;
    const cisd = ob.open;
    const broke = run.dir === 1 ? confirm.close < cisd : confirm.close > cisd;
    if (!broke) return;
    if (!(ob.high > ob.low) || cisd < ob.low || cisd > ob.high) return;

    const dir: 1 | -1 = run.dir === 1 ? -1 : 1;
    // A new zone on top of a live one at the same price is the same level.
    for (let z = zones.length - 1; z >= 0; z -= 1) {
      const prev = zones[z]!;
      if (prev.mitigated || prev.dir !== dir) continue;
      if (Math.abs(prev.cisd - cisd) <= atr * 0.2) return;
    }
    zones.push({
      dir,
      t0: ob.time,
      obIndex: run.extreme,
      confirmIndex,
      hi: ob.high,
      lo: ob.low,
      cisd,
      mitigated: false,
      mitIndex: -1,
    });
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

    const dir: 1 | -1 | 0 = bar.close > bar.open ? 1 : bar.close < bar.open ? -1 : 0;
    if (dir === 0) continue;

    if (!series || series.dir !== dir) {
      if (series && dir === -series.dir) tryEmit(series, i);
      series = {
        dir,
        start: i,
        last: i,
        count: 1,
        hi: bar.high,
        lo: bar.low,
        extreme: i,
      };
      continue;
    }

    series.last = i;
    series.count += 1;
    series.hi = Math.max(series.hi, bar.high);
    series.lo = Math.min(series.lo, bar.low);
    const extreme = bars[series.extreme]!;
    if (dir === 1 && bar.high >= extreme.high) series.extreme = i;
    if (dir === -1 && bar.low <= extreme.low) series.extreme = i;
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
  const capped = ranked.slice(0, Math.max(1, inputs.maxZones));

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
