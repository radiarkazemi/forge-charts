/**
 * Forge Trading Assistant — Phase 1
 *
 * Confluence engine for Buy/Sell with Entry · SL · TP (R:R):
 *   1. Structure: BOS / MSS (market structure shift)
 *   2. POI: Order Block and/or Fair Value Gap left by the impulse
 *   3. Trigger: rejection candle back into the POI with the structure bias
 *
 * Paint via DrawCmd → paintOrcaOnChart (same path as SI / Mentor).
 */

import type { EntityId, IChartWidgetApi } from "@/infrastructure/tradingview";
import { paintOrcaOnChart, type DrawCmd, type OrcaBar } from "@/features/pine/orca-runtime";

export type FtaBar = OrcaBar;

export interface FtaInputs {
  readonly swingLeft: number;
  readonly swingRight: number;
  /** Target reward multiple of risk (e.g. 2 = 1:2). */
  readonly targetR: number;
  /** Prefer MSS (reversal) over continuation BOS when both qualify. */
  readonly preferMss: boolean;
  readonly useOrderBlock: boolean;
  readonly useFvg: boolean;
  readonly requireRejection: boolean;
  /** Max simultaneous live + recent signals drawn. */
  readonly maxSignals: number;
  readonly showZones: boolean;
  readonly showStructure: boolean;
  readonly showHistory: boolean;
  readonly bullColor: string;
  readonly bearColor: string;
  readonly tpColor: string;
  readonly slColor: string;
}

export const FTA_DEFAULTS: FtaInputs = {
  swingLeft: 2,
  swingRight: 2,
  targetR: 2,
  preferMss: true,
  useOrderBlock: true,
  useFvg: true,
  requireRejection: true,
  maxSignals: 6,
  showZones: true,
  showStructure: true,
  showHistory: true,
  bullColor: "#00C853",
  bearColor: "#FF1744",
  tpColor: "#26A69A",
  slColor: "#EF5350",
};

export interface FtaSignal {
  readonly dir: 1 | -1;
  readonly kind: "MSS" | "BOS";
  readonly reason: string;
  readonly time: number;
  readonly bornTime: number;
  readonly entry: number;
  readonly stop: number;
  readonly target: number;
  readonly risk: number;
  readonly reward: number;
  readonly rr: number;
  readonly zlo: number;
  readonly zhi: number;
  readonly structurePrice: number;
  /** Still open (not hit SL/TP on later bars). */
  readonly active: boolean;
  readonly outcome: "open" | "tp" | "sl";
}

export interface FtaResult {
  readonly signals: readonly FtaSignal[];
  readonly structureLines: readonly {
    readonly kind: "MSS" | "BOS";
    readonly dir: 1 | -1;
    readonly t1: number;
    readonly t2: number;
    readonly price: number;
  }[];
}

interface Swing {
  idx: number;
  time: number;
  price: number;
  kind: "high" | "low";
  broken: boolean;
}

interface Zone {
  dir: 1 | -1;
  kind: "OB" | "FVG";
  t0: number;
  t1: number;
  lo: number;
  hi: number;
  structure: "MSS" | "BOS";
  structurePrice: number;
  used: boolean;
}

function pivotHigh(bars: readonly FtaBar[], i: number, left: number, right: number): number | null {
  const pivotIdx = i - right;
  if (pivotIdx < left || i >= bars.length) return null;
  const h = bars[pivotIdx]!.high;
  for (let j = pivotIdx - left; j <= pivotIdx + right; j += 1) {
    if (j === pivotIdx) continue;
    if (bars[j]!.high >= h) return null;
  }
  return h;
}

function pivotLow(bars: readonly FtaBar[], i: number, left: number, right: number): number | null {
  const pivotIdx = i - right;
  if (pivotIdx < left || i >= bars.length) return null;
  const l = bars[pivotIdx]!.low;
  for (let j = pivotIdx - left; j <= pivotIdx + right; j += 1) {
    if (j === pivotIdx) continue;
    if (bars[j]!.low <= l) return null;
  }
  return l;
}

function atrApprox(bars: readonly FtaBar[], i: number, len = 14): number {
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
  return n > 0 ? sum / n : Math.max(bars[i]!.high - bars[i]!.low, 1e-8);
}

function isBull(b: FtaBar): boolean {
  return b.close >= b.open;
}

function bodyOf(b: FtaBar): number {
  return Math.abs(b.close - b.open);
}

function touchesZone(bar: FtaBar, z: Zone): boolean {
  return bar.low <= z.hi && bar.high >= z.lo;
}

function bullRejection(bar: FtaBar, z: Zone, atr: number): boolean {
  if (!isBull(bar)) return false;
  if (!touchesZone(bar, z)) return false;
  // Close in upper half of zone or above mid; wick into zone.
  const mid = (z.lo + z.hi) / 2;
  const lowerWick = Math.min(bar.open, bar.close) - bar.low;
  return bar.close >= mid && (lowerWick >= atr * 0.15 || bar.close > z.hi * 0.999);
}

