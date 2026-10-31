/**
 * Forge Trading Assistant — Phase 1.5 (Texas-inspired) + Orca Dealing Range
 *
 * Day-trading confluence with optional **Manual Buy / Manual Sell** bias,
 * multi-TP (TP1/TP2), ATR stops, and a moderate daily signal budget for
 * 3m / 5m / 15m charts.
 *
 * Flow (sensitive — DR + trend gate):
 *   1. Structure trend (BOS / MSS) — up or down
 *   2. Last confirmed Orca Dealing Range on this timeframe
 *   3. Position must align with trend (opposite-trend = NOT confirmed)
 *   4. Entry only from DR discount (long) / premium (short), ideally OTE
 *   5. POI: Order Block and/or FVG + rejection → Entry / SL / TP1 / TP2
 */

import type { EntityId, IChartWidgetApi } from "@/infrastructure/tradingview";
import {
  computeOrcaAnalysis,
  inDrEntryHalf,
  lastConfirmedDealingRangeAt,
  paintOrcaOnChart,
  touchesDrOte,
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
  atrSlPad: 0.25,
  preferMss: true,
  useOrderBlock: true,
  useFvg: true,
  requireRejection: true,
  requireDealingRange: true,
  requireTrendAlign: true,
  requireDrOte: true,
  maxSignals: 8,
  maxSignalsPerDay: 5,
  cooldownBars: 8,
  showZones: false,
  showDealingRange: true,
  showTradeBox: true,
  showStructure: false,
  showHistory: true,
  bullColor: "#43A047",
  bearColor: "#E53935",
  // Match TradingView Long/Short Position defaults.
  longBoxColor: "#089981",
  shortBoxColor: "#F23645",
  boxOpacity: 20,
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
  /** When the signal resolved (TP/SL); entry time while live. */
  readonly labelTime: number;
  /** Price the pill is anchored to (entry / TP / SL). */
  readonly labelPrice: number;
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
  const mid = (z.lo + z.hi) / 2;
  const lowerWick = Math.min(bar.open, bar.close) - bar.low;
  return bar.close >= mid && (lowerWick >= atr * 0.12 || bar.close > z.hi * 0.999);
}

function bearRejection(bar: FtaBar, z: Zone, atr: number): boolean {
  if (isBull(bar)) return false;
  if (!touchesZone(bar, z)) return false;
  const mid = (z.lo + z.hi) / 2;
  const upperWick = bar.high - Math.max(bar.open, bar.close);
  return bar.close <= mid && (upperWick >= atr * 0.12 || bar.close < z.lo * 1.001);
}

