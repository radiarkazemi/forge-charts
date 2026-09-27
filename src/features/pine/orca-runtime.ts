/**
 * Client-side port of the Orca BOS/MSS / dealing-range Pine indicator.
 * Charting Library has no Pine compiler — we replay the published Orca logic
 * on exported OHLC and draw via createMultipointShape / createShape.
 */

import type { EntityId, IChartWidgetApi } from "@/infrastructure/tradingview";

export interface OrcaBar {
  readonly time: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
}

export interface OrcaInputs {
  readonly left: number;
  readonly right: number;
  readonly breakOnWick: boolean;
  readonly bosColor: string;
  readonly mssColor: string;
  readonly bosWidth: number;
  readonly showDealingRange: boolean;
  readonly showDrFibs: boolean;
  readonly midlineColor: string;
  readonly midlineWidth: number;
  readonly drAhead: number;
  readonly drFib618Color: string;
  readonly drFib786Color: string;
  readonly bullishSetupCircleColor: string;
  readonly bearishSetupCircleColor: string;
  readonly onlySetupCircles: boolean;
  readonly showOrangeCircles: boolean;
  readonly circleColor: string;
  readonly detectBullishPattern: boolean;
  readonly detectBearishPattern: boolean;
  readonly detectBearishCont: boolean;
  readonly detectBullishCont: boolean;
  readonly detectBullishRev_HL: boolean;
  /**
   * How many completed dealing ranges to keep (newest first).
   * `1` matches classic Orca (latest only). Indicator uses higher values.
   */
  readonly maxDealingRanges: number;
  /** Inclusive unix-sec start for ranges to keep (`null` = no lower bound). */
  readonly fromTimeSec: number | null;
  /** Inclusive unix-sec end for ranges to keep (`null` = no upper bound). */
  readonly toTimeSec: number | null;
  /** When true, skip BOS/MSS lines and setup dots — ranges only. */
  readonly rangesOnly: boolean;
}

const DEFAULTS: OrcaInputs = {
  left: 1,
  right: 1,
  breakOnWick: false,
  bosColor: "#FF9800",
  mssColor: "#00BCD4",
  bosWidth: 1,
  showDealingRange: true,
  showDrFibs: true,
  midlineColor: "#F44336",
  midlineWidth: 2,
  drAhead: 8,
  drFib618Color: "#A5D6A7",
  drFib786Color: "#4DD0E1",
  bullishSetupCircleColor: "#76FF03",
  bearishSetupCircleColor: "#F44336",
  onlySetupCircles: true,
  showOrangeCircles: false,
  circleColor: "#FF9800",
  detectBullishPattern: true,
  detectBearishPattern: true,
  detectBearishCont: true,
  detectBullishCont: true,
  detectBullishRev_HL: true,
  maxDealingRanges: 1,
  fromTimeSec: null,
  toTimeSec: null,
  rangesOnly: false,
};

