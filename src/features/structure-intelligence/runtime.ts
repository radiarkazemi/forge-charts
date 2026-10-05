/**
 * Client-side port of Forge Structure Intelligence v1 (`indicators/Forge_Structure_Intelligence_v1.pine`).
 * Charting Library has no Pine compiler — chart-timeframe engine + drawings only.
 * Multi-timeframe scanners from the Pine source are not mirrored here (request.security);
 * use the .pine on TradingView for full MTF dashboard/alerts.
 */

import type { EntityId, IChartWidgetApi } from "@/infrastructure/tradingview";
import { paintOrcaOnChart, type DrawCmd, type OrcaBar } from "@/features/pine/orca-runtime";

export type SiBar = OrcaBar;

export interface SiInputs {
  readonly minorLen: number;
  readonly majorLen: number;
  readonly swingATR: number;
  readonly breakOnWick: boolean;
  readonly sweepLife: number;
  readonly sweepATR: number;
  readonly requireSweep: boolean;
  readonly requireOuter: boolean;
  readonly zoneMode: "FVG then OB" | "FVG only" | "OB only";
  readonly zoneLookback: number;
  readonly gapATR: number;
  readonly displacementATR: number;
  readonly triggerMode: "Micro break" | "Rejection candle";
  readonly confirmWindow: number;
  readonly minScore: number;
  readonly setupLife: number;
  readonly trackedLife: number;
  readonly candidateLimit: number;
  readonly stopATR: number;
  readonly targetR: number;
  readonly maxStopATR: number;
  readonly showPaths: boolean;
  readonly showActive: boolean;
  readonly showHistory: boolean;
  readonly historyLimit: number;
  readonly bullColor: string;
  readonly bearColor: string;
  readonly mintick: number;
}

export const SI_DEFAULTS: SiInputs = {
  minorLen: 3,
  majorLen: 10,
  swingATR: 0.35,
  breakOnWick: false,
  sweepLife: 30,
  sweepATR: 0.05,
  requireSweep: false,
  requireOuter: false,
  zoneMode: "FVG then OB",
  zoneLookback: 30,
  gapATR: 0.08,
  displacementATR: 0.8,
  triggerMode: "Micro break",
  confirmWindow: 8,
  minScore: 65,
  setupLife: 100,
  trackedLife: 250,
  candidateLimit: 12,
  stopATR: 0.15,
  targetR: 3,
  maxStopATR: 5,
  showPaths: true,
  showActive: true,
  showHistory: true,
  /** Keep history markers tiny — full zone boxes for every past setup clutter the chart. */
  historyLimit: 3,
  bullColor: "#00AE8B",
  bearColor: "#E74A5E",
  mintick: 0.01,
};

interface Setup {
  id: number;
  dir: 1 | -1;
  family: number;
  stage: number;
  score: number;
  flags: number;
  bornBar: number;
  bornTime: number;
  touchBar: number | null;
  confirmBar: number | null;
  anchorTime: number;
  levelTime: number;
  anchor: number;
  level: number;
  outer: number | null;
  zlo: number;
  zhi: number;
  stop: number;
  entry: number | null;
  target: number | null;
}

export interface SiSnapshot {
  readonly id: number;
  readonly dir: number;
  readonly family: number;
  readonly stage: number;
  readonly score: number;
  readonly flags: number;
  readonly zlo: number | null;
  readonly zhi: number | null;
  readonly stop: number | null;
  readonly entry: number | null;
  readonly target: number | null;
  readonly bornTime: number | null;
  readonly barTime: number;
  readonly eventDir: number;
  readonly eventId: number;
  readonly eventEntry: number | null;
  readonly eventStop: number | null;
  readonly eventTarget: number | null;
  readonly eventCount: number;
  readonly eventFamily: number;
  readonly anchorTime: number | null;
  readonly levelTime: number | null;
  readonly anchor: number | null;
  readonly level: number | null;
}

export interface SiHistoryEvent {
  readonly bar: number;
  readonly time: number;
  readonly dir: 1 | -1;
  readonly family: number;
  readonly flags: number;
  readonly entry: number;
  readonly stop: number;
  readonly target: number;
  readonly count: number;
  readonly bornTime: number;
  readonly zlo: number;
  readonly zhi: number;
}

