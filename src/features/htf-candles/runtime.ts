/**
 * ICT HTF Candles (Fadi-style) — up to 6 higher-timeframe candle groups
 * drawn to the right of price, with FVG / VI / traces / timers.
 */

import type { EntityId, IChartWidgetApi } from "@/infrastructure/tradingview";
import type { DrawCmd } from "@/features/pine/orca-runtime";
import { clColor } from "@/features/sessions/runtime";

export type HtfPreset = "5" | "15" | "30" | "60" | "240" | "1D" | "1W" | "1M";
export type DailyOpenMode = "exchange" | "midnight" | "830" | "930";

export const HTF_SLOT_COUNT = 6;

export interface HtfSlot {
  readonly enable: boolean;
  readonly htf: HtfPreset;
  readonly candleCount: number;
}

export interface HtfCandlesOptions {
  readonly slots: readonly HtfSlot[];
  /** Max enabled HTF groups to show (1–6), Fadi “Limit to next HTFs only”. */
  readonly limitHtf: number;
  readonly paddingBars: number;
  readonly spacingBars: number;
  /** Gap between HTF groups (bars). */
  readonly groupGapBars: number;
  readonly widthBars: number;
  readonly bullBody: string;
  readonly bearBody: string;
  readonly border: string;
  readonly bullWick: string;
  readonly bearWick: string;
  readonly showFvg: boolean;
  readonly showVi: boolean;
  readonly showTrace: boolean;
  readonly showLabels: boolean;
  readonly showTimer: boolean;
  readonly showHtfName: boolean;
  /** Time or weekday printed on each higher-timeframe candle. */
  readonly showInterval: boolean;
  readonly showGroupBackdrop: boolean;
  readonly dailyOpenMode: DailyOpenMode;
  readonly timezoneOffset: number;
  readonly bodyTransparency: number;
}

/** Defaults match Fadi panel: 15m/30m/1H/4H on, 1D/1W off. */
export const DEFAULT_HTF_SLOTS: readonly HtfSlot[] = [
  { enable: true, htf: "15", candleCount: 20 },
  { enable: true, htf: "30", candleCount: 15 },
  { enable: true, htf: "60", candleCount: 10 },
  { enable: true, htf: "240", candleCount: 7 },
  { enable: false, htf: "1D", candleCount: 10 },
  { enable: false, htf: "1W", candleCount: 10 },
];

export const HTF_CANDLES_DEFAULTS: HtfCandlesOptions = {
  slots: DEFAULT_HTF_SLOTS,
  limitHtf: 6,
  paddingBars: 25,
  spacingBars: 2,
  groupGapBars: 10,
  widthBars: 1,
  bullBody: "#26a69a",
  bearBody: "#ef5350",
  border: "#434651",
  bullWick: "#434651",
  bearWick: "#434651",
  showFvg: true,
  showVi: true,
  showTrace: false,
  showLabels: false,
  // Name above and below each group, with the remaining time in parentheses.
  showTimer: true,
  showHtfName: true,
  showInterval: false,
  showGroupBackdrop: false,
  dailyOpenMode: "midnight",
  timezoneOffset: -4,
  bodyTransparency: 30,
};

export interface HtfBar {
  readonly time: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
}

function htfSeconds(htf: HtfPreset): number {
  switch (htf) {
    case "5":
      return 5 * 60;
    case "15":
      return 15 * 60;
    case "30":
      return 30 * 60;
    case "60":
      return 60 * 60;
    case "240":
      return 240 * 60;
    case "1D":
      return 86_400;
    case "1W":
      return 7 * 86_400;
    case "1M":
      return 30 * 86_400;
    default:
      return 60 * 60;
  }
}

export function htfLabel(htf: HtfPreset): string {
  switch (htf) {
    case "5":
      return "5m";
    case "15":
      return "15m";
    case "30":
      return "30m";
    case "60":
      return "1H";
    case "240":
      return "4H";
    case "1D":
      return "1D";
    case "1W":
      return "1W";
    case "1M":
      return "1M";
    default:
      return String(htf);
  }
}

function localParts(utcSec: number, offsetHours: number): {
  dayKey: number;
  mins: number;
  weekday: number;
} {
  const shifted = utcSec + offsetHours * 3600;
  const daySec = ((shifted % 86_400) + 86_400) % 86_400;
  const mins = Math.floor(daySec / 60);
  const d = new Date(shifted * 1000);
  const dayKey = d.getUTCFullYear() * 10_000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
  return { dayKey, mins, weekday: d.getUTCDay() };
}