/** Detect the published Orca script (or a close fork). */
export function isOrcaScript(code: string): boolean {
  if (/indicator\s*\(\s*['"]Orca['"]/i.test(code)) return true;
  // Characteristic combo from the user’s paste
  return (
    /ta\.pivothigh/i.test(code) &&
    /showDealingRange|Dealing Range/i.test(code) &&
    /mssPlusNow|f_check_bullish_pattern/i.test(code)
  );
}

export function parseOrcaInputs(code: string): OrcaInputs {
  const intIn = (name: string, fallback: number) => {
    const re = new RegExp(`${name}\\s*=\\s*input\\.int\\(\\s*(\\d+)`, "i");
    const m = code.match(re);
    return m ? Number(m[1]) : fallback;
  };
  const boolIn = (name: string, fallback: boolean) => {
    const re = new RegExp(`${name}\\s*=\\s*input\\.bool\\(\\s*(true|false)`, "i");
    const m = code.match(re);
    return m?.[1] ? m[1].toLowerCase() === "true" : fallback;
  };
  const colorIn = (name: string, fallback: string) => {
    const re = new RegExp(
      `${name}\\s*=\\s*input\\.color\\(\\s*(?:color\\.(\\w+)|#([0-9A-Fa-f]{6,8}))`,
      "i",
    );
    const m = code.match(re);
    if (!m) return fallback;
    if (m[2]) return `#${m[2].slice(0, 6)}`;
    const named: Record<string, string> = {
      orange: "#FF9800",
      aqua: "#00BCD4",
      red: "#F44336",
      lime: "#76FF03",
      gray: "#9E9E9E",
      white: "#FFFFFF",
      fuchsia: "#E040FB",
    };
    return named[(m[1] ?? "").toLowerCase()] ?? fallback;
  };
  const breakWick = /breakType\s*=\s*input\.string\(\s*['"]Wick/i.test(code)
    ? true
    : /['"]Wick \(High\/Low\)['"]/.test(code) &&
        /breakType\s*=\s*input\.string\(\s*['"]Wick/i.test(code);

  return {
    left: Math.max(1, intIn("left", DEFAULTS.left)),
    right: Math.max(1, intIn("right", DEFAULTS.right)),
    breakOnWick: breakWick || DEFAULTS.breakOnWick,
    bosColor: colorIn("bosColor", DEFAULTS.bosColor),
    mssColor: colorIn("mssColor", DEFAULTS.mssColor),
    bosWidth: Math.max(1, intIn("bosWidth", DEFAULTS.bosWidth)),
    showDealingRange: boolIn("showDealingRange", DEFAULTS.showDealingRange),
    showDrFibs: boolIn("showDrFibs", DEFAULTS.showDrFibs),
    midlineColor: colorIn("midlineColor", DEFAULTS.midlineColor),
    midlineWidth: Math.max(1, intIn("midlineWidth", DEFAULTS.midlineWidth)),
    drAhead: Math.max(1, intIn("drAhead", DEFAULTS.drAhead)),
    drFib618Color: colorIn("drFib618Color", DEFAULTS.drFib618Color),
    drFib786Color: colorIn("drFib786Color", DEFAULTS.drFib786Color),
    bullishSetupCircleColor: colorIn("bullishSetupCircleColor", DEFAULTS.bullishSetupCircleColor),
    bearishSetupCircleColor: colorIn("bearishSetupCircleColor", DEFAULTS.bearishSetupCircleColor),
    onlySetupCircles: boolIn("onlySetupCircles", DEFAULTS.onlySetupCircles),
    showOrangeCircles: boolIn("showOrangeCircles", DEFAULTS.showOrangeCircles),
    circleColor: colorIn("circleColor", DEFAULTS.circleColor),
    detectBullishPattern: boolIn("detectBullishPattern", DEFAULTS.detectBullishPattern),
    detectBearishPattern: boolIn("detectBearishPattern", DEFAULTS.detectBearishPattern),
    detectBearishCont: boolIn("detectBearishCont", DEFAULTS.detectBearishCont),
    detectBullishCont: boolIn("detectBullishCont", DEFAULTS.detectBullishCont),
    detectBullishRev_HL: boolIn("detectBullishRev_HL", DEFAULTS.detectBullishRev_HL),
    maxDealingRanges: Math.max(1, intIn("maxDealingRanges", DEFAULTS.maxDealingRanges)),
    fromTimeSec: null,
    toTimeSec: null,
    rangesOnly: false,
  };
}

interface CircleEvent {
  dir: number;
  price: number;
  bar: number;
}

export interface DrawCmd {
  kind: "line" | "rect" | "dot" | "label";
  t1: number;
  p1: number;
  t2?: number;
  p2?: number;
  color: string;
  width?: number;
  style?: "solid" | "dashed" | "dotted";
  text?: string;
  fill?: string;
}

function pivotHigh(bars: readonly OrcaBar[], i: number, left: number, right: number): number | null {
  // Pine confirms at bar i; pivot bar is i - right
  const pivotIdx = i - right;
  if (pivotIdx < left || i >= bars.length) return null;
  const h = bars[pivotIdx]!.high;
  for (let j = pivotIdx - left; j <= pivotIdx + right; j += 1) {
    if (j === pivotIdx) continue;
    if (bars[j]!.high >= h) return null;
  }
  return h;
}

function pivotLow(bars: readonly OrcaBar[], i: number, left: number, right: number): number | null {
  const pivotIdx = i - right;
  if (pivotIdx < left || i >= bars.length) return null;
  const l = bars[pivotIdx]!.low;
  for (let j = pivotIdx - left; j <= pivotIdx + right; j += 1) {
    if (j === pivotIdx) continue;
    if (bars[j]!.low <= l) return null;
  }
  return l;
}

function checkPattern(
  cr: readonly CircleEvent[],
  dirs: readonly number[],
  priceOk: (p: number[]) => boolean,
): { ok: boolean; i0: number; i1: number; i2: number; i3: number } {
  const n = cr.length;
  if (n < 4) return { ok: false, i0: -1, i1: -1, i2: -1, i3: -1 };
  const i0 = n - 4;
  const i1 = n - 3;
  const i2 = n - 2;
  const i3 = n - 1;
  const d0 = cr[i0]!.dir;
  const d1 = cr[i1]!.dir;
  const d2 = cr[i2]!.dir;
  const d3 = cr[i3]!.dir;
  const orderOK = d0 === dirs[0] && d1 === dirs[1] && d2 === dirs[2] && d3 === dirs[3];
  const prices = [cr[i0]!.price, cr[i1]!.price, cr[i2]!.price, cr[i3]!.price];
  return { ok: orderOK && priceOk(prices), i0, i1, i2, i3 };
}

/**
 * Replay Orca bar-by-bar and emit draw commands (last dealing range only).
 */
export function computeOrcaDraws(bars: readonly OrcaBar[], inputs: OrcaInputs): DrawCmd[] {
  const out: DrawCmd[] = [];
  if (bars.length < inputs.left + inputs.right + 5) return out;

  let lastSH: number | null = null;
  let lastSL: number | null = null;
  let lastSHBar: number | null = null;
  let lastSLBar: number | null = null;
  let brokenSHBar: number | null = null;
  let brokenSLBar: number | null = null;
  let structureDir = 0;
  let lastBOSDir: number | null = null;

  let trkHigh: number | null = null;
  let trkHighBar: number | null = null;
  let trkLow: number | null = null;
  let trkLowBar: number | null = null;

  const cr: CircleEvent[] = [];
  let prevCircSide: number = 0;
  let prevCircPrice: number | null = null;
  let prevCircBar: number | null = null;

  // Dealing-range batches — one per completed setup (Orca overwrite within a setup).
  const drBatches: DrawCmd[][] = [];
  let setupDr: DrawCmd[] | null = null;

  const pushCircle = (dir: number, price: number, bar: number) => {
    cr.push({ dir, price, bar });
    if (cr.length > 300) cr.shift();
  };

  const paintDr = (
    topP: number,
    botP: number,
    topBar: number,
    botBar: number,
    circColor: string,
    name: string,
    bullish: boolean,
  ) => {
    const x1 = Math.min(topBar, botBar);
    const x2 = Math.min(bars.length - 1, Math.max(topBar, botBar) + inputs.drAhead);
    const mid = (topP + botP) / 2;
    const rng = topP - botP;
    const y618 = bullish ? topP - rng * 0.618 : botP + rng * 0.618;
    const y786 = bullish ? topP - rng * 0.786 : botP + rng * 0.786;
    const t1 = bars[x1]!.time;
    const t2 = bars[x2]!.time;
    const cmds: DrawCmd[] = [
      {
        kind: "rect",
        t1,
        p1: topP,
        t2,
        p2: botP,
        color: circColor,
        fill: circColor,
      },
      {
        kind: "line",
        t1,
        p1: mid,
        t2,
        p2: mid,
        color: inputs.midlineColor,
        width: inputs.midlineWidth,
        style: "dashed",
        text: `${name} 0.5`,
      },
    ];
    if (inputs.showDrFibs) {
      cmds.push(
        {
          kind: "line",
          t1,
          p1: y618,
          t2,
          p2: y618,
          color: inputs.drFib618Color,
          width: 1,
          style: "dotted",
          text: "0.618",
        },
        {
          kind: "line",
          t1,
          p1: y786,
          t2,
          p2: y786,
          color: inputs.drFib786Color,
          width: 1,
          style: "dotted",
          text: "0.786",
        },
      );
    }
    // Later call within the same setup replaces earlier (classic Orca).
    setupDr = cmds;
  };

  const drawSetup = (
    name: string,
    i0: number,
    i1: number,
    i2: number,
    i3: number,
    labelUp: boolean,
    circColor: string,
  ) => {
    const p0 = cr[i0]!.price;
    const p1 = cr[i1]!.price;
    const p2 = cr[i2]!.price;
    const p3 = cr[i3]!.price;
    const b0 = cr[i0]!.bar;
    const b1 = cr[i1]!.bar;
    const b2 = cr[i2]!.bar;
    const b3 = cr[i3]!.bar;
    const topP = Math.max(p0, p1, p2, p3);
    const botP = Math.min(p0, p1, p2, p3);
    const topBar = topP === p0 ? b0 : topP === p1 ? b1 : topP === p2 ? b2 : b3;
    const botBar = botP === p0 ? b0 : botP === p1 ? b1 : botP === p2 ? b2 : b3;
    const side = labelUp ? 1 : -1;

    if (!inputs.rangesOnly) {
      out.push({ kind: "dot", t1: bars[botBar]!.time, p1: botP, color: circColor });
      out.push({ kind: "dot", t1: bars[topBar]!.time, p1: topP, color: circColor });
    }

    const c1Bar = botBar <= topBar ? botBar : topBar;
    const c1Price = botBar <= topBar ? botP : topP;
    const c2Bar = botBar <= topBar ? topBar : botBar;
    const c2Price = botBar <= topBar ? topP : botP;

    setupDr = null;
    if (
      inputs.showDealingRange &&
      prevCircSide !== 0 &&
      side === prevCircSide &&
      prevCircPrice != null &&
      prevCircBar != null &&
      c1Bar !== prevCircBar
    ) {
      const hi1 = Math.max(prevCircPrice, c1Price);
      const lo1 = Math.min(prevCircPrice, c1Price);
      const hiBar1 = prevCircPrice >= c1Price ? prevCircBar : c1Bar;
      const loBar1 = prevCircPrice < c1Price ? prevCircBar : c1Bar;
      if (hi1 > lo1) paintDr(hi1, lo1, hiBar1, loBar1, circColor, name, labelUp);
    }

    if (inputs.showDealingRange && c2Bar !== c1Bar) {
      const hi2 = Math.max(c1Price, c2Price);
      const lo2 = Math.min(c1Price, c2Price);
      const hiBar2 = c1Price >= c2Price ? c1Bar : c2Bar;
      const loBar2 = c1Price < c2Price ? c1Bar : c2Bar;
      if (hi2 > lo2) paintDr(hi2, lo2, hiBar2, loBar2, circColor, name, labelUp);
    }
    if (setupDr) drBatches.push(setupDr);

    prevCircSide = side;
    prevCircPrice = c2Price;
    prevCircBar = c2Bar;
  };

  for (let i = 0; i < bars.length; i += 1) {
    const bar = bars[i]!;
    const ph = pivotHigh(bars, i, inputs.left, inputs.right);
    const pl = pivotLow(bars, i, inputs.left, inputs.right);
    // pivothigh confirms at bar i, pivot was at i - right
    if (ph != null) {
      lastSH = ph;
      lastSHBar = i - inputs.right;
    }
    if (pl != null) {
      lastSL = pl;
      lastSLBar = i - inputs.right;
    }

    const preStructure = structureDir;
    const preBOSDir = lastBOSDir;

    if (preBOSDir === 1) {
      if (trkHigh == null || bar.high > trkHigh) {
        trkHigh = bar.high;
        trkHighBar = i;
      }
    }
    if (preBOSDir === -1) {
      if (trkLow == null || bar.low < trkLow) {
        trkLow = bar.low;
        trkLowBar = i;
      }
    }

    const useHigh = inputs.breakOnWick ? bar.high : bar.close;
    const useLow = inputs.breakOnWick ? bar.low : bar.close;

    const bullBOS =
      lastSH != null &&
      lastSHBar != null &&
      useHigh > lastSH &&
      (brokenSHBar == null || brokenSHBar !== lastSHBar);
    const bearBOS =
      lastSL != null &&
      lastSLBar != null &&
      useLow < lastSL &&
      (brokenSLBar == null || brokenSLBar !== lastSLBar);
    const mssPlusNow = bullBOS && preStructure === -1;
    const mssMinusNow = bearBOS && preStructure === 1;

    let justDrewCircle = false;
    const drawOrange = inputs.showOrangeCircles && !inputs.onlySetupCircles;

    if (mssPlusNow && preBOSDir === -1 && trkLowBar != null && trkLow != null) {
      if (drawOrange) {
        out.push({ kind: "dot", t1: bars[trkLowBar]!.time, p1: trkLow, color: inputs.circleColor });
      }
      pushCircle(2, trkLow, trkLowBar);
      justDrewCircle = true;
      trkLow = null;
      trkLowBar = null;
    }

    if (mssMinusNow && preBOSDir === 1 && trkHighBar != null && trkHigh != null) {
      if (drawOrange) {
        out.push({ kind: "dot", t1: bars[trkHighBar]!.time, p1: trkHigh, color: inputs.circleColor });
      }
      pushCircle(-2, trkHigh, trkHighBar);
      justDrewCircle = true;
      trkHigh = null;
      trkHighBar = null;
    }

    if (justDrewCircle) {
      if (inputs.detectBullishPattern) {
        const r = checkPattern(cr, [2, -2, 2, -2], (p) => p[2]! < p[0]! && p[3]! > p[1]!);
        if (r.ok) drawSetup("Bullish Reversal", r.i0, r.i1, r.i2, r.i3, true, inputs.bullishSetupCircleColor);
      }
      if (inputs.detectBullishRev_HL) {
        const r = checkPattern(cr, [2, -2, 2, -2], (p) => p[2]! >= p[0]! && p[3]! >= p[1]!);
        if (r.ok) drawSetup("Bullish Reversal", r.i0, r.i1, r.i2, r.i3, true, inputs.bullishSetupCircleColor);
      }
      if (inputs.detectBullishCont) {
        const r = checkPattern(cr, [2, -2, 2, -2], (p) => p[2]! > p[0]! && p[3]! > p[1]!);
        if (r.ok) drawSetup("Bullish Continuation", r.i0, r.i1, r.i2, r.i3, true, inputs.bullishSetupCircleColor);
      }
      if (inputs.detectBearishPattern) {
        const r = checkPattern(cr, [-2, 2, -2, 2], (p) => p[2]! > p[0]! && p[3]! < p[1]!);
        if (r.ok) drawSetup("Bearish Reversal", r.i0, r.i1, r.i2, r.i3, false, inputs.bearishSetupCircleColor);
      }
      if (inputs.detectBearishCont) {
        const r = checkPattern(cr, [-2, 2, -2, 2], (p) => p[2]! < p[0]! && p[3]! < p[1]!);
        if (r.ok) drawSetup("Bearish Continuation", r.i0, r.i1, r.i2, r.i3, false, inputs.bearishSetupCircleColor);
      }
    }

    if (bullBOS && lastSH != null && lastSHBar != null) {
      const isMss = mssPlusNow;
      if (!inputs.rangesOnly) {
        out.push({
          kind: "line",
          t1: bars[lastSHBar]!.time,
          p1: lastSH,
          t2: bar.time,
          p2: lastSH,
          color: isMss ? inputs.mssColor : inputs.bosColor,
          width: inputs.bosWidth,
          style: isMss ? "dashed" : "dotted",
          text: isMss ? "MSS +" : "BOS +",
        });
      }
      brokenSHBar = lastSHBar;
      structureDir = 1;
      lastBOSDir = 1;
      trkHigh = bar.high;
      trkHighBar = i;
    }

    if (bearBOS && lastSL != null && lastSLBar != null) {
      const isMss = mssMinusNow;
      if (!inputs.rangesOnly) {
        out.push({
          kind: "line",
          t1: bars[lastSLBar]!.time,
          p1: lastSL,
          t2: bar.time,
          p2: lastSL,
          color: isMss ? inputs.mssColor : inputs.bosColor,
          width: inputs.bosWidth,
          style: isMss ? "dashed" : "dotted",
          text: isMss ? "MSS -" : "BOS -",
        });
      }
      brokenSLBar = lastSLBar;
      structureDir = -1;
      lastBOSDir = -1;
      trkLow = bar.low;
      trkLowBar = i;
    }
  }

  const filtered = drBatches.filter((batch) => {
    const t = batch[0]?.t1;
    if (t == null) return false;
    if (inputs.fromTimeSec != null && t < inputs.fromTimeSec) return false;
    if (inputs.toTimeSec != null && t > inputs.toTimeSec) return false;
    return true;
  });
  const maxN = Math.max(1, Math.floor(inputs.maxDealingRanges));
  const kept = filtered.slice(-maxN);
  // Stretch the newest range to the last loaded bar so it stays visible on the live edge.
  if (kept.length > 0 && bars.length > 0) {
    const lastT = bars[bars.length - 1]!.time;
    const newest = kept[kept.length - 1]!;
    for (const cmd of newest) {
      if (cmd.t2 != null && cmd.t2 < lastT) {
        (cmd as { t2: number }).t2 = lastT;
      }
    }
  }
  return [...out, ...kept.flat()];
}

const linestyleMap = { solid: 0, dotted: 1, dashed: 2 } as const;

export interface DealingRangesOptions {
  /** Max completed dealing ranges to draw (newest). */
  readonly maxRanges: number;
  /** Lookback window in calendar days (used when from/to empty). */
  readonly lookbackDays: number;
  /** Inclusive YYYY-MM-DD start (UTC). Empty = use lookbackDays. */
  readonly fromDate: string;
  /** Inclusive YYYY-MM-DD end (UTC). Empty = now. */
  readonly toDate: string;
  readonly showFibs: boolean;
  readonly pivotLeft: number;
  readonly pivotRight: number;
  readonly extendBars: number;
  readonly breakOnWick: boolean;
}

/** Build Orca inputs for the Indicators “Dealing Ranges” study. */
export function dealingRangesInputs(opts: DealingRangesOptions, nowSec = Math.floor(Date.now() / 1000)): OrcaInputs {
  const toSec = parseDateEndSec(opts.toDate) ?? nowSec;
  const fromSec =
    parseDateStartSec(opts.fromDate) ??
    toSec - Math.max(1, opts.lookbackDays) * 86_400;
  return {
    ...DEFAULTS,
    left: Math.max(1, opts.pivotLeft),
    right: Math.max(1, opts.pivotRight),
    breakOnWick: opts.breakOnWick,
    showDealingRange: true,
    showDrFibs: opts.showFibs,
    drAhead: Math.max(1, opts.extendBars),
    maxDealingRanges: Math.max(1, opts.maxRanges),
    fromTimeSec: fromSec,
    toTimeSec: toSec,
    rangesOnly: true,
    onlySetupCircles: true,
    showOrangeCircles: false,
  };
}

function parseDateStartSec(iso: string): number | null {
  const t = iso.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const ms = Date.parse(`${t}T00:00:00Z`);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

function parseDateEndSec(iso: string): number | null {
  const t = iso.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const ms = Date.parse(`${t}T23:59:59Z`);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

/**
 * Detect dealing ranges with Orca’s MSS/setup-circle model and keep up to
 * `maxRanges` inside the requested date window. Structure lines are omitted.
 */
export function computeDealingRanges(bars: readonly OrcaBar[], opts: DealingRangesOptions): DrawCmd[] {
  return computeOrcaDraws(bars, dealingRangesInputs(opts));
}

/** Charting Library color parser rejects rgba / 8-digit hex — normalize to #RRGGBB. */
function clColor(color: string, fallback = "#787B86"): string {
  const c = (color || "").trim();
  if (/^#([0-9a-fA-F]{6})$/.test(c)) return c;
  if (/^#([0-9a-fA-F]{8})$/.test(c)) return c.slice(0, 7);
  if (/^#([0-9a-fA-F]{3})$/.test(c)) {
    const r = c[1]!;
    const g = c[2]!;
    const b = c[3]!;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  const m = c.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (m) {
    const hex = (n: string) => Number(n).toString(16).padStart(2, "0");
    return `#${hex(m[1]!)}${hex(m[2]!)}${hex(m[3]!)}`;
  }
  return fallback;
}

/** Draw computed commands onto a Charting Library chart; returns entity ids. */
export async function paintOrcaOnChart(
  chart: IChartWidgetApi,
  cmds: readonly DrawCmd[],
): Promise<EntityId[]> {
  const ids: EntityId[] = [];
  // Cap drawing volume for CL performance (rangesOnly ≈ 4 cmds each).
  const limited = cmds.length > 80 ? cmds.slice(cmds.length - 80) : cmds;

  for (let i = 0; i < limited.length; i += 1) {
    const cmd = limited[i]!;
    const stroke = clColor(cmd.color);
    try {
      if (cmd.kind === "line" && cmd.t2 != null && cmd.p2 != null) {
        const id = await chart.createMultipointShape(
          [
            { time: cmd.t1, price: cmd.p1 },
            { time: cmd.t2, price: cmd.p2 },
          ],
          {
            shape: "trend_line",
            disableSelection: true,
            disableSave: true,
            disableUndo: true,
            showInObjectsTree: false,
            overrides: {
              linecolor: stroke,
              linewidth: cmd.width ?? 1,
              linestyle: linestyleMap[cmd.style ?? "solid"],
              showLabel: Boolean(cmd.text),
              textcolor: stroke,
              text: cmd.text ?? "",
            },
          },
        );
        if (id) ids.push(id);
      } else if (cmd.kind === "rect" && cmd.t2 != null && cmd.p2 != null) {
        const fill = clColor(cmd.fill ?? cmd.color, stroke);
        const id = await chart.createMultipointShape(
          [
            { time: cmd.t1, price: cmd.p1 },
            { time: cmd.t2, price: cmd.p2 },
          ],
          {
            shape: "rectangle",
            disableSelection: true,
            disableSave: true,
            disableUndo: true,
            showInObjectsTree: false,
            overrides: {
              color: stroke,
              backgroundColor: fill,
              fillBackground: true,
              linewidth: 1,
              transparency: 70,
            },
          },
        );
        if (id) ids.push(id);
      } else if (cmd.kind === "dot") {
        const id = await chart.createShape(
          { time: cmd.t1, price: cmd.p1 },
          {
            shape: "text",
            text: "●",
            disableSelection: true,
            disableSave: true,
            disableUndo: true,
            showInObjectsTree: false,
            overrides: {
              color: stroke,
              fontsize: 14,
              fillBackground: false,
              drawBorder: false,
            },
          },
        );
        if (id) ids.push(id);
      }
    } catch {
      /* skip bad draw */
    }
    // Yield so CL can paint candles / handle clicks between shapes.
    if (i > 0 && i % 4 === 0) {
      await new Promise<void>((r) => {
        window.setTimeout(r, 0);
      });
    }
  }
  return ids;
}

export function barsFromChartExport(exported: {
  readonly data: ReadonlyArray<ArrayLike<number>>;
  readonly schema: ReadonlyArray<{ readonly type?: string; readonly plotTitle?: string }>;
}): OrcaBar[] {
  const schema = exported.schema;
  const timeIdx = schema.findIndex((s) => s.type === "time");
  const find = (name: string) =>
    schema.findIndex((s) => (s.plotTitle ?? "").toLowerCase() === name);
  const o = find("open");
  const h = find("high");
  const l = find("low");
  const c = find("close");
  if (timeIdx < 0 || o < 0 || h < 0 || l < 0 || c < 0) return [];

  const out: OrcaBar[] = [];
  for (const row of exported.data) {
    const t = Number(row[timeIdx]);
    if (!Number.isFinite(t) || t <= 0) continue;
    const timeSec = t > 1e12 ? Math.floor(t / 1000) : Math.floor(t);
    out.push({
      time: timeSec,
      open: Number(row[o]),
      high: Number(row[h]),
      low: Number(row[l]),
      close: Number(row[c]),
    });
  }
  return out;
}