export interface SiSwingSeg {
  readonly t1: number;
  readonly p1: number;
  readonly t2: number;
  readonly p2: number;
}

export interface SiResult {
  readonly snapshots: SiSnapshot[];
  readonly history: SiHistoryEvent[];
  readonly swings: SiSwingSeg[];
  readonly last: SiSnapshot | null;
}

function hasFlag(flags: number, bit: number): boolean {
  return Math.floor(flags / bit) % 2 === 1;
}

function addFlag(flags: number, bit: number): number {
  return hasFlag(flags, bit) ? flags : flags + bit;
}

export function siFamilyName(family: number): string {
  switch (family) {
    case 1:
      return "Reversal";
    case 2:
      return "Sweep + reversal";
    case 3:
      return "Stepped / deep";
    case 4:
      return "Continuation";
    case 5:
      return "Nested recovery";
    default:
      return "—";
  }
}

export function siStageName(stage: number): string {
  switch (stage) {
    case 1:
      return "Await retest";
    case 2:
      return "Zone touched";
    case 3:
      return "CONFIRMED";
    case 4:
      return "Target touched";
    case 5:
      return "Stop crossed";
    case 6:
      return "Invalid";
    case 7:
      return "Expired";
    case 8:
      return "Ambiguous bar";
    default:
      return "No active setup";
  }
}

export function siWhy(flags: number): string {
  let result = hasFlag(flags, 8) ? "FVG" : "OB candidate";
  if (hasFlag(flags, 1)) result += " • sweep";
  if (hasFlag(flags, 2)) result += " • impulse";
  if (hasFlag(flags, 4)) result += " • outer break";
  if (hasFlag(flags, 16)) result += " • steps";
  if (hasFlag(flags, 32)) result += " • nested";
  if (hasFlag(flags, 64)) result += " • deep";
  if (hasFlag(flags, 128)) result += " • retest liquidity";
  return result;
}

function scoreFlags(flags: number, reacted: boolean): number {
  return (
    50 +
    (hasFlag(flags, 1) ? 15 : 0) +
    (hasFlag(flags, 2) ? 15 : 0) +
    (hasFlag(flags, 4) ? 10 : 0) +
    (reacted ? 10 : 0)
  );
}

function atrAt(bars: readonly SiBar[], i: number, period = 14): number {
  if (i <= 0) return Math.max(bars[0]!.high - bars[0]!.low, 1e-8);
  const start = Math.max(1, i - period + 1);
  let trSum = 0;
  let n = 0;
  for (let j = start; j <= i; j += 1) {
    const b = bars[j]!;
    const prev = bars[j - 1]!;
    const tr = Math.max(b.high - b.low, Math.abs(b.high - prev.close), Math.abs(b.low - prev.close));
    trSum += tr;
    n += 1;
  }
  return n > 0 ? trSum / n : Math.max(bars[i]!.high - bars[i]!.low, 1e-8);
}

/** Wilder-ish ATR series for pivot filter at lag. */
function atrSeries(bars: readonly SiBar[], period = 14): number[] {
  const out = new Array<number>(bars.length);
  for (let i = 0; i < bars.length; i += 1) out[i] = atrAt(bars, i, period);
  return out;
}

function pivotHigh(bars: readonly SiBar[], i: number, left: number, right: number): number | null {
  if (i < left + right) return null;
  const c = i - right;
  const h = bars[c]!.high;
  for (let j = c - left; j <= c + right; j += 1) {
    if (j === c) continue;
    if (bars[j]!.high >= h) return null;
  }
  return h;
}

function pivotLow(bars: readonly SiBar[], i: number, left: number, right: number): number | null {
  if (i < left + right) return null;
  const c = i - right;
  const l = bars[c]!.low;
  for (let j = c - left; j <= c + right; j += 1) {
    if (j === c) continue;
    if (bars[j]!.low <= l) return null;
  }
  return l;
}