/**
 * Texas-inspired day-trading engine with optional Manual Buy/Sell bias
 * and Orca Dealing Range + trend confirmation (sensitive).
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

  // Orca DR on this chart's timeframe — last confirmed same-color C1/C2 range.
  const orca = computeOrcaAnalysis(bars, {
    left: Math.max(1, left - 1),
    right: Math.max(1, right - 1),
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
    maxDealingRanges: 24,
    fromTimeSec: null,
    toTimeSec: null,
    rangesOnly: true,
  });
  const dealingRanges = orca.ranges;

  const swings: Swing[] = [];
  const zones: Zone[] = [];
  const structureLines: FtaResult["structureLines"][number][] = [];
  const signals: MutableSignal[] = [];

  let lastSH: Swing | null = null;
  let lastSL: Swing | null = null;
  let structureDir = 0;
  let lastOppositeBearIdx: number | null = null;
  let lastOppositeBullIdx: number | null = null;
  let lastSignalBarIdx = -10_000;
  const dayCounts = new Map<number, number>();

  const atrLen = Math.max(5, Math.floor(cfg.atrLength));

  for (let i = left + right; i < bars.length; i += 1) {
    const bar = bars[i]!;
    const atr = atrApprox(bars, i, atrLen);

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
        if (bar.low - b0.high > minGap && bodyOf(b1) > atr * 0.28) {
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
        if (b0.low - bar.high > minGap && bodyOf(b1) > atr * 0.28) {
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

    for (const z of zones) {
      if (z.used) continue;
      if (z.dir === 1 && bar.close < z.lo) z.used = true;
      if (z.dir === -1 && bar.close > z.hi) z.used = true;
    }

    // Effective trade direction: manual lock overrides auto structure bias.
    const wantDir: 1 | -1 | 0 = locked !== 0 ? locked : (structureDir as 1 | -1 | 0);
    if (wantDir === 0) {
      // still resolve open signals below
    } else {
      const day = utcDayKey(bar.time);
      const usedToday = dayCounts.get(day) ?? 0;
      const cooled = i - lastSignalBarIdx >= Math.max(1, cfg.cooldownBars);
      const underDaily = usedToday < Math.max(1, cfg.maxSignalsPerDay);

      // Trend gate: opposite-of-trend positions are never confirmed.
      const trendOk =
        !cfg.requireTrendAlign ||
        structureDir === 0 ||
        structureDir === wantDir;

      // Last confirmed Dealing Range on this timeframe (as of this bar).
      const dr = lastConfirmedDealingRangeAt(dealingRanges, i);
      const drDirOk =
        !cfg.requireDealingRange ||
        (dr != null &&
          ((wantDir === 1 && dr.bullish) || (wantDir === -1 && !dr.bullish)));
      const drHalfOk =
        !cfg.requireDealingRange || (dr != null && inDrEntryHalf(bar, dr));
      const drOteOk =
        !cfg.requireDealingRange ||
        !cfg.requireDrOte ||
        (dr != null && touchesDrOte(bar, dr));

      if (cooled && underDaily && trendOk && drDirOk && drHalfOk && drOteOk) {
        const candidates = zones.filter((z) => !z.used && z.dir === wantDir);
        candidates.sort((a, b) => {
          if (cfg.preferMss && a.structure !== b.structure) {
            if (a.structure === "MSS") return -1;
            if (b.structure === "MSS") return 1;
          }
          return b.t1 - a.t1;
        });

        for (const z of candidates.slice(0, 3)) {
          // POI must sit in the correct DR half when DR is required (sensitive).
          if (cfg.requireDealingRange && dr) {
            const zoneInHalf =
              wantDir === 1
                ? z.lo <= dr.mid // discount / lower half for longs
                : z.hi >= dr.mid; // premium / upper half for shorts
            if (!zoneInHalf) continue;
          }

          const ok = cfg.requireRejection
            ? z.dir === 1
              ? bullRejection(bar, z, atr)
              : bearRejection(bar, z, atr)
            : touchesZone(bar, z) && (z.dir === 1 ? isBull(bar) : !isBull(bar));
          if (!ok) continue;

          z.used = true;
          const entry = bar.close;
          const pad = atr * Math.max(0, cfg.atrSlPad);
          // Prefer DR extreme as structural stop when DR confirmed.
          const drStop =
            dr && cfg.requireDealingRange
              ? wantDir === 1
                ? dr.bot - pad
                : dr.top + pad
              : null;
          const zoneStop = z.dir === 1 ? z.lo - pad : z.hi + pad;
          const stop =
            drStop != null
              ? wantDir === 1
                ? Math.min(zoneStop, drStop)
                : Math.max(zoneStop, drStop)
              : zoneStop;
          const risk = Math.abs(entry - stop);
          if (risk < atr * 0.12) continue;

          const r1 = Math.max(0.5, cfg.tp1R);
          const r2 = Math.max(r1, cfg.tp2R);
          const tp1 = z.dir === 1 ? entry + risk * r1 : entry - risk * r1;
          const tp2 = z.dir === 1 ? entry + risk * r2 : entry - risk * r2;

          const reasonParts = [`${z.structure}`, z.kind];
          if (dr) reasonParts.push(dr.bullish ? "DR+" : "DR−");
          if (cfg.requireDrOte) reasonParts.push("OTE");
          if (cfg.requireRejection) reasonParts.push("Reject");
          if (locked !== 0) reasonParts.push(locked === 1 ? "ManBuy" : "ManSell");

          signals.push({
            dir: z.dir,
            kind: z.structure,
            reason: reasonParts.join("+"),
            biasLabel: biasLbl,
            time: bar.time,
            bornTime: z.t0,
            entry,
            stop,
            tp1,
            tp2,
            risk,
            rr: r2,
            zlo: z.lo,
            zhi: z.hi,
            structurePrice: z.structurePrice,
            active: true,
            outcome: "open",
            tpHit: 0,
            labelTime: bar.time,
            labelPrice: entry,
          });
          lastSignalBarIdx = i;
          dayCounts.set(day, usedToday + 1);
          break;
        }
      }
    }

    // Resolve open signals — track TP1 then TP2 (Texas-style multi-target).
    for (const s of signals) {
      if (!s.active) continue;
      if (s.time >= bar.time) continue;
      if (s.dir === 1) {
        if (bar.low <= s.stop) {
          s.active = false;
          s.outcome = "sl";
          s.labelTime = bar.time;
          s.labelPrice = s.stop;
        } else {
          if (s.tpHit < 1 && bar.high >= s.tp1) {
            s.tpHit = 1;
            s.labelTime = bar.time;
            s.labelPrice = s.tp1;
          }
          if (bar.high >= s.tp2) {
            s.tpHit = 2;
            s.active = false;
            s.outcome = "tp2";
            s.labelTime = bar.time;
            s.labelPrice = s.tp2;
          }
        }
      } else if (bar.high >= s.stop) {
        s.active = false;
        s.outcome = "sl";
        s.labelTime = bar.time;
        s.labelPrice = s.stop;
      } else {
        if (s.tpHit < 1 && bar.low <= s.tp1) {
          s.tpHit = 1;
          s.labelTime = bar.time;
          s.labelPrice = s.tp1;
        }
        if (bar.low <= s.tp2) {
          s.tpHit = 2;
          s.active = false;
          s.outcome = "tp2";
          s.labelTime = bar.time;
          s.labelPrice = s.tp2;
        }
      }
      if (!s.active && s.outcome === "open" && s.tpHit === 1) {
        s.outcome = "tp1";
        s.labelPrice = s.tp1;
      }
    }
  }

  // Finalize: any still-open with TP1 hit keep outcome open; closed with only TP1 → tp1
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
    structureLines: structureLines.slice(-Math.max(4, maxN)),
    biasLabel: biasLbl,
    trendDir: trendOut,
    lastDealingRange: lastDr,
    dealingRanges,
  };
}

/** Texas pill text: "SELL - TP2 hit" / "BUY - SL hit" / "SELL - LIVE". */
function signalPillText(s: FtaSignal): string {
  const tag = s.dir === 1 ? "BUY" : "SELL";
  if (s.outcome === "tp2" || s.tpHit >= 2) return `${tag} - TP2 hit`;
  if (s.outcome === "sl") return `${tag} - SL hit`;
  if (s.outcome === "tp1" || (s.tpHit >= 1 && !s.active)) return `${tag} - TP1 hit`;
  if (s.tpHit >= 1 && s.active) return `${tag} - TP1 hit`;
  return `${tag} - LIVE`;
}

