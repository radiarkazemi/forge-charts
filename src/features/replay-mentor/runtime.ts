/**
 * Forge Replay Mentor — beginner ICT overlays for Bar Replay practice.
 * Detects MSS / BOS / FVG (valid once) / Order Blocks / Liquidity / BPR /
 * IOF (inducement) / IFVG on the current chart TF as candles advance.
 */

import type { EntityId, IChartWidgetApi } from "@/infrastructure/tradingview";
import type { DrawCmd, OrcaBar } from "@/features/pine/orca-runtime";

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
  showBpr: false, // off by default — overlaps muddy the chart for beginners
  showIof: true,
  showIfvg: true,
  maxItems: 3,
  // High-contrast on light & dark chart backgrounds
  bullColor: "#00796B",
  bearColor: "#C62828",
  fvgBull: "#00897B",
  fvgBear: "#E53935",
  obBull: "#1565C0",
  obBear: "#EF6C00",
  liqColor: "#E65100",
  bprColor: "#455A64",
  iofColor: "#546E7A",
  ifvgColor: "#303F9F",
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

  // Stretch live zones just to the replay edge (single right rail for labels)
  for (const z of fvgs) {
    if (z.valid || z.inverted) z.t1 = Math.max(z.t1, lastT);
  }
  for (const ob of obs) {
    if (!ob.mitigated) ob.t1 = Math.max(ob.t1, lastT);
  }

  const atrEnd = atrApprox(bars, bars.length - 1);
  const near = (a: number, b: number) => Math.abs(a - b) <= atrEnd * 0.15;

  const pushZone = (
    t0: number,
    t1: number,
    lo: number,
    hi: number,
    color: string,
    tag: string,
  ) => {
    out.push({
      kind: "rect",
      t1: t0,
      p1: hi,
      t2: t1,
      p2: lo,
      color,
      fill: color,
    });
    // One chip label at the right edge mid — no mid-line clutter
    out.push({
      kind: "label",
      t1: t1,
      p1: (lo + hi) / 2,
      color,
      text: tag,
    });
  };

  const pushLevel = (
    t0: number,
    price: number,
    color: string,
    tag: string,
    width: number,
    style: "solid" | "dashed" | "dotted",
  ) => {
    out.push({
      kind: "line",
      t1: t0,
      p1: price,
      t2: lastT,
      p2: price,
      color,
      width,
      style,
    });
    out.push({
      kind: "label",
      t1: lastT,
      p1: price,
      color,
      text: tag,
    });
  };

  // —— Structure: last few only, bold short rails ——————————
  if (cfg.showStructure) {
    for (const ev of keepTail(structures, Math.min(4, maxN + 1))) {
      const bull = ev.dir === 1;
      const color = bull ? cfg.bullColor : cfg.bearColor;
      const tag = ev.kind === "MSS" ? (bull ? "MSS+" : "MSS−") : bull ? "BOS+" : "BOS−";
      out.push({
        kind: "line",
        t1: ev.t1,
        p1: ev.price,
        t2: ev.t2,
        p2: ev.price,
        color,
        width: ev.kind === "MSS" ? 3 : 2,
        style: ev.kind === "MSS" ? "dashed" : "solid",
      });
      out.push({
        kind: "label",
        t1: ev.t2,
        p1: ev.price,
        color,
        text: tag,
      });
    }
  }

  // —— Liquidity: exactly one BSL + one SSL (+ optional latest sweep) ———
  const liqPrices: number[] = [];
  if (cfg.showLiquidity) {
    const highs = swings.filter((s) => s.kind === "high");
    const lows = swings.filter((s) => s.kind === "low");
    const liveHigh = [...highs].reverse().find((s) => !s.broken);
    const liveLow = [...lows].reverse().find((s) => !s.broken);
    const latestSweep = [...swings].reverse().find((s) => s.swept);
    if (liveHigh) {
      pushLevel(liveHigh.time, liveHigh.price, cfg.liqColor, "BSL", 2, "dashed");
      liqPrices.push(liveHigh.price);
    }
    if (liveLow) {
      pushLevel(liveLow.time, liveLow.price, cfg.liqColor, "SSL", 2, "dashed");
      liqPrices.push(liveLow.price);
    }
    if (
      latestSweep &&
      latestSweep !== liveHigh &&
      latestSweep !== liveLow &&
      !liqPrices.some((p) => near(p, latestSweep.price))
    ) {
      const tag = latestSweep.kind === "high" ? "BSL Sweep" : "SSL Sweep";
      pushLevel(latestSweep.time, latestSweep.price, cfg.liqColor, tag, 2, "solid");
      liqPrices.push(latestSweep.price);
    }
  }

  // —— FVG: at most one live bull + one live bear ——————————
  const fvgDrawn: GapZone[] = [];
  if (cfg.showFvg) {
    const liveBull = [...fvgs].reverse().find((z) => z.valid && z.dir === 1);
    const liveBear = [...fvgs].reverse().find((z) => z.valid && z.dir === -1);
    for (const z of [liveBull, liveBear]) {
      if (!z) continue;
      fvgDrawn.push(z);
      pushZone(z.t0, z.t1, z.lo, z.hi, z.dir === 1 ? cfg.fvgBull : cfg.fvgBear, z.dir === 1 ? "FVG+" : "FVG−");
    }
  }

  // —— IFVG: newest one only ——————————————————————————————
  if (cfg.showIfvg) {
    const inv = [...fvgs].reverse().find((z) => z.inverted && z.invertFrom != null);
    if (inv) {
      pushZone(inv.invertFrom!, lastT, inv.lo, inv.hi, cfg.ifvgColor, inv.dir === 1 ? "IFVG+" : "IFVG−");
    }
  }

  // —— BPR: single clearest overlap (optional) ————————————
  if (cfg.showBpr) {
    let best: { t0: number; lo: number; hi: number; size: number } | null = null;
    const candidates = fvgs.filter((z) => z.valid || z.inverted);
    for (let a = 0; a < candidates.length; a += 1) {
      for (let b = a + 1; b < candidates.length; b += 1) {
        const A = candidates[a]!;
        const B = candidates[b]!;
        if (A.dir === B.dir) continue;
        const ov = overlaps(A.lo, A.hi, B.lo, B.hi);
        if (!ov) continue;
        const size = ov.hi - ov.lo;
        if (!best || size > best.size) {
          best = { t0: Math.max(A.t0, B.t0), lo: ov.lo, hi: ov.hi, size };
        }
      }
    }
    if (best) pushZone(best.t0, lastT, best.lo, best.hi, cfg.bprColor, "BPR");
  }

  // —— Order Blocks: one per side; skip if ≈ same as a drawn FVG ———
  if (cfg.showOrderBlocks) {
    const bullOb = [...obs].reverse().find((o) => !o.mitigated && o.dir === 1);
    const bearOb = [...obs].reverse().find((o) => !o.mitigated && o.dir === -1);
    for (const ob of [bullOb, bearOb]) {
      if (!ob) continue;
      const overlapsFvg = fvgDrawn.some(
        (z) => z.dir === ob.dir && overlaps(ob.lo, ob.hi, z.lo, z.hi) != null,
      );
      if (overlapsFvg) continue;
      pushZone(
        ob.t0,
        ob.t1,
        ob.lo,
        ob.hi,
        ob.dir === 1 ? cfg.obBull : cfg.obBear,
        ob.dir === 1 ? "OB+" : "OB−",
      );
    }
  }

  // —— IOF: newest untaken (or latest taken), not stacked on BSL/SSL ———
  if (cfg.showIof) {
    const pick =
      [...inducements].reverse().find((i) => !i.taken) ??
      [...inducements].reverse()[0];
    if (pick && !liqPrices.some((p) => near(p, pick.price))) {
      pushLevel(
        pick.time,
        pick.price,
        cfg.iofColor,
        pick.taken ? "IOF taken" : "IOF",
        2,
        pick.taken ? "solid" : "dashed",
      );
    }
  }

  return out;
}