function findZone(
  bars: readonly SiBar[],
  i: number,
  dir: 1 | -1,
  anchorTime: number,
  atr: number,
  inputs: SiInputs,
): { zlo: number; zhi: number; isGap: boolean } | null {
  const look = Math.min(inputs.zoneLookback, i);
  if (inputs.zoneMode !== "OB only") {
    for (let off = 0; off <= look; off += 1) {
      if (i - off - 2 < 0) break;
      const bi = bars[i - off]!;
      const b2 = bars[i - off - 2]!;
      const gap = dir === 1 ? bi.low > b2.high : bi.high < b2.low;
      const gl = dir === 1 ? b2.high : bi.high;
      const gh = dir === 1 ? bi.low : b2.low;
      let valid = gap && b2.time >= anchorTime && gh - gl >= atr * inputs.gapATR;
      if (valid && off > 0) {
        for (let j = 0; j < off; j += 1) {
          const cj = bars[i - j]!.close;
          if ((dir === 1 && cj < gl) || (dir === -1 && cj > gh)) {
            valid = false;
            break;
          }
        }
      }
      const behind = dir === 1 ? gh < bars[i]!.close : gl > bars[i]!.close;
      if (valid && behind) return { zlo: gl, zhi: gh, isGap: true };
    }
  }
  if (inputs.zoneMode !== "FVG only") {
    for (let off = 1; off <= look; off += 1) {
      const bi = bars[i - off]!;
      const opposite = dir === 1 ? bi.close < bi.open : bi.close > bi.open;
      let valid = opposite && bi.time >= anchorTime;
      if (valid) {
        for (let j = 0; j < off; j += 1) {
          const cj = bars[i - j]!.close;
          if ((dir === 1 && cj < bi.low) || (dir === -1 && cj > bi.high)) {
            valid = false;
            break;
          }
        }
      }
      const behind = dir === 1 ? bi.high < bars[i]!.close : bi.low > bars[i]!.close;
      if (valid && behind) return { zlo: bi.low, zhi: bi.high, isGap: false };
    }
  }
  return null;
}