/**
 * Draw FTA signals.
 * - Last confirmed Dealing Range (optional)
 * - `showTradeBox` on → native TV Long/Short Position (Target + Stop + R:R)
 * - `showTradeBox` off → only BUY/SELL pills on the signal candles
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
  const boxAlpha = Math.max(0.05, Math.min(0.45, Number(cfg.boxOpacity) / 100));
  const zoneAlpha = Math.max(0.04, boxAlpha * 0.7);

  // Last confirmed Dealing Range on this timeframe (EQ + OTE).
  if (cfg.showDealingRange && result.lastDealingRange) {
    const dr = result.lastDealingRange;
    const drColor = dr.bullish ? "#76FF03" : "#F44336";
    const t2 = Math.max(endT, dr.t1);
    cmds.push({
      kind: "rect",
      t1: dr.t0,
      p1: dr.top,
      t2,
      p2: dr.bot,
      color: drColor,
      fill: drColor,
      fillAlpha: 0.08,
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
  }

  for (const s of result.signals) {
    if (!cfg.showHistory && !s.active) continue;
    const bull = s.dir === 1;
    const pill = bull ? bullPill : bearPill;
    const extend = Math.max(endT, s.labelTime || s.time, s.time);

    if (cfg.showZones) {
      cmds.push({
        kind: "rect",
        t1: s.bornTime,
        p1: s.zhi,
        t2: extend,
        p2: s.zlo,
        color: pill,
        fill: pill,
        fillAlpha: zoneAlpha,
        borderWidth: 1,
        style: "dashed",
      });
    }

    if (cfg.showTradeBox) {
      // Exact TradingView Long/Short Position tool (green Target + red Stop + labels).
      cmds.push({
        kind: "position",
        t1: s.time,
        p1: s.entry,
        t2: extend,
        dir: s.dir,
        profitPrice: s.tp2,
        stopPrice: s.stop,
        color: pill,
        fill: targetFill,
        stopFill,
        fillAlpha: boxAlpha,
      });
    } else {
      // Labels only — Texas-style pill on the signal / outcome candle.
      cmds.push({
        kind: "label",
        t1: s.labelTime || s.time,
        p1: s.labelPrice || s.entry,
        color: pill,
        fill: pill,
        text: signalPillText(s),
      });
    }
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
