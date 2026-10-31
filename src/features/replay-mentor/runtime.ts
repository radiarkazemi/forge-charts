/**
 * Forge Replay Mentor — beginner ICT overlays for Bar Replay practice.
 * Detects MSS / BOS / FVG (valid once) / Order Blocks / Liquidity / BPR /
 * IOF (inducement) / IFVG on the current chart TF as candles advance.
 */

import type { EntityId, IChartWidgetApi } from "@/infrastructure/tradingview";
import { paintOrcaOnChart, type DrawCmd, type OrcaBar } from "@/features/pine/orca-runtime";

export type MentorBar = OrcaBar;

export interface MentorInputs {
  readonly swingLeft: number;
  readonly swingRight: number;
  readonly showStructure: boolean;
  readonly showFvg: boolean;
  readonly showOrderBlocks: boolean;
  readonly showLiquidity: boolean;
  readonly showBpr: boolean;
  readonly showIof: boolean;
  readonly showIfvg: boolean;
  readonly maxItems: number;
  readonly bullColor: string;
  readonly bearColor: string;
  readonly fvgBull: string;
  readonly fvgBear: string;
  readonly obBull: string;
  readonly obBear: string;
  readonly liqColor: string;
  readonly bprColor: string;
  readonly iofColor: string;
  readonly ifvgColor: string;
}

export const MENTOR_DEFAULTS: MentorInputs = {
  swingLeft: 2,
  swingRight: 2,
  showStructure: true,
  showFvg: true,
  showOrderBlocks: true,
  showLiquidity: true,
  showBpr: true,
  showIof: true,
  showIfvg: true,
  maxItems: 8,
  // Clean beginner palette (teal / coral / blue / amber / slate)
  bullColor: "#26A69A",
  bearColor: "#EF5350",
  fvgBull: "#26A69A",
  fvgBear: "#EF5350",
  obBull: "#42A5F5",
  obBear: "#FFA726",
  liqColor: "#F9A825",
  bprColor: "#78909C",
  iofColor: "#90A4AE",
  ifvgColor: "#5C6BC0",
};

interface Swing {
  idx: number;
  time: number;
  price: number;
  kind: "high" | "low";
  broken: boolean;
  swept: boolean;
}

interface GapZone {
  dir: 1 | -1;
  t0: number;
  t1: number;
  lo: number;
  hi: number;
  mid: number;
  /** Still a live FVG (not traded through). */
  valid: boolean;
  /** Became an inversion after fill + reclaim. */
  inverted: boolean;
  invertFrom?: number;
  filledAt?: number;
  /** Source bar index of the middle candle (for OB pairing). */
  midIdx: number;
}

interface OrderBlock {
  dir: 1 | -1;
  t0: number;
  t1: number;
  lo: number;
  hi: number;
  mitigated: boolean;
}

interface StructureEvent {
  kind: "BOS" | "MSS";
  dir: 1 | -1;
  t1: number;
  t2: number;
  price: number;
}

interface Inducement {
  dir: 1 | -1;
  time: number;
  price: number;
  taken: boolean;
}

function pivotHigh(bars: readonly MentorBar[], i: number, left: number, right: number): number | null {
  const pivotIdx = i - right;
  if (pivotIdx < left || i >= bars.length) return null;
  const h = bars[pivotIdx]!.high;
  for (let j = pivotIdx - left; j <= pivotIdx + right; j += 1) {
    if (j === pivotIdx) continue;
    if (bars[j]!.high >= h) return null;
  }
  return h;
}

function pivotLow(bars: readonly MentorBar[], i: number, left: number, right: number): number | null {
  const pivotIdx = i - right;
  if (pivotIdx < left || i >= bars.length) return null;
  const l = bars[pivotIdx]!.low;
  for (let j = pivotIdx - left; j <= pivotIdx + right; j += 1) {
    if (j === pivotIdx) continue;
    if (bars[j]!.low <= l) return null;
  }
  return l;
}

function atrApprox(bars: readonly MentorBar[], i: number, len = 14): number {
  let sum = 0;
  let n = 0;
  const from = Math.max(1, i - len + 1);
  for (let j = from; j <= i; j += 1) {
    const b = bars[j]!;
    const prev = bars[j - 1]!;
    const tr = Math.max(b.high - b.low, Math.abs(b.high - prev.close), Math.abs(b.low - prev.close));
    sum += tr;
    n += 1;
  }
  return n > 0 ? sum / n : bars[i]!.high - bars[i]!.low;
}

function bodyOf(b: MentorBar): number {
  return Math.abs(b.close - b.open);
}

function isBull(b: MentorBar): boolean {
  return b.close >= b.open;
}