/** Run the Structure Intelligence chart-TF engine over OHLC bars. */
export function computeStructureIntelligence(
  bars: readonly SiBar[],
  partial: Partial<SiInputs> = {},
): SiResult {
  const inputs: SiInputs = { ...SI_DEFAULTS, ...partial };
  const snapshots: SiSnapshot[] = [];
  const history: SiHistoryEvent[] = [];
  const swings: SiSwingSeg[] = [];
  if (bars.length < inputs.majorLen * 2 + 20) {
    return { snapshots, history, swings, last: null };
  }

  const atrs = atrSeries(bars, 14);
  const setups: Setup[] = [];
  let h: number | null = null;
  let l: number | null = null;
  let ht: number | null = null;
  let lt: number | null = null;
  let majorH: number | null = null;
  let majorL: number | null = null;
  let trend = 0;
  let upSteps = 0;
  let downSteps = 0;
  let bullSweepBar: number | null = null;
  let bearSweepBar: number | null = null;
  let lastBullBreak: number | null = null;
  let lastBearBreak: number | null = null;
  let usedHTime: number | null = null;
  let usedLTime: number | null = null;

  let lastMapPrice: number | null = null;
  let lastMapTime: number | null = null;
  let lastMapDir = 0;

  let lastSnap: SiSnapshot | null = null;

  for (let i = 0; i < bars.length; i += 1) {
    const bar = bars[i]!;
    const atr = atrs[i]!;
    const atrLag = atrs[Math.max(0, i - inputs.minorLen)] ?? atr;
    const ph = pivotHigh(bars, i, inputs.minorLen, inputs.minorLen);
    const pl = pivotLow(bars, i, inputs.minorLen, inputs.minorLen);
    const mh = pivotHigh(bars, i, inputs.majorLen, inputs.majorLen);
    const ml = pivotLow(bars, i, inputs.majorLen, inputs.majorLen);

    if (ph != null && (l == null || ph - l >= atrLag * inputs.swingATR)) {
      upSteps = h != null && ph > h ? upSteps + 1 : 0;
      h = ph;
      ht = bars[i - inputs.minorLen]!.time;
    }
    if (pl != null && (h == null || h - pl >= atrLag * inputs.swingATR)) {
      downSteps = l != null && pl < l ? downSteps + 1 : 0;
      l = pl;
      lt = bars[i - inputs.minorLen]!.time;
    }
    if (mh != null) majorH = mh;
    if (ml != null) majorL = ml;

    const previousTrend = trend;
    if (majorH != null && bar.close > majorH) trend = 1;
    if (majorL != null && bar.close < majorL) trend = -1;

    if (l != null && bar.low < l - atr * inputs.sweepATR && bar.close > l) bullSweepBar = i;
    if (h != null && bar.high > h + atr * inputs.sweepATR && bar.close < h) bearSweepBar = i;

    const upProbe = inputs.breakOnWick ? bar.high : bar.close;
    const dnProbe = inputs.breakOnWick ? bar.low : bar.close;
    const prev = i > 0 ? bars[i - 1]! : bar;
    const prevUp = inputs.breakOnWick ? prev.high : prev.close;
    const prevDn = inputs.breakOnWick ? prev.low : prev.close;

    const bullBreak =
      h != null && upProbe > h && prevUp <= h && (usedHTime == null || usedHTime !== ht);
    const bearBreak =
      l != null && dnProbe < l && prevDn >= l && (usedLTime == null || usedLTime !== lt);
    const bullImpulse = bar.close > bar.open && Math.abs(bar.close - bar.open) >= atr * inputs.displacementATR;
    const bearImpulse = bar.close < bar.open && Math.abs(bar.close - bar.open) >= atr * inputs.displacementATR;

    let eventId = 0;
    let eventDir = 0;
    let eventCount = 0;
    let eventScore = -1;
    let eventEntry: number | null = null;
    let eventStop: number | null = null;
    let eventTarget: number | null = null;
    let eventFamily = 0;

    for (const s of setups) {
      if (s.stage <= 2) {
        const outerBroken =
          s.outer != null && (s.dir === 1 ? bar.close > s.outer : bar.close < s.outer);
        if (outerBroken) s.flags = addFlag(s.flags, 4);
        const dead =
          s.dir === 1
            ? bar.low <= s.stop || bar.close < s.zlo
            : bar.high >= s.stop || bar.close > s.zhi;
        if (dead) {
          s.stage = 6;
        } else if (i - s.bornBar > inputs.setupLife) {
          s.stage = 7;
        } else {
          const touch = bar.high >= s.zlo && bar.low <= s.zhi;
          if (touch && i > s.bornBar) {
            s.stage = 2;
            s.touchBar = i;
            const distance = Math.max(Math.abs(s.level - s.anchor), inputs.mintick);
            const depth = s.dir === 1 ? (s.level - bar.low) / distance : (bar.high - s.level) / distance;
            if (depth >= 0.65) {
              s.flags = addFlag(s.flags, 64);
              if (hasFlag(s.flags, 16)) s.family = 3;
            }
            const crossedInternal =
              s.dir === 1
                ? l != null && lt != null && lt > s.bornTime && bar.low < l && bar.close > l
                : h != null && ht != null && ht > s.bornTime && bar.high > h && bar.close < h;
            if (crossedInternal) s.flags = addFlag(s.flags, 128);
          }
          const recentTouch =
            s.stage === 2 && s.touchBar != null && i - s.touchBar <= inputs.confirmWindow;
          const rejection =
            s.dir === 1 ? bar.close > bar.open && bar.close > s.zhi : bar.close < bar.open && bar.close < s.zlo;
          const microBreak = rejection && (s.dir === 1 ? bar.close > prev.high : bar.close < prev.low);
          const trigger = inputs.triggerMode === "Micro break" ? microBreak : rejection;
          s.score = scoreFlags(s.flags, false);
          const readyScore = scoreFlags(s.flags, true);
          const risk = s.dir === 1 ? bar.close - s.stop : s.stop - bar.close;
          const quality =
            readyScore >= inputs.minScore &&
            (!inputs.requireOuter || hasFlag(s.flags, 4)) &&
            risk > inputs.mintick &&
            risk <= atr * inputs.maxStopATR;
          if (recentTouch && trigger && quality) {
            s.stage = 3;
            s.score = readyScore;
            s.entry = bar.close;
            s.target = bar.close + s.dir * risk * inputs.targetR;
            s.confirmBar = i;
            eventCount += 1;
            if (s.score > eventScore) {
              eventScore = s.score;
              eventId = s.id;
              eventDir = s.dir;
              eventEntry = s.entry;
              eventStop = s.stop;
              eventTarget = s.target;
              eventFamily = s.family;
            }
          } else if (s.stage === 2 && !recentTouch) {
            s.stage = 1;
            s.touchBar = null;
          }
        }
      } else if (s.stage === 3 && s.confirmBar != null && i > s.confirmBar) {
        const stopHit = s.dir === 1 ? bar.low <= s.stop : bar.high >= s.stop;
        const targetHit =
          s.target != null && (s.dir === 1 ? bar.high >= s.target : bar.low <= s.target);
        if (stopHit && targetHit) s.stage = 8;
        else if (stopHit) s.stage = 5;
        else if (targetHit) s.stage = 4;
        else if (i - s.confirmBar > inputs.trackedLife) s.stage = 7;
      }
    }

    for (const dir of [1, -1] as const) {
      const broken = dir === 1 ? bullBreak : bearBreak;
      if (!broken) continue;
      const anchorTime = dir === 1 ? lt : ht;
      const anchor = dir === 1 ? l : h;
      const levelTime = dir === 1 ? ht : lt;
      const level = dir === 1 ? h : l;
      if (anchorTime == null || anchor == null || levelTime == null || level == null) {
        if (dir === 1) {
          usedHTime = ht;
          lastBullBreak = i;
        } else {
          usedLTime = lt;
          lastBearBreak = i;
        }
        continue;
      }
      const swept =
        dir === 1
          ? bullSweepBar != null && i - bullSweepBar <= inputs.sweepLife
          : bearSweepBar != null && i - bearSweepBar <= inputs.sweepLife;
      const impulse = dir === 1 ? bullImpulse : bearImpulse;
      const stepped = dir === 1 ? upSteps >= 2 : downSteps >= 2;
      const nested =
        dir === 1
          ? lastBearBreak != null && i - lastBearBreak <= inputs.sweepLife
          : lastBullBreak != null && i - lastBullBreak <= inputs.sweepLife;
      const reversal = previousTrend === -dir;
      const outer = dir === 1 ? majorH : majorL;
      const outerBroken = outer != null && (dir === 1 ? bar.close > outer : bar.close < outer);
      const zone = findZone(bars, i, dir, anchorTime, atr, inputs);
      let duplicate = false;
      for (const old of setups) {
        if (old.dir === dir && old.anchorTime === anchorTime && old.stage <= 3) {
          duplicate = true;
          break;
        }
      }
      if (zone && !duplicate && (!inputs.requireSweep || swept)) {
        const flags =
          (swept ? 1 : 0) +
          (impulse ? 2 : 0) +
          (outerBroken ? 4 : 0) +
          (zone.isGap ? 8 : 0) +
          (stepped ? 16 : 0) +
          (nested ? 32 : 0);
        const family = nested ? 5 : stepped ? 3 : swept ? 2 : reversal ? 1 : 4;
        const stop =
          dir === 1
            ? Math.min(anchor, zone.zlo) - atr * inputs.stopATR
            : Math.max(anchor, zone.zhi) + atr * inputs.stopATR;
        if (setups.length >= inputs.candidateLimit) {
          const removeIndex = setups.findIndex((s) => s.stage > 3);
          if (removeIndex >= 0) setups.splice(removeIndex, 1);
        }
        if (setups.length < inputs.candidateLimit) {
          setups.push({
            id: bar.time * 2 + (dir === 1 ? 0 : 1),
            dir,
            family,
            stage: 1,
            score: scoreFlags(flags, false),
            flags,
            bornBar: i,
            bornTime: bar.time,
            touchBar: null,
            confirmBar: null,
            anchorTime,
            levelTime,
            anchor,
            level,
            outer,
            zlo: zone.zlo,
            zhi: zone.zhi,
            stop,
            entry: null,
            target: null,
          });
        }
      }
      if (dir === 1) {
        usedHTime = ht;
        lastBullBreak = i;
      } else {
        usedLTime = lt;
        lastBearBreak = i;
      }
    }

    let best = -1;
    let bestRank = -1;
    for (let si = 0; si < setups.length; si += 1) {
      const s = setups[si]!;
      const rank =
        s.id === eventId && eventId !== 0
          ? 10000
          : s.stage <= 3
            ? s.score + (s.stage === 2 ? 15 : s.stage === 3 ? 5 : 0)
            : 0;
      if (rank > bestRank || (rank === bestRank && rank >= 0)) {
        best = si;
        bestRank = rank;
      }
    }

    const snap: SiSnapshot =
      best >= 0
        ? (() => {
            const s = setups[best]!;
            return {
              id: s.id,
              dir: s.dir,
              family: s.family,
              stage: s.stage,
              score: s.score,
              flags: s.flags,
              zlo: s.zlo,
              zhi: s.zhi,
              stop: s.stop,
              entry: s.entry,
              target: s.target,
              bornTime: s.bornTime,
              barTime: bar.time,
              eventDir,
              eventId,
              eventEntry,
              eventStop,
              eventTarget,
              eventCount,
              eventFamily,
              anchorTime: s.anchorTime,
              levelTime: s.levelTime,
              anchor: s.anchor,
              level: s.level,
            };
          })()
        : {
            id: 0,
            dir: 0,
            family: 0,
            stage: 0,
            score: 0,
            flags: 0,
            zlo: null,
            zhi: null,
            stop: null,
            entry: null,
            target: null,
            bornTime: null,
            barTime: bar.time,
            eventDir,
            eventId,
            eventEntry,
            eventStop,
            eventTarget,
            eventCount,
            eventFamily,
            anchorTime: null,
            levelTime: null,
            anchor: null,
            level: null,
          };

    snapshots.push(snap);
    lastSnap = snap;

    if (eventDir !== 0 && eventEntry != null && eventStop != null && eventTarget != null) {
      const born = setups.find((s) => s.id === eventId);
      history.push({
        bar: i,
        time: bar.time,
        dir: eventDir as 1 | -1,
        family: eventFamily,
        flags: born?.flags ?? snap.flags,
        entry: eventEntry,
        stop: eventStop,
        target: eventTarget,
        count: eventCount,
        bornTime: born?.bornTime ?? bar.time,
        zlo: born?.zlo ?? snap.zlo ?? eventEntry,
        zhi: born?.zhi ?? snap.zhi ?? eventEntry,
      });
      if (history.length > inputs.historyLimit) history.shift();
    }

    if (inputs.showPaths) {
      for (const k of [0, 1] as const) {
        const p = k === 0 ? ph : pl;
        const dir = k === 0 ? 1 : -1;
        if (p == null) continue;
        const pt = bars[i - inputs.minorLen]!.time;
        const bigEnough =
          lastMapPrice == null || Math.abs(p - lastMapPrice) >= atrLag * inputs.swingATR;
        if (!bigEnough) continue;
        if (lastMapDir === dir) {
          const moreExtreme = dir === 1 ? p > (lastMapPrice ?? p) : p < (lastMapPrice ?? p);
          if (moreExtreme) {
            lastMapPrice = p;
            lastMapTime = pt;
            if (swings.length > 0) {
              const tail = swings[swings.length - 1]!;
              swings[swings.length - 1] = { ...tail, t2: pt, p2: p };
            }
          }
        } else {
          if (lastMapPrice != null && lastMapTime != null && pt > lastMapTime) {
            swings.push({ t1: lastMapTime, p1: lastMapPrice, t2: pt, p2: p });
            if (swings.length > 100) swings.shift();
          }
          lastMapPrice = p;
          lastMapTime = pt;
          lastMapDir = dir;
        }
      }
    }
  }

  return { snapshots, history, swings, last: lastSnap };
}

