/**
 * Forge Certainty — strict ICT/SMC signal core.
 *
 * Unlike Forge Trading Assistant (which can emit on soft DR wick reactions),
 * Certainty only fires on Structure-Intelligence confirmations that also clear
 * Dealing-Range bias + entry-half / OTE gates, then paints FTA-grade trade UI.
 */

import type { EntityId, IChartWidgetApi } from "@/infrastructure/tradingview";
import {
  computeOrcaAnalysis,
  lastConfirmedDealingRangeAt,
  inDrEntryHalf,
  touchesDrOte,
  paintOrcaOnChart,
  type ConfirmedDealingRange,
  type DrawCmd,
  type OrcaBar,
  type OrcaInputs,
} from "@/features/pine/orca-runtime";
import {
  computeStructureIntelligence,
  siFamilyName,
  siWhy,
  type SiHistoryEvent,
  type SiInputs,
  type SiResult,
  SI_DEFAULTS,
} from "@/features/structure-intelligence/runtime";

export type CertaintyBar = OrcaBar;

export interface CertaintyInputs {
  /** 0=Auto (DR+SI), 1=Long only, 2=Short only */
  readonly biasMode: number;
  readonly minScore: number;
  readonly targetR: number;
  readonly requireDrBias: boolean;
  readonly requireEntryHalf: boolean;
  readonly requireOte: boolean;
  readonly requireFvg: boolean;
  readonly firstTouchOnly: boolean;
  readonly withTrend: boolean;
  readonly cooldownBars: number;
  readonly maxSignals: number;
  readonly maxSignalsPerDay: number;
  readonly showDealingRange: boolean;
  readonly showZones: boolean;
  readonly showTradeBox: boolean;
  readonly showAwaiting: boolean;
  readonly showHistory: boolean;
  readonly showScore: boolean;
  readonly historyLimit: number;
  readonly bullColor: string;
  readonly bearColor: string;
  readonly accentColor: string;
  readonly longBoxColor: string;
  readonly shortBoxColor: string;
  readonly boxOpacity: number;
  readonly mintick: number;
}

export const CERTAINTY_DEFAULTS: CertaintyInputs = {
  biasMode: 0,
  minScore: 78,
  targetR: 3,
  requireDrBias: true,
  requireEntryHalf: true,
  requireOte: false,
  requireFvg: true,
  firstTouchOnly: true,
  withTrend: true,
  cooldownBars: 8,
  maxSignals: 10,
  maxSignalsPerDay: 4,
  showDealingRange: true,
  showZones: true,
  showTradeBox: true,
  showAwaiting: true,
  showHistory: true,
  showScore: true,
  historyLimit: 8,
  bullColor: "#12B886",
  bearColor: "#F06595",
  accentColor: "#845EF7",
  longBoxColor: "#12B886",
  shortBoxColor: "#FA5252",
  boxOpacity: 22,
  mintick: 0.01,
};

export type CertaintyOutcome = "open" | "tp" | "sl";

export interface CertaintySignal {
  readonly id: number;
  readonly time: number;
  readonly dir: 1 | -1;
  readonly entry: number;
  readonly stop: number;
  readonly target: number;
  readonly zlo: number;
  readonly zhi: number;
  readonly bornTime: number;
  readonly score: number;
  readonly family: number;
  readonly why: string;
  readonly candleLow: number;
  readonly candleHigh: number;
  readonly labelPrice: number;
  readonly active: boolean;
  readonly outcome: CertaintyOutcome;
}

export interface CertaintyAwaiting {
  readonly dir: 1 | -1;
  readonly stage: number;
  readonly score: number;
  readonly family: number;
  readonly why: string;
  readonly zlo: number;
  readonly zhi: number;
  readonly stop: number;
  readonly entry: number | null;
  readonly target: number | null;
  readonly bornTime: number;
  readonly barTime: number;
}