function bucketKey(
  utcSec: number,
  htf: HtfPreset,
  dailyOpenMode: DailyOpenMode,
  timezoneOffset: number,
): number {
  const step = htfSeconds(htf);
  if (htf === "1D") {
    const { dayKey, mins } = localParts(utcSec, timezoneOffset);
    if (dailyOpenMode === "exchange") return Math.floor(utcSec / 86_400);
    const openMin =
      dailyOpenMode === "830" ? 8 * 60 + 30 : dailyOpenMode === "930" ? 9 * 60 + 30 : 0;
    return mins < openMin ? dayKey - 1 : dayKey;
  }
  if (htf === "1W") {
    const { dayKey, weekday } = localParts(utcSec, timezoneOffset);
    return dayKey - weekday;
  }
  return Math.floor(utcSec / step) * step;
}

export function aggregateHtfBars(
  bars: readonly HtfBar[],
  htf: HtfPreset,
  dailyOpenMode: DailyOpenMode,
  timezoneOffset: number,
): HtfBar[] {
  if (bars.length === 0) return [];
  const out: HtfBar[] = [];
  let cur: HtfBar | null = null;
  let key = Number.NaN;
  for (const b of bars) {
    const k = bucketKey(b.time, htf, dailyOpenMode, timezoneOffset);
    if (!cur || k !== key) {
      if (cur) out.push(cur);
      key = k;
      cur = {
        time: b.time,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
        volume: b.volume,
      };
    } else {
      cur = {
        time: cur.time,
        open: cur.open,
        high: Math.max(cur.high, b.high),
        low: Math.min(cur.low, b.low),
        close: b.close,
        volume: cur.volume + b.volume,
      };
    }
  }
  if (cur) out.push(cur);
  return out;
}

