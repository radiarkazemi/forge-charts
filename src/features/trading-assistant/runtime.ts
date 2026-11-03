/**
 * Forge Trading Assistant — clean Texas-style day trader (no DR/OB noise).
 *
 * Manual Buy / Manual Sell / Auto bias with stop entries:
 *   • SELL STOP — close breaks a confirmed swing low; SL = swing high + ATR pad
 *   • BUY STOP  — close breaks a confirmed swing high; SL = swing low − ATR pad
 *   • TP1 / TP2 = fixed R multiples from that risk (default 1R / 2R)
 *   • One open trade at a time + cooldown + daily cap
 */

import type { EntityId, IChartWidgetApi } from "@/infrastructure/tradingview";
import {
  computeOrcaAnalysis,
  paintOrcaOnChart,
  type ConfirmedDealingRange,
  type DrawCmd,
  type OrcaBar,
} from "@/features/pine/orca-runtime";

export type FtaBar = OrcaBar;

/** 0 = Auto · 1 = Manual Buy · 2 = Manual Sell (Texas-style direction lock). */
export type FtaBiasMode = 0 | 1 | 2;

export interface FtaInputs {
  readonly swingLeft: number;
  readonly swingRight: number;
  /** 0 Auto, 1 Manual Buy, 2 Manual Sell. */
  readonly biasMode: FtaBiasMode;
  /** First take-profit in R multiples (default 1). */
  readonly tp1R: number;
  /** Second take-profit in R multiples (default 2) — main target. */
  readonly tp2R: number;
  readonly atrLength: number;
  /** Extra SL padding as fraction of ATR (e.g. 0.25). */
  readonly atrSlPad: number;
  readonly preferMss: boolean;
  readonly useOrderBlock: boolean;
  readonly useFvg: boolean;
  readonly requireRejection: boolean;
  /**
   * Require last confirmed Orca Dealing Range on this TF (same-color C1/C2).
   * Super-sensitive filter — no DR → no signal.
   */
  readonly requireDealingRange: boolean;
  /** Never confirm a position opposite the active structure trend. */
  readonly requireTrendAlign: boolean;
  /**
   * Require price to touch DR OTE (0.618–0.786) — classic sensitive Orca entry.
   * When false, discount/premium half of the DR is enough.
   */
  readonly requireDrOte: boolean;
  /** Hard cap of signals kept on chart. */
  readonly maxSignals: number;
  /** Soft daily budget (UTC day) — keeps frequency Texas-like. */
  readonly maxSignalsPerDay: number;
  /** Min bars between two signals (cooldown). */
  readonly cooldownBars: number;
  readonly showZones: boolean;
  /** Paint the last confirmed Dealing Range (EQ + OTE). */
  readonly showDealingRange: boolean;
  /**
   * When true: paint native TV Long/Short Position boxes (Target + Stop + R:R).
   * When false: only BUY/SELL signal pills on the signal candles.
   */
  readonly showTradeBox: boolean;
  readonly showStructure: boolean;
  readonly showHistory: boolean;
  /** Pill + long accent (#hex). */
  readonly bullColor: string;
  /** Pill + short accent (#hex). */
  readonly bearColor: string;
  /** Target (TP) zone fill for Long/Short Position (#hex) — TV green. */
  readonly longBoxColor: string;
  /** Stop (SL) zone fill for Long/Short Position (#hex) — TV red. */
  readonly shortBoxColor: string;
  /** Position-box fill opacity 0–100 (lower = lighter; TV-like ≈ 20). */
  readonly boxOpacity: number;
}

export const FTA_DEFAULTS: FtaInputs = {
  swingLeft: 2,
  swingRight: 2,
  biasMode: 0,
  tp1R: 1,
  tp2R: 2,
  atrLength: 14,
  /** Texas title uses ATR pad ≈ 0.2 */
  atrSlPad: 0.2,
  preferMss: true,
  useOrderBlock: false,
  useFvg: false,
  requireRejection: false,
  /** Texas itself is not DR-gated — keep off to kill noise. */
  requireDealingRange: false,
  requireTrendAlign: true,
  requireDrOte: false,
  maxSignals: 8,
  maxSignalsPerDay: 5,
  cooldownBars: 5,
  showZones: false,
  showDealingRange: false,
  showTradeBox: true,
  showStructure: false,
  showHistory: true,
  bullColor: "#43A047",
  bearColor: "#E53935",
  longBoxColor: "#787B86",
  shortBoxColor: "#2962FF",
  boxOpacity: 18,
};