function bearRejection(bar: FtaBar, z: Zone, atr: number): boolean {
  if (isBull(bar)) return false;
  if (!touchesZone(bar, z)) return false;
  const mid = (z.lo + z.hi) / 2;
  const upperWick = bar.high - Math.max(bar.open, bar.close);
  return bar.close <= mid && (upperWick >= atr * 0.15 || bar.close < z.lo * 1.001);
}

/**
 * Phase 1 signal engine — BOS/MSS → OB/FVG → rejection → Entry/SL/TP.
 */
export function computeTradingAssistant(
  bars: readonly FtaBar[],
  inputs: Partial<FtaInputs> = {},
): FtaResult {
  const cfg: FtaInputs = { ...FTA_DEFAULTS, ...inputs };
  const empty: FtaResult = { signals: [], structureLines: [] };
  const left = Math.max(1, Math.floor(cfg.swingLeft));
  const right = Math.max(1, Math.floor(cfg.swingRight));
  if (bars.length < left + right + 20) return empty;

  const swings: Swing[] = [];
  const zones: Zone[] = [];
  const structureLines: FtaResult["structureLines"][number][] = [];
  type MutableSignal = {
    -readonly [K in keyof FtaSignal]: FtaSignal[K];
  };
  const signals: MutableSignal[] = [];

  let lastSH: Swing | null = null;
  let lastSL: Swing | null = null;
  let structureDir = 0;
  let lastOppositeBearIdx: number | null = null;
  let lastOppositeBullIdx: number | null = null;

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
      };
      swings.push(sw);
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
      };
      swings.push(sw);
      lastSL = sw;
    }

    const preStructure = structureDir;
    const bullBreak = lastSH != null && !lastSH.broken && bar.close > lastSH.price;
    const bearBreak = lastSL != null && !lastSL.broken && bar.close < lastSL.price;

    if (bullBreak && lastSH) {
      const isMss = preStructure === -1;
      const kind: "MSS" | "BOS" = isMss ? "MSS" : "BOS";
      structureLines.push({
        kind,
        dir: 1,
        t1: lastSH.time,
        t2: bar.time,
        price: lastSH.price,
      });
      lastSH.broken = true;
      structureDir = 1;

      if (cfg.useOrderBlock && lastOppositeBearIdx != null && lastOppositeBearIdx < i) {
        const obBar = bars[lastOppositeBearIdx]!;
        zones.push({
          dir: 1,
          kind: "OB",
          t0: obBar.time,
          t1: bar.time,
          lo: obBar.low,
          hi: Math.max(obBar.high, obBar.open, obBar.close),
          structure: kind,
          structurePrice: lastSH.price,
          used: false,
        });
      }
      if (cfg.useFvg && i >= 2) {
        const b0 = bars[i - 2]!;
        const b1 = bars[i - 1]!;
        const minGap = atr * 0.1;
        if (bar.low - b0.high > minGap && bodyOf(b1) > atr * 0.3) {
          zones.push({
            dir: 1,
            kind: "FVG",
            t0: b0.time,
            t1: bar.time,
            lo: b0.high,
            hi: bar.low,
            structure: kind,
            structurePrice: lastSH.price,
            used: false,
          });
        }
      }
    }

    if (bearBreak && lastSL) {
      const isMss = preStructure === 1;
      const kind: "MSS" | "BOS" = isMss ? "MSS" : "BOS";
      structureLines.push({
        kind,
        dir: -1,
        t1: lastSL.time,
        t2: bar.time,
        price: lastSL.price,
      });
      lastSL.broken = true;
      structureDir = -1;

      if (cfg.useOrderBlock && lastOppositeBullIdx != null && lastOppositeBullIdx < i) {
        const obBar = bars[lastOppositeBullIdx]!;
        zones.push({
          dir: -1,
          kind: "OB",
          t0: obBar.time,
          t1: bar.time,
          lo: Math.min(obBar.low, obBar.open, obBar.close),
          hi: obBar.high,
          structure: kind,
          structurePrice: lastSL.price,
          used: false,
        });
      }
      if (cfg.useFvg && i >= 2) {
        const b0 = bars[i - 2]!;
        const b1 = bars[i - 1]!;
        const minGap = atr * 0.1;
        if (b0.low - bar.high > minGap && bodyOf(b1) > atr * 0.3) {
          zones.push({
            dir: -1,
            kind: "FVG",
            t0: b0.time,
            t1: bar.time,
            lo: bar.high,
            hi: b0.low,
            structure: kind,
            structurePrice: lastSL.price,
            used: false,
          });
        }
      }
    }

    // Invalidate zones that price closed through (mitigated).
    for (const z of zones) {
      if (z.used) continue;
      if (z.dir === 1 && bar.close < z.lo) z.used = true;
      if (z.dir === -1 && bar.close > z.hi) z.used = true;
    }

    // Trigger: rejection into unused zone aligned with structure bias.
    // Prefer unused zones created after the latest structure event.
    const candidates = zones.filter((z) => !z.used && z.dir === structureDir);
    if (candidates.length === 0) continue;

    // Prefer MSS zones when preferMss; else newest zone.
    candidates.sort((a, b) => {
      if (cfg.preferMss && a.structure !== b.structure) {
        if (a.structure === "MSS") return -1;
        if (b.structure === "MSS") return 1;
      }
      return b.t1 - a.t1;
    });

    for (const z of candidates.slice(0, 3)) {
      const ok = cfg.requireRejection
        ? z.dir === 1
          ? bullRejection(bar, z, atr)
          : bearRejection(bar, z, atr)
        : touchesZone(bar, z) && (z.dir === 1 ? isBull(bar) : !isBull(bar));
      if (!ok) continue;

      // One signal per zone.
      z.used = true;

      const entry = bar.close;
      const pad = atr * 0.08;
      const stop = z.dir === 1 ? z.lo - pad : z.hi + pad;
      const risk = Math.abs(entry - stop);
      if (risk < atr * 0.15) continue; // noise
      const rr = Math.max(1, cfg.targetR);
      const reward = risk * rr;
      const target = z.dir === 1 ? entry + reward : entry - reward;

      const reasonParts = [`${z.structure}`, z.kind];
      if (cfg.requireRejection) reasonParts.push("Reject");

      signals.push({
        dir: z.dir,
        kind: z.structure,
        reason: reasonParts.join("+"),
        time: bar.time,
        bornTime: z.t0,
        entry,
        stop,
        target,
        risk,
        reward,
        rr,
        zlo: z.lo,
        zhi: z.hi,
        structurePrice: z.structurePrice,
        active: true,
        outcome: "open",
      });
      break; // one new signal per bar
    }

    // Resolve open signals against later bars.
    for (const s of signals) {
      if (!s.active) continue;
      if (s.time >= bar.time) continue;
      if (s.dir === 1) {
        if (bar.low <= s.stop) {
          s.active = false;
          s.outcome = "sl";
        } else if (bar.high >= s.target) {
          s.active = false;
          s.outcome = "tp";
        }
      } else {
        if (bar.high >= s.stop) {
          s.active = false;
          s.outcome = "sl";
        } else if (bar.low <= s.target) {
          s.active = false;
          s.outcome = "tp";
        }
      }
    }
  }

  const maxN = Math.max(1, Math.min(24, Math.floor(cfg.maxSignals)));
  return {
    signals: signals.slice(-maxN),
    structureLines: structureLines.slice(-Math.max(4, maxN)),
  };
}

