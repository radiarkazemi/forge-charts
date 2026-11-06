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
  readonly volume?: number;
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

/**
 * One Orca-confirmed Dealing Range (same-color C1/C2 setup pair).
 * Bullish → OTE measured from high (discount). Bearish → from low (premium).
 */
export interface ConfirmedDealingRange {
  readonly bullish: boolean;
  readonly name: string;
  readonly top: number;
  readonly bot: number;
  readonly mid: number;
  /** 0.618 OTE level (discount for bullish, premium for bearish). */
  readonly ote618: number;
  /** 0.786 OTE level. */
  readonly ote786: number;
  /** Range start (earlier extreme) unix sec. */
  readonly t0: number;
  /** Confirmation time (later extreme / C2) unix sec. */
  readonly t1: number;
  /** Bar index where the range was confirmed. */
  readonly confirmBar: number;
}

export interface OrcaAnalysis {
  readonly cmds: DrawCmd[];
  /** Chronological confirmed dealing ranges (oldest → newest). */
  readonly ranges: readonly ConfirmedDealingRange[];
  /** Last structure direction after full replay: 1 up, -1 down, 0 unknown. */
  readonly structureDir: 1 | -1 | 0;
}

export interface DrawCmd {
  kind: "line" | "rect" | "dot" | "label" | "vline" | "position" | "arrow";
  t1: number;
  p1: number;
  t2?: number;
  p2?: number;
  color: string;
  width?: number;
  style?: "solid" | "dashed" | "dotted";
  text?: string;
  fill?: string;
  /** Rectangle / position fill alpha 0–1 (default 0.2). Lower = lighter overlays. */
  fillAlpha?: number;
  /** Border linewidth for rects (default 2). */
  borderWidth?: number;
  /** `position` / `arrow`: 1 = long / arrow_up, -1 = short / arrow_down. */
  dir?: 1 | -1;
  /** `position` only: take-profit price (converted to ticks at paint). */
  profitPrice?: number;
  /** `position` only: stop-loss price (converted to ticks at paint). */
  stopPrice?: number;
  /** `position` only: stop-zone fill (#hex). `fill` is the target/profit fill. */
  stopFill?: string;
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
 * Replay Orca bar-by-bar: BOS/MSS structure + confirmed Dealing Ranges.
 * Returns draw cmds and structured ranges for confluence engines (FTA).
 */
export function computeOrcaAnalysis(bars: readonly OrcaBar[], inputs: OrcaInputs): OrcaAnalysis {
  const empty: OrcaAnalysis = { cmds: [], ranges: [], structureDir: 0 };
  if (bars.length < inputs.left + inputs.right + 5) return empty;

  const out: DrawCmd[] = [];
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
  const rangeBatches: ConfirmedDealingRange[] = [];
  let setupDr: DrawCmd[] | null = null;
  let setupRange: ConfirmedDealingRange | null = null;

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
    const t0 = bars[x1]!.time;
    const tConfirm = bars[Math.max(topBar, botBar)]!.time;
    const t2 = bars[x2]!.time;
    const cmds: DrawCmd[] = [
      {
        kind: "rect",
        t1: t0,
        p1: topP,
        t2,
        p2: botP,
        color: circColor,
        fill: circColor,
      },
      {
        kind: "line",
        t1: t0,
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
          t1: t0,
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
          t1: t0,
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
    setupRange = {
      bullish,
      name,
      top: topP,
      bot: botP,
      mid,
      ote618: y618,
      ote786: y786,
      t0,
      t1: tConfirm,
      confirmBar: Math.max(topBar, botBar),
    };
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
    setupRange = null;
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
    if (setupDr && setupRange) {
      drBatches.push(setupDr);
      rangeBatches.push(setupRange);
    }

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

  const filteredIdx: number[] = [];
  for (let i = 0; i < drBatches.length; i += 1) {
    const t = rangeBatches[i]?.t1 ?? drBatches[i]![0]?.t1;
    if (t == null) continue;
    if (inputs.fromTimeSec != null && t < inputs.fromTimeSec) continue;
    if (inputs.toTimeSec != null && t > inputs.toTimeSec) continue;
    filteredIdx.push(i);
  }
  // Full chronological ranges for confluence (FTA); draw cmds still capped by maxN.
  const allRanges = filteredIdx.map((i) => rangeBatches[i]!);
  const maxN = Math.max(1, Math.floor(inputs.maxDealingRanges));
  const keptIdx = filteredIdx.slice(-maxN);
  const kept = keptIdx.map((i) => drBatches[i]!);
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
  const dir: 1 | -1 | 0 = structureDir === 1 ? 1 : structureDir === -1 ? -1 : 0;
  return {
    cmds: [...out, ...kept.flat()],
    ranges: allRanges,
    structureDir: dir,
  };
}

/** Replay Orca and return draw commands only (backward-compatible). */
export function computeOrcaDraws(bars: readonly OrcaBar[], inputs: OrcaInputs): DrawCmd[] {
  return computeOrcaAnalysis(bars, inputs).cmds;
}

/** Last confirmed DR at-or-before bar index (null if none yet). */
export function lastConfirmedDealingRangeAt(
  ranges: readonly ConfirmedDealingRange[],
  barIndex: number,
): ConfirmedDealingRange | null {
  let best: ConfirmedDealingRange | null = null;
  for (const r of ranges) {
    if (r.confirmBar <= barIndex) best = r;
  }
  return best;
}

/** True when bar trades into the OTE band (0.618–0.786) of a confirmed DR. */
export function touchesDrOte(bar: OrcaBar, dr: ConfirmedDealingRange): boolean {
  const lo = Math.min(dr.ote618, dr.ote786);
  const hi = Math.max(dr.ote618, dr.ote786);
  return bar.low <= hi && bar.high >= lo;
}

/** Discount (bullish) / Premium (bearish) half of the last DR. */
export function inDrEntryHalf(bar: OrcaBar, dr: ConfirmedDealingRange): boolean {
  if (dr.bullish) return bar.low <= dr.mid;
  return bar.high >= dr.mid;
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

/** Symbol min tick (price units). Used to convert TP/SL distances → CL ticks. */
function resolveMinTick(chart: IChartWidgetApi): number {
  try {
    const ext = chart.symbolExt() as {
      pricescale?: number;
      minmov?: number;
    } | null;
    const scale = Number(ext?.pricescale);
    const minmov = Number(ext?.minmov);
    if (Number.isFinite(scale) && scale > 0) {
      const move = Number.isFinite(minmov) && minmov > 0 ? minmov : 1;
      return move / scale;
    }
  } catch {
    /* fall through */
  }
  return 0.01;
}

function priceToTicks(priceDiff: number, minTick: number): number {
  const tick = minTick > 0 ? minTick : 0.01;
  return Math.max(1, Math.round(Math.abs(priceDiff) / tick));
}

/** Draw computed commands onto a Charting Library chart; returns entity ids. */
export async function paintOrcaOnChart(
  chart: IChartWidgetApi,
  cmds: readonly DrawCmd[],
  options?: { readonly ownerStudyId?: EntityId; readonly maxCmds?: number },
): Promise<EntityId[]> {
  const ids: EntityId[] = [];
  // Cap drawing volume for CL performance; keep newest (signals / DRs live at the end).
  const maxCmds = Math.max(20, Math.min(200, Math.floor(options?.maxCmds ?? 60)));
  const limited = cmds.length > maxCmds ? cmds.slice(cmds.length - maxCmds) : cmds;
  const ownerStudyId = options?.ownerStudyId;
  const minTick = resolveMinTick(chart);

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
      if (
        cmd.kind === "position" &&
        (cmd.dir === 1 || cmd.dir === -1) &&
        Number.isFinite(cmd.profitPrice) &&
        Number.isFinite(cmd.stopPrice)
      ) {
        // Native TV Long/Short Position — green Target + red Stop (do NOT set `text`).
        const shape = cmd.dir === 1 ? "long_position" : "short_position";
        const profitLevel = priceToTicks(cmd.profitPrice! - cmd.p1, minTick);
        const stopLevel = priceToTicks(cmd.stopPrice! - cmd.p1, minTick);
        const alpha = Math.max(0.12, Math.min(0.4, cmd.fillAlpha ?? 0.2));
        const transparency = Math.round((1 - alpha) * 100);
        const profitHex = clColor(cmd.fill ?? "#00A000", "#00A000");
        const stopHex = clColor(cmd.stopFill ?? "#FF0000", "#FF0000");
        const id = await chart.createShape(
          { time: cmd.t1 as never, price: cmd.p1 },
          {
            disableSelection: true,
            disableSave: true,
            disableUndo: true,
            showInObjectsTree: false,
            ...(ownerStudyId ? { ownerStudyId } : {}),
            shape: shape as never,
            // Never pass `text` — CL throws / breaks Long·Short Position.
            overrides: {
              profitLevel,
              stopLevel,
              profitBackground: profitHex,
              stopBackground: stopHex,
              profitBackgroundTransparency: transparency,
              stopBackgroundTransparency: transparency,
              fillBackground: true,
              fillLabelBackground: true,
              showPriceLabels: true,
              alwaysShowStats: true,
              linewidth: 1,
              linecolor: "#585858",
              borderColor: "#667b8b",
              drawBorder: false,
              fontsize: 12,
              textcolor: "#ffffff",
              riskDisplayMode: "percents",
            } as never,
          },
        );
        if (id) ids.push(id);
      } else if (cmd.kind === "arrow" && (cmd.dir === 1 || cmd.dir === -1)) {
        const id = await chart.createShape(
          { time: cmd.t1 as never, price: cmd.p1 },
          {
            ...common,
            shape: (cmd.dir === 1 ? "arrow_up" : "arrow_down") as never,
            text: (cmd.text ?? "").trim() || (cmd.dir === 1 ? "BUY" : "SELL"),
            overrides: {
              color: stroke,
              fontsize: 14,
            },
          },
        );
        if (id) ids.push(id);
      } else if (cmd.kind === "line" && cmd.t2 != null && cmd.p2 != null) {
        const label = (cmd.text ?? "").trim();
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
              showLabel: label.length > 0,
              text: label,
              textcolor: stroke,
              fontsize: 11,
              horzLabelsAlign: "left",
              vertLabelsAlign: "middle",
            },
          },
        );
        if (id) ids.push(id);
      } else if (cmd.kind === "rect" && cmd.t2 != null && cmd.p2 != null) {
        // CL rectangles: solid hex + transparency (rgba fills are unreliable).
        const fillHex = clColor(cmd.fill ?? cmd.color, stroke);
        const alpha = Math.max(0.04, Math.min(0.85, cmd.fillAlpha ?? 0.2));
        const transparency = Math.round((1 - alpha) * 100);
        const border = Math.max(0, Math.min(4, cmd.borderWidth ?? 0));
        const id = await chart.createMultipointShape(
          [
            { time: cmd.t1 as never, price: cmd.p1 },
            { time: cmd.t2 as never, price: cmd.p2 },
          ],
          {
            ...common,
            shape: "rectangle",
            overrides: {
              color: fillHex,
              linecolor: border > 0 ? fillHex : fillHex,
              backgroundColor: fillHex,
              fillBackground: true,
              filled: true,
              linewidth: border,
              // Hide rect border stroke when borderWidth is 0 (clean half fills).
              transparency,
              linestyle: linestyleMap[cmd.style ?? "solid"],
              ...(border === 0
                ? {
                    linewidth: 0,
                    // Match fill so any residual stroke is invisible.
                    color: fillHex,
                    linecolor: fillHex,
                  }
                : {}),
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
              color: stroke,
              fontsize: 14,
              fillBackground: false,
              drawBorder: false,
            },
          },
        );
        if (id) ids.push(id);
      } else if (cmd.kind === "label" && (cmd.text ?? "").trim()) {
        // Pill-style signal tags (Texas-like): filled badge + contrasting text.
        const label = ` ${cmd.text!.trim()} `;
        const bg = clColor(cmd.fill ?? cmd.color, stroke);
        const id = await chart.createShape(
          { time: cmd.t1 as never, price: cmd.p1 },
          {
            ...common,
            shape: "text",
            text: label,
            overrides: {
              color: "#FFFFFF",
              fontsize: 12,
              bold: true,
              fillBackground: true,
              backgroundColor: bg,
              drawBorder: false,
              borderColor: bg,
              borderWidth: 0,
              horzLabelsAlign: "center",
              vertLabelsAlign: "middle",
            },
          },
        );
        if (id) ids.push(id);
      }
    } catch {
      /* skip bad draw */
    }
    // Yield so CL can paint candles / handle clicks between shapes.
    if (i > 0 && i % 3 === 0) {
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
  const v = find("volume");
  if (timeIdx < 0 || o < 0 || h < 0 || l < 0 || c < 0) return [];

  const out: OrcaBar[] = [];
  for (const row of exported.data) {
    const t = Number(row[timeIdx]);
    if (!Number.isFinite(t) || t <= 0) continue;
    const timeSec = t > 1e12 ? Math.floor(t / 1000) : Math.floor(t);
    const vol = v >= 0 ? Number(row[v]) : 0;
    out.push({
      time: timeSec,
      open: Number(row[o]),
      high: Number(row[h]),
      low: Number(row[l]),
      close: Number(row[c]),
      volume: Number.isFinite(vol) ? vol : 0,
    });
  }
  return out;
}