/** Convert engine output into clear CL drawings (active setup first, quiet history). */
export function structureIntelligenceDrawCmds(
  result: SiResult,
  inputs: Partial<SiInputs> = {},
  lastBarTime?: number,
): DrawCmd[] {
  const cfg = { ...SI_DEFAULTS, ...inputs };
  const cmds: DrawCmd[] = [];
  const endT = lastBarTime ?? result.last?.barTime ?? 0;
  const active = result.last;

  // 1) Swing map — recent structure only, muted (not the main story).
  if (cfg.showPaths) {
    const recent = result.swings.slice(-24);
    for (const seg of recent) {
      cmds.push({
        kind: "line",
        t1: seg.t1,
        p1: seg.p1,
        t2: seg.t2,
        p2: seg.p2,
        color: "#5B6575",
        width: 1,
        style: "solid",
      });
    }
  }

  // 2) History — markers at confirmation only (no stacked zone boxes to live edge).
  if (cfg.showHistory) {
    const lim = Math.max(0, Math.floor(cfg.historyLimit));
    const hist = lim > 0 ? result.history.slice(-lim) : [];
    for (const ev of hist) {
      // Skip the live selected setup — it is drawn as the active zone below.
      if (
        active &&
        active.id !== 0 &&
        active.stage <= 3 &&
        active.bornTime === ev.bornTime &&
        active.dir === ev.dir
      ) {
        continue;
      }
      const c = ev.dir === 1 ? cfg.bullColor : cfg.bearColor;
      const tag = ev.dir === 1 ? "BUY" : "SELL";
      cmds.push({
        kind: "dot",
        t1: ev.time,
        p1: ev.entry,
        color: c,
        text: `${tag} · ${siFamilyName(ev.family)}`,
      });
    }
  }

  // 3) Active candidate — ONE zone + one status card (Pine: selected setup only).
  if (
    cfg.showActive &&
    active &&
    active.id !== 0 &&
    active.stage >= 1 &&
    active.stage <= 3 &&
    active.zlo != null &&
    active.zhi != null &&
    active.bornTime != null
  ) {
    const bull = active.dir === 1;
    const c = bull ? cfg.bullColor : cfg.bearColor;
    const side = bull ? "BULL" : "BEAR";

    cmds.push({
      kind: "rect",
      t1: active.bornTime,
      p1: active.zhi,
      t2: endT,
      p2: active.zlo,
      color: c,
      fill: c,
    });

    // Midline of the reaction zone (EQ of the FVG/OB — not a fib stack).
    const mid = (active.zlo + active.zhi) / 2;
    cmds.push({
      kind: "line",
      t1: active.bornTime,
      p1: mid,
      t2: endT,
      p2: mid,
      color: c,
      width: 1,
      style: "dotted",
      text: "Zone mid",
    });

    if (active.stop != null) {
      cmds.push({
        kind: "line",
        t1: active.bornTime,
        p1: active.stop,
        t2: endT,
        p2: active.stop,
        color: c,
        width: 2,
        style: "dashed",
        text: "Stop",
      });
    }

    // Confirmed: show entry + projected target for the live setup only.
    if (active.stage === 3 && active.entry != null && active.target != null) {
      cmds.push({
        kind: "line",
        t1: active.bornTime,
        p1: active.entry,
        t2: endT,
        p2: active.entry,
        color: c,
        width: 2,
        style: "solid",
        text: "Entry",
      });
      cmds.push({
        kind: "line",
        t1: active.bornTime,
        p1: active.target,
        t2: endT,
        p2: active.target,
        color: c,
        width: 1,
        style: "dotted",
        text: `${cfg.targetR}R target`,
      });
    }

    if (active.level != null && active.levelTime != null) {
      cmds.push({
        kind: "line",
        t1: active.levelTime,
        p1: active.level,
        t2: active.bornTime,
        p2: active.level,
        color: c,
        width: 1,
        style: "dotted",
        text: "Break level",
      });
    }

    cmds.push({
      kind: "dot",
      t1: endT,
      p1: bull ? active.zhi : active.zlo,
      color: c,
      text: `${side} · ${siFamilyName(active.family)} · ${siStageName(active.stage)} · ${active.score}/100 · ${siWhy(active.flags)}`,
    });
  }

  return cmds;
}

export async function paintStructureIntelligence(
  chart: IChartWidgetApi,
  cmds: readonly DrawCmd[],
  options?: { readonly ownerStudyId?: EntityId },
): Promise<EntityId[]> {
  return paintOrcaOnChart(chart, cmds, options);
}