function clHex(color: string, fallback = "#333333"): string {
  const c = color.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(c)) return c;
  if (/^#[0-9A-Fa-f]{3}$/.test(c)) {
    return `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`;
  }
  return fallback;
}

/** Mentor-specific painter: soft fills, bold borders, readable chip labels. */
export async function paintReplayMentor(
  chart: IChartWidgetApi,
  cmds: readonly DrawCmd[],
  options?: { readonly ownerStudyId?: EntityId },
): Promise<EntityId[]> {
  const ids: EntityId[] = [];
  const limited = cmds.length > 48 ? cmds.slice(cmds.length - 48) : cmds;
  const ownerStudyId = options?.ownerStudyId;
  const common = {
    disableSelection: true,
    disableSave: true,
    disableUndo: true,
    showInObjectsTree: false,
    ...(ownerStudyId ? { ownerStudyId } : {}),
  } as const;
  const styleMap = { solid: 0, dotted: 1, dashed: 2 } as const;

  for (let i = 0; i < limited.length; i += 1) {
    const cmd = limited[i]!;
    const stroke = clHex(cmd.color);
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
              linewidth: Math.max(2, cmd.width ?? 2),
              linestyle: styleMap[cmd.style ?? "solid"],
              showLabel: false,
            },
          },
        );
        if (id) ids.push(id);
      } else if (cmd.kind === "rect" && cmd.t2 != null && cmd.p2 != null) {
        const fillHex = clHex(cmd.fill ?? cmd.color, stroke);
        const r = Number.parseInt(fillHex.slice(1, 3), 16);
        const g = Number.parseInt(fillHex.slice(3, 5), 16);
        const b = Number.parseInt(fillHex.slice(5, 7), 16);
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
              backgroundColor: `rgba(${r}, ${g}, ${b}, 0.12)`,
              fillBackground: true,
              linewidth: 2,
              transparency: 0,
            },
          },
        );
        if (id) ids.push(id);
      } else if (cmd.kind === "label" && (cmd.text ?? "").trim()) {
        const id = await chart.createShape(
          { time: cmd.t1 as never, price: cmd.p1 },
          {
            ...common,
            shape: "text",
            text: ` ${cmd.text!.trim()} `,
            overrides: {
              color: stroke,
              fontsize: 13,
              bold: true,
              fillBackground: true,
              backgroundColor: "rgba(255,255,255,0.92)",
              drawBorder: true,
              borderColor: stroke,
              borderWidth: 1,
            },
          },
        );
        if (id) ids.push(id);
      }
    } catch {
      /* skip bad draw */
    }
    if (i > 0 && i % 4 === 0) {
      await new Promise<void>((r) => {
        window.setTimeout(r, 0);
      });
    }
  }
  return ids;
}