function overlaps(aLo: number, aHi: number, bLo: number, bHi: number): { lo: number; hi: number } | null {
  const lo = Math.max(aLo, bLo);
  const hi = Math.min(aHi, bHi);
  if (hi <= lo) return null;
  return { lo, hi };
}

function keepTail<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr;
  return arr.slice(arr.length - max);
}

/**
 * Walk bars left→right (replay-friendly) and emit beginner ICT drawings.
 */
export function computeReplayMentor(
  bars: readonly MentorBar[],
  inputs: Partial<MentorInputs> = {},
): DrawCmd[] {
  const cfg: MentorInputs = { ...MENTOR_DEFAULTS, ...inputs };
  const out: DrawCmd[] = [];
  const need = cfg.swingLeft + cfg.swingRight + 8;
  if (bars.length < need) return out;

  const maxN = Math.max(2, Math.min(24, Math.floor(cfg.maxItems)));
  const left = Math.max(1, Math.floor(cfg.swingLeft));
  const right = Math.max(1, Math.floor(cfg.swingRight));

  const swings: Swing[] = [];
  const fvgs: GapZone[] = [];
  const obs: OrderBlock[] = [];
  const structures: StructureEvent[] = [];
  const inducements: Inducement[] = [];

  let lastSH: Swing | null = null;
  let lastSL: Swing | null = null;
  let structureDir = 0;
  let lastOppositeBearIdx: number | null = null; // last red candle (for bull OB)
  let lastOppositeBullIdx: number | null = null; // last green candle (for bear OB)

  const lastT = bars[bars.length - 1]!.time;

  for (let i = left + right; i < bars.length; i += 1) {
    const bar = bars[i]!;
    const atr = atrApprox(bars, i);

    if (!isBull(bar)) lastOppositeBearIdx = i;
    else lastOppositeBullIdx = i;

    const ph = pivotHigh(bars, i, left, right);
    if (ph != null) {
      const pivotIdx = i - right;
      const sw: Swing = {
        idx: pivotIdx,
        time: bars[pivotIdx]!.time,
        price: ph,
        kind: "high",
        broken: false,
        swept: false,
      };
      swings.push(sw);
      // Inducement: prior minor high short of last external high
      if (
        cfg.showIof &&
        lastSH &&
        ph < lastSH.price - atr * 0.05 &&
        lastSH.price - ph < atr * 3
      ) {
        inducements.push({ dir: -1, time: sw.time, price: ph, taken: false });
      }
      lastSH = sw;
    }

    const pl = pivotLow(bars, i, left, right);
    if (pl != null) {
      const pivotIdx = i - right;
      const sw: Swing = {
        idx: pivotIdx,
        time: bars[pivotIdx]!.time,
        price: pl,
        kind: "low",
        broken: false,
        swept: false,
      };
      swings.push(sw);
      if (
        cfg.showIof &&
        lastSL &&
        pl > lastSL.price + atr * 0.05 &&
        pl - lastSL.price < atr * 3
      ) {
        inducements.push({ dir: 1, time: sw.time, price: pl, taken: false });
      }
      lastSL = sw;
    }

    // Liquidity sweeps (wick beyond swing, close back inside)
    if (cfg.showLiquidity) {
      for (const sw of swings) {
        if (sw.swept || sw.broken) continue;
        if (sw.kind === "high" && bar.high > sw.price && bar.close < sw.price) {
          sw.swept = true;
        }
        if (sw.kind === "low" && bar.low < sw.price && bar.close > sw.price) {
          sw.swept = true;
        }
      }
    }

    // Inducement taken
    if (cfg.showIof) {
      for (const ind of inducements) {
        if (ind.taken) continue;
        if (ind.dir === -1 && bar.high >= ind.price) ind.taken = true;
        if (ind.dir === 1 && bar.low <= ind.price) ind.taken = true;
      }
    }

    const preStructure = structureDir;
    const useHigh = bar.close;
    const useLow = bar.close;

    const bullBreak =
      lastSH != null && !lastSH.broken && useHigh > lastSH.price;
    const bearBreak =
      lastSL != null && !lastSL.broken && useLow < lastSL.price;

    if (bullBreak && lastSH) {
      const isMss = preStructure === -1;
      structures.push({
        kind: isMss ? "MSS" : "BOS",
        dir: 1,
        t1: lastSH.time,
        t2: bar.time,
        price: lastSH.price,
      });
      lastSH.broken = true;
      structureDir = 1;

      // Bullish order block = last down candle before this impulse
      if (cfg.showOrderBlocks && lastOppositeBearIdx != null && lastOppositeBearIdx < i) {
        const obBar = bars[lastOppositeBearIdx]!;
        obs.push({
          dir: 1,
          t0: obBar.time,
          t1: bar.time,
          lo: obBar.low,
          hi: obBar.high,
          mitigated: false,
        });
      }
    }

    if (bearBreak && lastSL) {
      const isMss = preStructure === 1;
      structures.push({
        kind: isMss ? "MSS" : "BOS",
        dir: -1,
        t1: lastSL.time,
        t2: bar.time,
        price: lastSL.price,
      });
      lastSL.broken = true;
      structureDir = -1;

      if (cfg.showOrderBlocks && lastOppositeBullIdx != null && lastOppositeBullIdx < i) {
        const obBar = bars[lastOppositeBullIdx]!;
        obs.push({
          dir: -1,
          t0: obBar.time,
          t1: bar.time,
          lo: obBar.low,
          hi: obBar.high,
          mitigated: false,
        });
      }
    }

    // 3-candle FVG — require a bit of displacement so beginners see clear gaps
    if (cfg.showFvg && i >= 2) {
      const b0 = bars[i - 2]!;
      const b1 = bars[i - 1]!;
      const b2 = bar;
      const minGap = atr * 0.12;
      // Bullish FVG: gap between high[i-2] and low[i]
      if (b2.low - b0.high > minGap && bodyOf(b1) > atr * 0.35) {
        const lo = b0.high;
        const hi = b2.low;
        fvgs.push({
          dir: 1,
          t0: b0.time,
          t1: b2.time,
          lo,
          hi,
          mid: (lo + hi) / 2,
          valid: true,
          inverted: false,
          midIdx: i - 1,
        });
      }
      // Bearish FVG
      if (b0.low - b2.high > minGap && bodyOf(b1) > atr * 0.35) {
        const lo = b2.high;
        const hi = b0.low;
        fvgs.push({
          dir: -1,
          t0: b0.time,
          t1: b2.time,
          lo,
          hi,
          mid: (lo + hi) / 2,
          valid: true,
          inverted: false,
          midIdx: i - 1,
        });
      }
    }

    // FVG valid once — invalidate on first trade through; IFVG on reclaim
    for (const z of fvgs) {
      if (z.valid) {
        const filled =
          z.dir === 1 ? bar.low <= z.lo : bar.high >= z.hi;
        if (filled) {
          z.valid = false;
          z.filledAt = bar.time;
        }
      } else if (cfg.showIfvg && !z.inverted && z.filledAt != null) {
        // Reclaim through the zone in the original direction → inversion
        const reclaimed =
          z.dir === 1 ? bar.close > z.hi : bar.close < z.lo;
        if (reclaimed) {
          z.inverted = true;
          z.invertFrom = bar.time;
        }
      }
    }

    // Mitigate order blocks on close through
    for (const ob of obs) {
      if (ob.mitigated) continue;
      if (ob.dir === 1 && bar.close < ob.lo) ob.mitigated = true;
      if (ob.dir === -1 && bar.close > ob.hi) ob.mitigated = true;
      else ob.t1 = bar.time;
    }
  }

  // Stretch live zones to the replay edge
  for (const z of fvgs) {
    if (z.valid || z.inverted) z.t1 = Math.max(z.t1, lastT);
  }
  for (const ob of obs) {
    if (!ob.mitigated) ob.t1 = Math.max(ob.t1, lastT);
  }

  // —— Draw: Structure ————————————————————————————————
  if (cfg.showStructure) {
    for (const ev of keepTail(structures, maxN)) {
      const bull = ev.dir === 1;
      const color = bull ? cfg.bullColor : cfg.bearColor;
      const tag = ev.kind === "MSS" ? (bull ? "MSS +" : "MSS −") : bull ? "BOS +" : "BOS −";
      out.push({
        kind: "line",
        t1: ev.t1,
        p1: ev.price,
        t2: ev.t2,
        p2: ev.price,
        color,
        width: ev.kind === "MSS" ? 2 : 1,
        style: ev.kind === "MSS" ? "dashed" : "dotted",
        text: tag,
      });
    }
  }

  // —— Draw: Liquidity (nearest BSL / SSL + recent sweeps) ———
  if (cfg.showLiquidity) {
    const highs = swings.filter((s) => s.kind === "high");
    const lows = swings.filter((s) => s.kind === "low");
    const liveHigh = [...highs].reverse().find((s) => !s.broken);
    const liveLow = [...lows].reverse().find((s) => !s.broken);
    const sweeps = keepTail(
      swings.filter((s) => s.swept),
      Math.min(4, maxN),
    );
    const liq: Swing[] = [];
    if (liveHigh) liq.push(liveHigh);
    if (liveLow) liq.push(liveLow);
    for (const s of sweeps) {
      if (!liq.includes(s)) liq.push(s);
    }
    for (const sw of liq) {
      const tag =
        sw.kind === "high" ? (sw.swept ? "BSL Sweep" : "BSL") : sw.swept ? "SSL Sweep" : "SSL";
      out.push({
        kind: "line",
        t1: sw.time,
        p1: sw.price,
        t2: lastT,
        p2: sw.price,
        color: cfg.liqColor,
        width: 1,
        style: sw.swept ? "solid" : "dashed",
        text: tag,
      });
    }
  }

  // —— Draw: FVG (valid once) ———————————————————————————
  if (cfg.showFvg) {
    const live = keepTail(
      fvgs.filter((z) => z.valid),
      maxN,
    );
    for (const z of live) {
      const color = z.dir === 1 ? cfg.fvgBull : cfg.fvgBear;
      out.push({
        kind: "rect",
        t1: z.t0,
        p1: z.hi,
        t2: z.t1,
        p2: z.lo,
        color,
        fill: color,
      });
      out.push({
        kind: "line",
        t1: z.t0,
        p1: z.mid,
        t2: z.t1,
        p2: z.mid,
        color,
        width: 1,
        style: "dotted",
        text: z.dir === 1 ? "FVG +" : "FVG −",
      });
    }
  }

  // —— Draw: IFVG ——————————————————————————————————————
  if (cfg.showIfvg) {
    const inv = keepTail(
      fvgs.filter((z) => z.inverted && z.invertFrom != null),
      Math.max(2, Math.floor(maxN / 2)),
    );
    for (const z of inv) {
      out.push({
        kind: "rect",
        t1: z.invertFrom!,
        p1: z.hi,
        t2: lastT,
        p2: z.lo,
        color: cfg.ifvgColor,
        fill: cfg.ifvgColor,
      });
      out.push({
        kind: "line",
        t1: z.invertFrom!,
        p1: z.mid,
        t2: lastT,
        p2: z.mid,
        color: cfg.ifvgColor,
        width: 1,
        style: "dashed",
        text: z.dir === 1 ? "IFVG +" : "IFVG −",
      });
    }
  }

  // —— Draw: BPR (overlap of opposite FVGs) ——————————————
  if (cfg.showBpr) {
    const bprs: DrawCmd[] = [];
    const candidates = fvgs.filter((z) => z.valid || z.inverted);
    for (let a = 0; a < candidates.length; a += 1) {
      for (let b = a + 1; b < candidates.length; b += 1) {
        const A = candidates[a]!;
        const B = candidates[b]!;
        if (A.dir === B.dir) continue;
        const ov = overlaps(A.lo, A.hi, B.lo, B.hi);
        if (!ov) continue;
        const t0 = Math.max(A.t0, B.t0);
        bprs.push({
          kind: "rect",
          t1: t0,
          p1: ov.hi,
          t2: lastT,
          p2: ov.lo,
          color: cfg.bprColor,
          fill: cfg.bprColor,
        });
        bprs.push({
          kind: "line",
          t1: t0,
          p1: (ov.lo + ov.hi) / 2,
          t2: lastT,
          p2: (ov.lo + ov.hi) / 2,
          color: cfg.bprColor,
          width: 1,
          style: "solid",
          text: "BPR",
        });
      }
    }
    out.push(...keepTail(bprs, maxN * 2));
  }

  // —— Draw: Order Blocks ——————————————————————————————
  if (cfg.showOrderBlocks) {
    const liveOb = keepTail(
      obs.filter((o) => !o.mitigated),
      maxN,
    );
    for (const ob of liveOb) {
      const color = ob.dir === 1 ? cfg.obBull : cfg.obBear;
      out.push({
        kind: "rect",
        t1: ob.t0,
        p1: ob.hi,
        t2: ob.t1,
        p2: ob.lo,
        color,
        fill: color,
      });
      out.push({
        kind: "line",
        t1: ob.t0,
        p1: (ob.lo + ob.hi) / 2,
        t2: ob.t1,
        p2: (ob.lo + ob.hi) / 2,
        color,
        width: 1,
        style: "dotted",
        text: ob.dir === 1 ? "OB +" : "OB −",
      });
    }
  }

  // —— Draw: IOF (inducement) ————————————————————————————
  if (cfg.showIof) {
    const recent = keepTail(inducements, maxN);
    for (const ind of recent) {
      out.push({
        kind: "line",
        t1: ind.time,
        p1: ind.price,
        t2: lastT,
        p2: ind.price,
        color: cfg.iofColor,
        width: 1,
        style: ind.taken ? "solid" : "dashed",
        text: ind.taken ? "IOF taken" : "IOF",
      });
    }
  }

  return out;
}

export async function paintReplayMentor(
  chart: IChartWidgetApi,
  cmds: readonly DrawCmd[],
  options?: { readonly ownerStudyId?: EntityId },
): Promise<EntityId[]> {
  return paintOrcaOnChart(chart, cmds, options);
}