export interface CertaintyResult {
  readonly signals: CertaintySignal[];
  readonly awaiting: CertaintyAwaiting | null;
  readonly lastDealingRange: ConfirmedDealingRange | null;
  readonly si: SiResult;
}

function normalizeHex(raw: string, fallback: string): string {
  const s = String(raw || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s;
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    const r = s[1]!;
    const g = s[2]!;
    const b = s[3]!;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return fallback;
}

function utcDayKey(tsSec: number): number {
  return Math.floor(tsSec / 86_400);
}

function siInputsFromCertainty(cfg: CertaintyInputs): Partial<SiInputs> {
  return {
    ...SI_DEFAULTS,
    minScore: cfg.minScore,
    targetR: cfg.targetR,
    requireFvg: cfg.requireFvg,
    firstTouchOnly: cfg.firstTouchOnly,
    withTrend: cfg.withTrend,
    requireImpulse: true,
    requireImpulseOrSweep: true,
    requireOuter: true,
    skipNested: true,
    zoneMode: cfg.requireFvg ? "FVG then OB" : "FVG then OB",
    triggerMode: "Rejection candle",
    historyLimit: Math.max(cfg.historyLimit, 6),
    showPaths: false,
    showActive: true,
    showHistory: true,
    mintick: cfg.mintick,
    bullColor: cfg.bullColor,
    bearColor: cfg.bearColor,
  };
}

function orcaRangesInputs(): OrcaInputs {
  return {
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
    drAhead: 12,
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
    maxDealingRanges: 6,
    fromTimeSec: null,
    toTimeSec: null,
    rangesOnly: true,
  };
}

function passesDrGates(
  bar: CertaintyBar,
  dir: 1 | -1,
  dr: ConfirmedDealingRange | null,
  cfg: CertaintyInputs,
): boolean {
  if (!cfg.requireDrBias && !cfg.requireEntryHalf && !cfg.requireOte) return true;
  if (!dr) return !cfg.requireDrBias && !cfg.requireEntryHalf && !cfg.requireOte;
  const drDir: 1 | -1 = dr.bullish ? 1 : -1;
  if (cfg.requireDrBias && drDir !== dir) return false;
  if (cfg.requireEntryHalf && !inDrEntryHalf(bar, dr)) return false;
  if (cfg.requireOte && !touchesDrOte(bar, dr)) return false;
  return true;
}

function resolveOutcome(
  bars: readonly CertaintyBar[],
  fromBar: number,
  dir: 1 | -1,
  stop: number,
  target: number,
): { outcome: CertaintyOutcome; active: boolean } {
  for (let i = fromBar + 1; i < bars.length; i += 1) {
    const b = bars[i]!;
    if (dir === 1) {
      if (b.low <= stop) return { outcome: "sl", active: false };
      if (b.high >= target) return { outcome: "tp", active: false };
    } else {
      if (b.high >= stop) return { outcome: "sl", active: false };
      if (b.low <= target) return { outcome: "tp", active: false };
    }
  }
  return { outcome: "open", active: true };
}

function buildSignal(
  ev: SiHistoryEvent,
  bars: readonly CertaintyBar[],
  id: number,
  score: number,
): CertaintySignal {
  const bar = bars[ev.bar]!;
  const resolved = resolveOutcome(bars, ev.bar, ev.dir, ev.stop, ev.target);
  const labelPrice =
    ev.dir === 1 ? Math.min(bar.low, ev.entry) * 0.9996 : Math.max(bar.high, ev.entry) * 1.0004;
  return {
    id,
    time: ev.time,
    dir: ev.dir,
    entry: ev.entry,
    stop: ev.stop,
    target: ev.target,
    zlo: ev.zlo,
    zhi: ev.zhi,
    bornTime: ev.bornTime,
    score,
    family: ev.family,
    why: siWhy(ev.flags),
    candleLow: bar.low,
    candleHigh: bar.high,
    labelPrice,
    active: resolved.active,
    outcome: resolved.outcome,
  };
}

/** Core: SI confirmations filtered by DR bias + entry quality. */
export function computeCertainty(
  bars: readonly CertaintyBar[],
  inputs: Partial<CertaintyInputs> = {},
): CertaintyResult {
  const cfg: CertaintyInputs = { ...CERTAINTY_DEFAULTS, ...inputs };
  if (bars.length < 80) {
    return {
      signals: [],
      awaiting: null,
      lastDealingRange: null,
      si: { snapshots: [], history: [], swings: [], last: null },
    };
  }

  const si = computeStructureIntelligence(bars, siInputsFromCertainty(cfg));
  const orca = computeOrcaAnalysis(bars, orcaRangesInputs());
  const ranges = orca.ranges ?? [];

  const signals: CertaintySignal[] = [];
  let lastEmitBar = -10_000;
  const dayCounts = new Map<number, number>();
  let nextId = 1;

  // Score map from snapshots near confirmation times.
  const scoreByTime = new Map<number, number>();
  for (const snap of si.snapshots) {
    if (snap.eventId && snap.eventDir && snap.barTime) {
      scoreByTime.set(snap.barTime, snap.score);
    }
  }

  for (const ev of si.history) {
    const score = scoreByTime.get(ev.time) ?? 70 + (ev.family === 3 ? 10 : 0);
    if (score < cfg.minScore) continue;

    if (cfg.biasMode === 1 && ev.dir !== 1) continue;
    if (cfg.biasMode === 2 && ev.dir !== -1) continue;

    const bar = bars[ev.bar];
    if (!bar) continue;
    const dr = lastConfirmedDealingRangeAt(ranges, ev.bar);
    if (!passesDrGates(bar, ev.dir, dr, cfg)) continue;

    if (ev.bar - lastEmitBar < cfg.cooldownBars) continue;
    const day = utcDayKey(ev.time);
    const used = dayCounts.get(day) ?? 0;
    if (used >= cfg.maxSignalsPerDay) continue;

    const risk = Math.abs(ev.entry - ev.stop);
    if (!(risk > 0) || !Number.isFinite(ev.target)) continue;

    signals.push(buildSignal(ev, bars, nextId++, score));
    lastEmitBar = ev.bar;
    dayCounts.set(day, used + 1);
  }

  // Keep newest N
  const trimmed = signals.slice(-Math.max(1, cfg.maxSignals));

  // Live awaiting / confirmed-not-yet-history setup from SI tip.
  let awaiting: CertaintyAwaiting | null = null;
  const tip = si.last;
  if (
    tip &&
    tip.id > 0 &&
    tip.stage >= 1 &&
    tip.stage <= 3 &&
    tip.zlo != null &&
    tip.zhi != null &&
    tip.stop != null &&
    tip.dir !== 0
  ) {
    const alreadyLive = trimmed.some((s) => s.active && s.dir === tip.dir);
    if (!alreadyLive && tip.score >= Math.max(50, cfg.minScore - 15)) {
      const tipDir = tip.dir === 1 ? 1 : -1;
      const biasOk =
        cfg.biasMode === 0 ||
        (cfg.biasMode === 1 && tipDir === 1) ||
        (cfg.biasMode === 2 && tipDir === -1);
      const tipDr = lastConfirmedDealingRangeAt(ranges, bars.length - 1);
      const drOk =
        !cfg.requireDrBias ||
        (tipDr != null && (tipDr.bullish ? 1 : -1) === tipDir);
      if (biasOk && drOk) {
        awaiting = {
          dir: tipDir,
          stage: tip.stage,
          score: tip.score,
          family: tip.family,
          why: siWhy(tip.flags),
          zlo: tip.zlo,
          zhi: tip.zhi,
          stop: tip.stop,
          entry: tip.entry,
          target: tip.target,
          bornTime: tip.bornTime ?? tip.barTime,
          barTime: tip.barTime,
        };
      }
    }
  }

  const lastDr = lastConfirmedDealingRangeAt(ranges, bars.length - 1);

  return {
    signals: trimmed,
    awaiting,
    lastDealingRange: lastDr,
    si,
  };
}

function pillText(s: CertaintySignal, showScore: boolean): string {
  const tag = s.dir === 1 ? "BUY" : "SELL";
  const score = showScore && s.score > 0 ? ` · ${Math.round(s.score)}` : "";
  if (s.outcome === "tp") return `${tag}${score} · TP hit`;
  if (s.outcome === "sl") return `${tag}${score} · SL hit`;
  return `${tag}${score} · LIVE`;
}

function awaitingPill(a: CertaintyAwaiting): string {
  const tag = a.dir === 1 ? "LONG" : "SHORT";
  const stage =
    a.stage === 1 ? "WAIT" : a.stage === 2 ? "TOUCH" : a.stage === 3 ? "READY" : "SET";
  return `${tag} · ${stage} · ${Math.round(a.score)}`;
}

/** Premium chart paint: DR halves + POI zones + native position + pills. */
export function certaintyDrawCmds(
  result: CertaintyResult,
  inputs: Partial<CertaintyInputs> = {},
  lastBarTime?: number,
): DrawCmd[] {
  const cfg: CertaintyInputs = { ...CERTAINTY_DEFAULTS, ...inputs };
  const cmds: DrawCmd[] = [];
  const endT = lastBarTime ?? 0;
  const bull = normalizeHex(cfg.bullColor, CERTAINTY_DEFAULTS.bullColor);
  const bear = normalizeHex(cfg.bearColor, CERTAINTY_DEFAULTS.bearColor);
  const accent = normalizeHex(cfg.accentColor, CERTAINTY_DEFAULTS.accentColor);
  const targetFill = normalizeHex(cfg.longBoxColor, CERTAINTY_DEFAULTS.longBoxColor);
  const stopFill = normalizeHex(cfg.shortBoxColor, CERTAINTY_DEFAULTS.shortBoxColor);
  const boxAlpha = Math.max(0.12, Math.min(0.4, Number(cfg.boxOpacity) / 100));
  const zoneAlpha = Math.max(0.05, boxAlpha * 0.65);

  if (cfg.showDealingRange && result.lastDealingRange) {
    const dr = result.lastDealingRange;
    const t2 = Math.max(endT, dr.t1);
    cmds.push({
      kind: "rect",
      t1: dr.t0,
      p1: dr.top,
      t2,
      p2: dr.mid,
      color: "#FF6B6B",
      fill: "#FF6B6B",
      fillAlpha: 0.1,
      borderWidth: 1,
      style: "solid",
    });
    cmds.push({
      kind: "rect",
      t1: dr.t0,
      p1: dr.mid,
      t2,
      p2: dr.bot,
      color: "#51CF66",
      fill: "#51CF66",
      fillAlpha: 0.1,
      borderWidth: 1,
      style: "solid",
    });
    cmds.push({
      kind: "line",
      t1: dr.t0,
      p1: dr.mid,
      t2,
      p2: dr.mid,
      color: "#FF6B6B",
      width: 2,
      style: "dashed",
      text: `${dr.bullish ? "DR ↑" : "DR ↓"}  EQ`,
    });
    cmds.push({
      kind: "line",
      t1: dr.t0,
      p1: dr.ote618,
      t2,
      p2: dr.ote618,
      color: "#B2F2BB",
      width: 1,
      style: "dotted",
      text: "0.618",
    });
    cmds.push({
      kind: "line",
      t1: dr.t0,
      p1: dr.ote786,
      t2,
      p2: dr.ote786,
      color: "#99E9F2",
      width: 1,
      style: "dotted",
      text: "0.786",
    });
    cmds.push({
      kind: "label",
      t1: dr.t1,
      p1: (dr.top + dr.mid) / 2,
      color: "#FF6B6B",
      fill: "#FF6B6B",
      text: "Premium",
    });
    cmds.push({
      kind: "label",
      t1: dr.t1,
      p1: (dr.bot + dr.mid) / 2,
      color: "#51CF66",
      fill: "#51CF66",
      text: "Discount",
    });
  }

  // Awaiting POI (pre-confirmation) — soft violet frame + status pill.
  if (cfg.showAwaiting && result.awaiting) {
    const a = result.awaiting;
    const col = a.dir === 1 ? bull : bear;
    cmds.push({
      kind: "rect",
      t1: a.bornTime,
      p1: a.zhi,
      t2: Math.max(endT, a.barTime),
      p2: a.zlo,
      color: accent,
      fill: accent,
      fillAlpha: 0.08,
      borderWidth: 2,
      style: "dotted",
    });
    cmds.push({
      kind: "line",
      t1: a.bornTime,
      p1: a.stop,
      t2: Math.max(endT, a.barTime),
      p2: a.stop,
      color: stopFill,
      width: 1,
      style: "dashed",
      text: "SL",
    });
    if (a.entry != null && a.target != null) {
      cmds.push({
        kind: "line",
        t1: a.bornTime,
        p1: a.entry,
        t2: Math.max(endT, a.barTime),
        p2: a.entry,
        color: col,
        width: 1,
        style: "dotted",
        text: "Entry",
      });
      cmds.push({
        kind: "line",
        t1: a.bornTime,
        p1: a.target,
        t2: Math.max(endT, a.barTime),
        p2: a.target,
        color: targetFill,
        width: 1,
        style: "dotted",
        text: `TP 1:${cfg.targetR}`,
      });
    }
    const mid = (a.zlo + a.zhi) / 2;
    cmds.push({
      kind: "label",
      t1: a.barTime,
      p1: mid,
      color: accent,
      fill: accent,
      text: awaitingPill(a),
    });
    cmds.push({
      kind: "label",
      t1: a.barTime,
      p1: a.zhi,
      color: accent,
      fill: accent,
      text: `${siFamilyName(a.family)} · ${a.why}`,
    });
  }

  for (const s of result.signals) {
    if (!cfg.showHistory && !s.active) continue;
    const col = s.dir === 1 ? bull : bear;

    if (cfg.showZones) {
      cmds.push({
        kind: "rect",
        t1: s.bornTime,
        p1: s.zhi,
        t2: Math.max(endT, s.time),
        p2: s.zlo,
        color: col,
        fill: col,
        fillAlpha: zoneAlpha,
        borderWidth: 1,
        style: s.active ? "solid" : "dashed",
      });
    }

    if (cfg.showTradeBox) {
      cmds.push({
        kind: "position",
        t1: s.time,
        p1: s.entry,
        dir: s.dir,
        profitPrice: s.target,
        stopPrice: s.stop,
        color: col,
        fill: targetFill,
        stopFill,
        fillAlpha: boxAlpha,
      });
    }

    const arrowPrice =
      s.dir === 1 ? (s.candleLow || s.entry) * 0.9997 : (s.candleHigh || s.entry) * 1.0003;
    cmds.push({
      kind: "arrow",
      t1: s.time,
      p1: arrowPrice,
      dir: s.dir,
      color: col,
      text: s.dir === 1 ? "BUY" : "SELL",
    });
    cmds.push({
      kind: "label",
      t1: s.time,
      p1: s.labelPrice || arrowPrice,
      color: col,
      fill: col,
      text: pillText(s, cfg.showScore),
    });
    if (cfg.showScore) {
      cmds.push({
        kind: "label",
        t1: s.time,
        p1: s.dir === 1 ? s.zhi : s.zlo,
        color: col,
        fill: col,
        text: `${siFamilyName(s.family)} · ${s.why}`,
      });
    }
  }

  return cmds;
}

export async function paintCertainty(
  chart: IChartWidgetApi,
  cmds: readonly DrawCmd[],
  options?: { readonly ownerStudyId?: EntityId },
): Promise<EntityId[]> {
  return paintOrcaOnChart(chart, cmds, options);
}