function normalizeHex(raw: string, fallback: string): string {
  const t = (raw || "").trim();
  if (/^#([0-9a-fA-F]{6})$/.test(t)) return t;
  if (/^#([0-9a-fA-F]{3})$/.test(t)) {
    return `#${t[1]}${t[1]}${t[2]}${t[2]}${t[3]}${t[3]}`;
  }
  if (/^[0-9a-fA-F]{6}$/.test(t)) return `#${t}`;
  return fallback;
}

export type FtaOutcome = "open" | "tp1" | "tp2" | "sl";

export interface FtaSignal {
  readonly dir: 1 | -1;
  readonly kind: "MSS" | "BOS";
  readonly reason: string;
  readonly biasLabel: string;
  readonly time: number;
  readonly bornTime: number;
  readonly entry: number;
  readonly stop: number;
  readonly tp1: number;
  readonly tp2: number;
  readonly risk: number;
  readonly rr: number;
  readonly zlo: number;
  readonly zhi: number;
  readonly structurePrice: number;
  readonly active: boolean;
  readonly outcome: FtaOutcome;
  /** Highest TP reached before SL (for labels). */
  readonly tpHit: 0 | 1 | 2;
  /** Always the entry/signal candle time (markers stay on that candle). */
  readonly labelTime: number;
  /** Anchor price for the signal marker (below low for BUY, above high for SELL). */
  readonly labelPrice: number;
  /** Signal candle high — for arrow placement. */
  readonly candleHigh: number;
  /** Signal candle low — for arrow placement. */
  readonly candleLow: number;
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
  readonly biasLabel: string;
  /** Active structure trend on this timeframe: 1 up, -1 down, 0 unknown. */
  readonly trendDir: 1 | -1 | 0;
  /** Last confirmed Orca Dealing Range on this timeframe (if any). */
  readonly lastDealingRange: ConfirmedDealingRange | null;
  /** Chronological confirmed DRs used for confluence. */
  readonly dealingRanges: readonly ConfirmedDealingRange[];
}

interface Swing {
  idx: number;
  time: number;
  price: number;
  kind: "high" | "low";
  broken: boolean;
}

type MutableSignal = {
  -readonly [K in keyof FtaSignal]: FtaSignal[K];
};

function biasLabelOf(mode: FtaBiasMode): string {
  if (mode === 1) return "Manual Buy";
  if (mode === 2) return "Manual Sell";
  return "Auto";
}

function biasDir(mode: FtaBiasMode): 1 | -1 | 0 {
  if (mode === 1) return 1;
  if (mode === 2) return -1;
  return 0;
}

function utcDayKey(ts: number): number {
  return Math.floor(ts / 86_400);
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

function atrApprox(bars: readonly FtaBar[], i: number, len: number): number {
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

/**
 * Clean Texas engine: swing break → stop entry → ATR-padded SL → TP1/TP2 R.
 * No DR soft reactions, no OB/FVG spam.
 */
export function computeTradingAssistant(
  bars: readonly FtaBar[],
  inputs: Partial<FtaInputs> = {},
): FtaResult {
  const cfg: FtaInputs = { ...FTA_DEFAULTS, ...inputs };
  const biasLbl = biasLabelOf(cfg.biasMode);
  const locked = biasDir(cfg.biasMode);
  const empty: FtaResult = {
    signals: [],
    structureLines: [],
    biasLabel: biasLbl,
    trendDir: 0,
    lastDealingRange: null,
    dealingRanges: [],
  };
  const left = Math.max(1, Math.floor(cfg.swingLeft));
  const right = Math.max(1, Math.floor(cfg.swingRight));
  if (bars.length < left + right + 20) return empty;

  // Optional DR backdrop only (never gates entries in the clean Texas path).
  const dealingRanges =
    cfg.showDealingRange
      ? computeOrcaAnalysis(bars, {
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
          maxDealingRanges: 4,
          fromTimeSec: null,
          toTimeSec: null,
          rangesOnly: true,
        }).ranges
      : [];

  const structureLines: FtaResult["structureLines"][number][] = [];
  const signals: MutableSignal[] = [];

  let lastSH: Swing | null = null;
  let lastSL: Swing | null = null;
  /** Prior swing used as protective stop when the opposite swing breaks. */
  let stopAnchorHigh: Swing | null = null;
  let stopAnchorLow: Swing | null = null;
  let structureDir = 0;
  let lastSignalBarIdx = -10_000;
  let lastExitBarIdx = -10_000;
  const dayCounts = new Map<number, number>();
  const atrLen = Math.max(5, Math.floor(cfg.atrLength));

  const hasOpen = () => signals.some((s) => s.active);

  for (let i = left + right; i < bars.length; i += 1) {
    const bar = bars[i]!;
    const atr = atrApprox(bars, i, atrLen);

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
      lastSH = sw;
      stopAnchorHigh = sw;
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
      lastSL = sw;
      stopAnchorLow = sw;
    }

    const preStructure = structureDir;
    const bullBreak = lastSH != null && !lastSH.broken && bar.close > lastSH.price;
    const bearBreak = lastSL != null && !lastSL.broken && bar.close < lastSL.price;

    let brokeHigh: Swing | null = null;
    let brokeLow: Swing | null = null;

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
      brokeHigh = lastSH;
      lastSH.broken = true;
      structureDir = 1;
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
      brokeLow = lastSL;
      lastSL.broken = true;
      structureDir = -1;
    }

    // Resolve open trades before considering a new entry (one position).
    for (const s of signals) {
      if (!s.active) continue;
      if (s.time >= bar.time) continue;
      if (s.dir === 1) {
        if (bar.low <= s.stop) {
          s.active = false;
          s.outcome = "sl";
          lastExitBarIdx = i;
        } else {
          if (s.tpHit < 1 && bar.high >= s.tp1) s.tpHit = 1;
          if (bar.high >= s.tp2) {
            s.tpHit = 2;
            s.active = false;
            s.outcome = "tp2";
            lastExitBarIdx = i;
          }
        }
      } else if (bar.high >= s.stop) {
        s.active = false;
        s.outcome = "sl";
        lastExitBarIdx = i;
      } else {
        if (s.tpHit < 1 && bar.low <= s.tp1) s.tpHit = 1;
        if (bar.low <= s.tp2) {
          s.tpHit = 2;
          s.active = false;
          s.outcome = "tp2";
          lastExitBarIdx = i;
        }
      }
      if (!s.active && s.outcome === "open" && s.tpHit === 1) {
        s.outcome = "tp1";
      }
    }

    if (hasOpen()) continue;

    const day = utcDayKey(bar.time);
    const usedToday = dayCounts.get(day) ?? 0;
    const cooled =
      i - lastSignalBarIdx >= Math.max(1, cfg.cooldownBars) &&
      i - lastExitBarIdx >= Math.max(1, Math.floor(cfg.cooldownBars / 2));
    const underDaily = usedToday < Math.max(1, cfg.maxSignalsPerDay);
    if (!cooled || !underDaily) continue;

    const pad = atr * Math.max(0, cfg.atrSlPad);
    const r1 = Math.max(0.5, cfg.tp1R);
    const r2 = Math.max(r1, cfg.tp2R);

    const emitStop = (
      dir: 1 | -1,
      entry: number,
      stopRaw: number,
      structure: "MSS" | "BOS",
      structurePrice: number,
      bornTime: number,
    ): boolean => {
      const stop = dir === 1 ? stopRaw - pad : stopRaw + pad;
      const risk = Math.abs(entry - stop);
      // Reject microscopic or absurd risk vs ATR (noise filter).
      if (!(risk > 0) || risk < atr * 0.15 || risk > atr * 8) return false;
      const tp1 = dir === 1 ? entry + risk * r1 : entry - risk * r1;
      const tp2 = dir === 1 ? entry + risk * r2 : entry - risk * r2;
      const labelPrice = dir === 1 ? bar.low - atr * 0.12 : bar.high + atr * 0.12;
      signals.push({
        dir,
        kind: structure,
        reason: dir === 1 ? "BUY STOP" : "SELL STOP",
        biasLabel: biasLbl,
        time: bar.time,
        bornTime,
        entry,
        stop,
        tp1,
        tp2,
        risk,
        rr: r2,
        zlo: dir === 1 ? stop : Math.min(entry, tp2),
        zhi: dir === 1 ? Math.max(entry, tp2) : stop,
        structurePrice,
        active: true,
        outcome: "open",
        tpHit: 0,
        labelTime: bar.time,
        labelPrice,
        candleHigh: bar.high,
        candleLow: bar.low,
      });
      lastSignalBarIdx = i;
      dayCounts.set(day, usedToday + 1);
      return true;
    };

    // SELL STOP — Manual Sell or Auto on bearish swing-low break.
    const allowSell = locked === -1 || (locked === 0 && brokeLow != null);
    if (allowSell && brokeLow) {
      const anchor = stopAnchorHigh;
      if (anchor && anchor.idx < brokeLow.idx) {
        const isMss = preStructure === 1;
        emitStop(
          -1,
          brokeLow.price,
          anchor.price,
          isMss ? "MSS" : "BOS",
          brokeLow.price,
          brokeLow.time,
        );
      }
    }

    // BUY STOP — Manual Buy or Auto on bullish swing-high break.
    if (!hasOpen()) {
      const allowBuy = locked === 1 || (locked === 0 && brokeHigh != null);
      if (allowBuy && brokeHigh) {
        const anchor = stopAnchorLow;
        if (anchor && anchor.idx < brokeHigh.idx) {
          const isMss = preStructure === -1;
          emitStop(
            1,
            brokeHigh.price,
            anchor.price,
            isMss ? "MSS" : "BOS",
            brokeHigh.price,
            brokeHigh.time,
          );
        }
      }
    }
  }

  for (const s of signals) {
    if (!s.active && s.outcome === "open" && s.tpHit >= 1) {
      s.outcome = s.tpHit >= 2 ? "tp2" : "tp1";
    }
  }

  const maxN = Math.max(1, Math.min(24, Math.floor(cfg.maxSignals)));
  const trendOut: 1 | -1 | 0 =
    structureDir === 1 ? 1 : structureDir === -1 ? -1 : 0;
  const lastDr =
    dealingRanges.length > 0 ? dealingRanges[dealingRanges.length - 1]! : null;
  return {
    signals: signals.slice(-maxN),
    structureLines: cfg.showStructure ? structureLines.slice(-Math.max(4, maxN)) : [],
    biasLabel: biasLbl,
    trendDir: trendOut,
    lastDealingRange: lastDr,
    dealingRanges,
  };
}

/** Texas pill text: "SELL STOP" / "SELL - TP2 hit" / "BUY - SL hit". */
function signalPillText(s: FtaSignal): string {
  const tag = s.dir === 1 ? "BUY" : "SELL";
  if (s.outcome === "tp2" || s.tpHit >= 2) return `${tag} - TP2 hit`;
  if (s.outcome === "sl") return `${tag} - SL hit`;
  if (s.outcome === "tp1" || (s.tpHit >= 1 && !s.active)) return `${tag} - TP1 hit`;
  if (s.tpHit >= 1 && s.active) return `${tag} - TP1 hit`;
  return `${tag} STOP`;
}

/**
 * Draw FTA signals.
 * - Last confirmed Dealing Range: discount (green) + premium (red) + EQ/OTE
 * - Native TV Long/Short Position (green Target + red Stop) when boxes on
 * - Arrow + pill glued to the signal candle (always)
 */
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
      });
    }
  }

  const bullPill = normalizeHex(cfg.bullColor, FTA_DEFAULTS.bullColor);
  const bearPill = normalizeHex(cfg.bearColor, FTA_DEFAULTS.bearColor);
  const targetFill = normalizeHex(cfg.longBoxColor, FTA_DEFAULTS.longBoxColor);
  const stopFill = normalizeHex(cfg.shortBoxColor, FTA_DEFAULTS.shortBoxColor);
  const boxAlpha = Math.max(0.12, Math.min(0.35, Number(cfg.boxOpacity) / 100));
  const zoneAlpha = Math.max(0.04, boxAlpha * 0.7);

  // Dealing Range backdrop first; signals last so paint-cap keeps markers.
  if (cfg.showDealingRange && result.lastDealingRange) {
    const dr = result.lastDealingRange;
    const t2 = Math.max(endT, dr.t1);
    // Premium (upper) = red · Discount (lower) = green — TV/ICT style.
    cmds.push({
      kind: "rect",
      t1: dr.t0,
      p1: dr.top,
      t2,
      p2: dr.mid,
      color: "#FF0000",
      fill: "#FF0000",
      fillAlpha: 0.14,
      borderWidth: 1,
      style: "solid",
    });
    cmds.push({
      kind: "rect",
      t1: dr.t0,
      p1: dr.mid,
      t2,
      p2: dr.bot,
      color: "#00A000",
      fill: "#00A000",
      fillAlpha: 0.14,
      borderWidth: 1,
      style: "solid",
    });
    cmds.push({
      kind: "line",
      t1: dr.t0,
      p1: dr.mid,
      t2,
      p2: dr.mid,
      color: "#F44336",
      width: 2,
      style: "dashed",
      text: `${dr.bullish ? "DR↑" : "DR↓"} EQ`,
    });
    cmds.push({
      kind: "line",
      t1: dr.t0,
      p1: dr.ote618,
      t2,
      p2: dr.ote618,
      color: "#A5D6A7",
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
      color: "#4DD0E1",
      width: 1,
      style: "dotted",
      text: "0.786",
    });
    cmds.push({
      kind: "label",
      t1: dr.t1,
      p1: (dr.top + dr.mid) / 2,
      color: "#FF0000",
      fill: "#FF0000",
      text: "Premium",
    });
    cmds.push({
      kind: "label",
      t1: dr.t1,
      p1: (dr.bot + dr.mid) / 2,
      color: "#00A000",
      fill: "#00A000",
      text: "Discount",
    });
  }

  for (const s of result.signals) {
    if (!cfg.showHistory && !s.active) continue;
    const bull = s.dir === 1;
    const pill = bull ? bullPill : bearPill;

    if (cfg.showZones) {
      cmds.push({
        kind: "rect",
        t1: s.bornTime,
        p1: s.zhi,
        t2: Math.max(endT, s.time),
        p2: s.zlo,
        color: pill,
        fill: pill,
        fillAlpha: zoneAlpha,
        borderWidth: 1,
        style: "dashed",
      });
    }

    if (cfg.showTradeBox) {
      // Native Charting Library Long/Short Position (green Target + red Stop).
      cmds.push({
        kind: "position",
        t1: s.time,
        p1: s.entry,
        dir: s.dir,
        profitPrice: s.tp2,
        stopPrice: s.stop,
        color: pill,
        fill: targetFill,
        stopFill,
        fillAlpha: boxAlpha,
      });
    }

    // Arrow + pill glued to the signal candle so the bar is obvious.
    const arrowPrice = bull
      ? (s.candleLow || s.entry) * 0.9997
      : (s.candleHigh || s.entry) * 1.0003;
    cmds.push({
      kind: "arrow",
      t1: s.time,
      p1: arrowPrice,
      dir: s.dir,
      color: pill,
      text: bull ? "BUY" : "SELL",
    });
    cmds.push({
      kind: "label",
      t1: s.time,
      p1: s.labelPrice || arrowPrice,
      color: pill,
      fill: pill,
      text: signalPillText(s),
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