function withAlpha(color: string, transparency: number): string {
  const hex = clColor(color, "#888888");
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  const a = Math.max(0, Math.min(1, 1 - transparency / 100));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function intervalText(bar: HtfBar, htf: HtfPreset, offsetHours: number): string {
  if (htf === "1W") return "1W";
  if (htf === "1M") return "1M";
  const parts = localParts(bar.time, offsetHours);
  if (htf === "1D") return WEEKDAYS[parts.weekday] ?? "1D";
  const hh = Math.floor(parts.mins / 60);
  const mm = parts.mins % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** A higher timeframe that cannot be built from this chart is hidden. */
function htfFitsChart(htf: HtfPreset, chartSec: number): boolean {
  if (chartSec <= 0) return false;
  const htfSec = htfSeconds(htf);
  if (htfSec <= chartSec) return false;
  if (htf === "1D" || htf === "1W" || htf === "1M") return true;
  return htfSec % chartSec === 0;
}

function remainingClock(htf: HtfPreset, lastBarTime: number, nowMs: number): string {
  const step = htfSeconds(htf);
  const closeAt = (Math.floor(lastBarTime / step) + 1) * step;
  let rem = Math.max(0, closeAt - Math.floor(nowMs / 1000));
  const days = Math.floor(rem / 86_400);
  rem -= days * 86_400;
  const hours = Math.floor(rem / 3600);
  rem -= hours * 3600;
  const mins = Math.floor(rem / 60);
  const secs = rem % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (days > 0) return `${days}D ${pad(hours)}:${pad(mins)}:${pad(secs)}`;
  if (hours > 0) return `${pad(hours)}:${pad(mins)}:${pad(secs)}`;
  return `${pad(mins)}:${pad(secs)}`;
}

/** `(n/a)` off the live bar, otherwise the time left in this higher-timeframe candle. */
export function htfRemainText(htf: HtfPreset, lastBarTime: number, live: boolean, nowMs = Date.now()): string {
  if (!live) return "(n/a)";
  return `(${remainingClock(htf, lastBarTime, nowMs)})`;
}

export interface HtfComputeResult {
  readonly cmds: DrawCmd[];
  /** Chart bars of empty space the groups need to the right of price. */
  readonly rightBars: number;
}

interface PaintedGroup {
  readonly end: number;
  readonly mid: number;
  readonly hi: number;
  readonly lo: number;
  readonly name: string;
  readonly timer: string;
}

const FVG_GRAY = "#9aa0ab";
const LABEL_GRAY = "#787b86";

/** Fair-value and volume gaps, drawn under the bodies so the candles stay in front. */
function paintImbalances(
  cmds: DrawCmd[],
  htfBars: readonly HtfBar[],
  groupOrigin: number,
  width: number,
  stride: number,
  opts: HtfCandlesOptions,
): void {
  const n = htfBars.length;
  const leftOf = (i: number) => groupOrigin + i * stride;
  const rightOf = (i: number) => leftOf(i) + width;

  if (opts.showFvg && n >= 3) {
    for (let i = 0; i <= n - 3; i += 1) {
      const older = htfBars[i]!;
      const newer = htfBars[i + 2]!;
      const olderBody = Math.max(older.open, older.close);
      const olderBodyBot = Math.min(older.open, older.close);
      const newerBody = Math.max(newer.open, newer.close);
      const newerBodyBot = Math.min(newer.open, newer.close);
      const bull =
        newer.low > older.high && newerBodyBot > olderBody;
      const bear =
        newer.high < older.low && newerBody < olderBodyBot;
      if (!bull && !bear) continue;
      const top = bull ? newer.low : older.low;
      const bot = bull ? older.high : newer.high;
      if (top <= bot) continue;
      cmds.push({
        kind: "rect",
        t1: leftOf(i),
        p1: top,
        t2: rightOf(i + 2),
        p2: bot,
        color: FVG_GRAY,
        fill: withAlpha(FVG_GRAY, 78),
        style: "solid",
        width: 1,
        borderWidth: 0,
      });
    }
  }

  if (opts.showVi && n >= 2) {
    for (let i = 0; i <= n - 2; i += 1) {
      const older = htfBars[i]!;
      const newer = htfBars[i + 1]!;
      const olderTop = Math.max(older.open, older.close);
      const olderBot = Math.min(older.open, older.close);
      const newerTop = Math.max(newer.open, newer.close);
      const newerBot = Math.min(newer.open, newer.close);
      let top = 0;
      let bot = 0;
      if (newer.low < older.high && newerBot > olderTop) {
        top = newerBot;
        bot = olderTop;
      } else if (newer.high > older.low && newerTop < olderBot) {
        top = olderBot;
        bot = newerTop;
      } else {
        continue;
      }
      if (top <= bot) continue;
      cmds.push({
        kind: "rect",
        t1: leftOf(i),
        p1: top,
        t2: rightOf(i + 1),
        p2: bot,
        color: "#ef5350",
        fill: withAlpha("#ef5350", 55),
        style: "solid",
        width: 1,
        borderWidth: 0,
      });
    }
  }
}

function paintOneGroup(
  cmds: DrawCmd[],
  htfBars: readonly HtfBar[],
  groupOrigin: number,
  step: number,
  opts: HtfCandlesOptions,
  slot: HtfSlot,
  lastChartTime: number,
  live: boolean,
  nowMs: number,
): PaintedGroup {
  const width = Math.max(1, opts.widthBars) * 2 * step;
  const gap = Math.max(0, opts.spacingBars) * step;
  const stride = width + gap;
  const n = htfBars.length;
  const name = htfLabel(slot.htf);
  const empty: PaintedGroup = {
    end: groupOrigin,
    mid: groupOrigin,
    hi: Number.NaN,
    lo: Number.NaN,
    name,
    timer: "(n/a)",
  };
  if (n === 0) return empty;

  const groupWidth = n * width + Math.max(0, n - 1) * gap;
  const hi = Math.max(...htfBars.map((c) => c.high));
  const lo = Math.min(...htfBars.map((c) => c.low));
  const padY = Math.max((hi - lo) * 0.02, Math.abs(hi) * 1e-5);

  // Soft backdrop behind the group (Fadi grey band).
  if (opts.showGroupBackdrop) {
    cmds.push({
      kind: "rect",
      t1: groupOrigin - step * 0.5,
      p1: hi + padY * 2,
      t2: groupOrigin + groupWidth + step * 0.5,
      p2: lo - padY * 2,
      color: "#787b86",
      fill: withAlpha("#787b86", 92),
      style: "solid",
      width: 1,
    });
  }

  paintImbalances(cmds, htfBars, groupOrigin, width, stride, opts);

  for (let i = 0; i < n; i += 1) {
    const c = htfBars[i]!;
    // Oldest left (near previous group), newest right within the group.
    const tLeft = groupOrigin + i * stride;
    const tRight = tLeft + width;
    const tMid = Math.floor((tLeft + tRight) / 2);
    const bull = c.close >= c.open;
    const bodyColor = bull ? opts.bullBody : opts.bearBody;
    const wickColor = bull ? opts.bullWick : opts.bearWick;
    const top = Math.max(c.open, c.close);
    const bot = Math.min(c.open, c.close);

    cmds.push({
      kind: "line",
      t1: tMid,
      p1: c.high,
      t2: tMid,
      p2: top,
      color: wickColor,
      width: 1,
      style: "solid",
    });
    cmds.push({
      kind: "line",
      t1: tMid,
      p1: bot,
      t2: tMid,
      p2: c.low,
      color: wickColor,
      width: 1,
      style: "solid",
    });

    const bodyTop = top === bot ? top + Math.max(Math.abs(top) * 1e-6, 1e-8) : top;
    const bodyBot = top === bot ? bot - Math.max(Math.abs(bot) * 1e-6, 1e-8) : bot;
    cmds.push({
      kind: "rect",
      t1: tLeft,
      p1: bodyTop,
      t2: tRight,
      p2: bodyBot,
      color: opts.border,
      fill: withAlpha(bodyColor, opts.bodyTransparency),
      style: "solid",
      width: 1,
    });

    if (opts.showLabels) {
      cmds.push({ kind: "label", t1: tRight, p1: c.high, color: bodyColor, text: String(c.high) });
      cmds.push({ kind: "label", t1: tRight, p1: c.low, color: bodyColor, text: String(c.low) });
    }

    if (opts.showInterval) {
      cmds.push({
        kind: "label",
        t1: tMid,
        p1: c.high,
        color: "#787b86",
        text: intervalText(c, slot.htf, opts.timezoneOffset),
      });
    }
  }

  if (opts.showTrace && n > 0) {
    const last = htfBars[n - 1]!;
    const tLeft = groupOrigin + (n - 1) * stride;
    const bull = last.close >= last.open;
    const color = withAlpha(bull ? opts.bullBody : opts.bearBody, 55);
    for (const [price, style] of [
      [last.open, "solid"],
      [last.high, "dotted"],
      [last.low, "dotted"],
      [last.close, "dashed"],
    ] as const) {
      cmds.push({
        kind: "line",
        t1: lastChartTime,
        p1: price,
        t2: tLeft,
        p2: price,
        color,
        width: 1,
        style,
      });
    }
  }

  const mid = Math.floor(groupOrigin + groupWidth / 2);
  return {
    end: groupOrigin + groupWidth,
    mid,
    hi,
    lo,
    name,
    timer: htfRemainText(slot.htf, htfBars[n - 1]!.time, live, nowMs),
  };
}

function pushGroupLabels(cmds: DrawCmd[], groups: readonly PaintedGroup[], opts: HtfCandlesOptions): void {
  const visible = groups.filter((g) => Number.isFinite(g.hi) && Number.isFinite(g.lo));
  if (visible.length === 0) return;
  if (!opts.showHtfName && !opts.showTimer) return;
  const hi = Math.max(...visible.map((g) => g.hi));
  const lo = Math.min(...visible.map((g) => g.lo));
  for (const g of visible) {
    const top: string[] = [];
    const bottom: string[] = [];
    if (opts.showHtfName) top.push(g.name);
    if (opts.showTimer) top.push(g.timer);
    if (opts.showTimer) bottom.push(g.timer);
    if (opts.showHtfName) bottom.push(g.name);
    if (top.length > 0) {
      cmds.push({
        kind: "label",
        t1: g.mid,
        p1: hi,
        color: LABEL_GRAY,
        text: top.join("\n"),
        vAlign: "bottom",
        fontSize: 13,
      });
    }
    if (bottom.length > 0) {
      cmds.push({
        kind: "label",
        t1: g.mid,
        p1: lo,
        color: LABEL_GRAY,
        text: bottom.join("\n"),
        vAlign: "top",
        fontSize: 13,
      });
    }
  }
}

/**
 * Build draw commands for up to 6 HTF groups, left→right = HTF1→HTF6.
 */
export function computeHtfCandles(
  chartBars: readonly HtfBar[],
  chartIntervalSec: number,
  opts: HtfCandlesOptions,
  nowMs = Date.now(),
): HtfComputeResult {
  const cmds: DrawCmd[] = [];
  if (chartBars.length < 3 || chartIntervalSec <= 0) return { cmds, rightBars: 0 };

  const enabled = opts.slots.filter((s) => s.enable).slice(0, Math.max(1, Math.min(6, opts.limitHtf)));
  if (enabled.length === 0) return { cmds, rightBars: 0 };

  const lastChartTime = chartBars[chartBars.length - 1]!.time;
  const nowSec = Math.floor(nowMs / 1000);
  const live = nowSec >= lastChartTime && nowSec - lastChartTime < chartIntervalSec + 20;
  const step = Math.max(1, chartIntervalSec);
  const pad = Math.max(1, opts.paddingBars) * step;
  const groupGap = Math.max(0, opts.groupGapBars) * step;

  let cursor = lastChartTime + pad;
  const groups: PaintedGroup[] = [];
  for (const slot of enabled) {
    if (!htfFitsChart(slot.htf, chartIntervalSec)) continue;
    const all = aggregateHtfBars(chartBars, slot.htf, opts.dailyOpenMode, opts.timezoneOffset);
    const n = Math.max(1, Math.min(40, slot.candleCount));
    const slice = all.slice(-n);
    const painted = paintOneGroup(cmds, slice, cursor, step, opts, slot, lastChartTime, live, nowMs);
    if (Number.isFinite(painted.hi)) groups.push(painted);
    cursor = painted.end + groupGap;
  }

  pushGroupLabels(cmds, groups, opts);

  const rightBars = Math.max(0, Math.ceil((cursor - lastChartTime) / step));
  return { cmds, rightBars };
}

const linestyleMap = { solid: 0, dotted: 1, dashed: 2 } as const;

export async function paintHtfCandlesOnChart(
  chart: IChartWidgetApi,
  cmds: readonly DrawCmd[],
  options?: { readonly ownerStudyId?: EntityId; readonly maxDrawings?: number },
): Promise<EntityId[]> {
  const ids: EntityId[] = [];
  const maxDrawings = options?.maxDrawings ?? 900;
  const limited = cmds.length > maxDrawings ? cmds.slice(0, maxDrawings) : cmds;
  const ownerStudyId = options?.ownerStudyId;

  for (let i = 0; i < limited.length; i += 1) {
    const cmd = limited[i]!;
    const stroke = clColor(cmd.color);
    const common = {
      disableSelection: true,
      disableSave: true,
      disableUndo: true,
      showInObjectsTree: false,
      ...(ownerStudyId ? { ownerStudyId } : {}),
    } as const;
    try {
      if (cmd.kind === "line" && cmd.t2 != null && cmd.p2 != null) {
        const id = await chart.createMultipointShape(
          [
            { time: cmd.t1 as never, price: cmd.p1 },
            { time: cmd.t2 as never, price: cmd.p2 },
          ],
          {
            ...common,
            shape: "trend_line",
            overrides: {
              linecolor: stroke,
              linewidth: cmd.width ?? 1,
              linestyle: linestyleMap[cmd.style ?? "solid"],
              showLabel: false,
              text: "",
            },
          },
        );
        if (id) ids.push(id);
      } else if (cmd.kind === "rect" && cmd.t2 != null && cmd.p2 != null) {
        const fill = cmd.fill ?? stroke;
        const m = fill.match(/rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(?:,\s*([0-9.]+)\s*)?\)/i);
        const a = m?.[1] != null ? Number(m[1]) : 0.7;
        const transparency = Math.max(0, Math.min(100, Math.round((1 - a) * 100)));
        const fillHex = clColor(fill, stroke);
        const id = await chart.createMultipointShape(
          [
            { time: cmd.t1 as never, price: cmd.p1 },
            { time: cmd.t2 as never, price: cmd.p2 },
          ],
          {
            ...common,
            shape: "rectangle",
            overrides: {
              color: stroke,
              linecolor: stroke,
              backgroundColor: fillHex,
              fillBackground: true,
              linewidth: cmd.borderWidth ?? 1,
              linestyle: linestyleMap[cmd.style ?? "solid"],
              transparency,
              filled: true,
            },
          },
        );
        if (id) ids.push(id);
      } else if (cmd.kind === "label") {
        const id = await chart.createShape(
          { time: cmd.t1 as never, price: cmd.p1 },
          {
            ...common,
            shape: "text",
            text: (cmd.text ?? "").trim() || "·",
            overrides: {
              color: stroke,
              fillBackground: false,
              drawBorder: false,
              bold: false,
              horzLabelsAlign: "center",
              vertLabelsAlign: cmd.vAlign ?? "middle",
              fontsize: cmd.fontSize ?? 11,
            },
          },
        );
        if (id) ids.push(id);
      }
    } catch {
      /* skip */
    }
    if (i > 0 && i % 24 === 0) {
      await new Promise<void>((r) => {
        window.setTimeout(r, 0);
      });
    }
  }
  return ids;
}