/** Build chart drawings for Phase 1 signals. */
export function tradingAssistantDrawCmds(
  result: FtaResult,
  inputs: Partial<FtaInputs> = {},
  lastBarTime?: number,
): DrawCmd[] {
  const cfg: FtaInputs = { ...FTA_DEFAULTS, ...inputs };
  const cmds: DrawCmd[] = [];
  const endT = lastBarTime ?? 0;

  if (cfg.showStructure) {
    for (const ev of result.structureLines) {
      const c = ev.kind === "MSS" ? "#00BCD4" : "#FF9800";
      cmds.push({
        kind: "line",
        t1: ev.t1,
        p1: ev.price,
        t2: ev.t2,
        p2: ev.price,
        color: c,
        width: ev.kind === "MSS" ? 2 : 1,
        style: ev.kind === "MSS" ? "solid" : "dashed",
        text: `${ev.kind} ${ev.dir === 1 ? "▲" : "▼"}`,
      });
    }
  }

  for (const s of result.signals) {
    if (!cfg.showHistory && !s.active) continue;
    const bull = s.dir === 1;
    const c = bull ? cfg.bullColor : cfg.bearColor;
    const tag = bull ? "BUY" : "SELL";
    const t2 = s.active && endT > s.time ? endT : s.time;
    const extend = Math.max(t2, s.time);

    if (cfg.showZones) {
      cmds.push({
        kind: "rect",
        t1: s.bornTime,
        p1: s.zhi,
        t2: extend,
        p2: s.zlo,
        color: c,
        fill: c,
      });
    }

    cmds.push({
      kind: "line",
      t1: s.time,
      p1: s.entry,
      t2: extend,
      p2: s.entry,
      color: c,
      width: 2,
      style: "solid",
      text: "Entry",
    });
    cmds.push({
      kind: "line",
      t1: s.time,
      p1: s.stop,
      t2: extend,
      p2: s.stop,
      color: cfg.slColor,
      width: 2,
      style: "dashed",
      text: "SL",
    });
    cmds.push({
      kind: "line",
      t1: s.time,
      p1: s.target,
      t2: extend,
      p2: s.target,
      color: cfg.tpColor,
      width: 2,
      style: "dotted",
      text: `TP 1:${s.rr}`,
    });

    const status =
      s.outcome === "open" ? "LIVE" : s.outcome === "tp" ? "TP✓" : "SL✗";
    cmds.push({
      kind: "dot",
      t1: s.time,
      p1: s.entry,
      color: c,
      text: `${tag} · 1:${s.rr} · ${s.reason} · ${status}`,
    });
  }

  return cmds;
}

export async function paintTradingAssistant(
  chart: IChartWidgetApi,
  cmds: readonly DrawCmd[],
  options?: { readonly ownerStudyId?: EntityId },
): Promise<EntityId[]> {
  return paintOrcaOnChart(chart, cmds, options);
}
