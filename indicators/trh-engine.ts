/** TRH detector — mirrors Pine (classic sweep + Aug 26 level-reject) */

export type Bar = { time: number; open: number; high: number; low: number; close: number };

export type TrhConfig = {
  pivotPeriod: number;
  minContextAtr: number;
  minSweepAtr: number;
  baseConfirmBars: number;
  rejectConfirmBars: number;
  maxBaseBars: number;
  minRoomAtr: number;
  maxRoomAtr: number;
  cooldownBars: number;
  slPadAtr: number;
  riskReward: number;
  minLevelTouches: number;
  levelTouchTolAtr: number;
  enableLevelReject: boolean;
  blockCounterTrend: boolean;
  enableSwingReject: boolean;
};

export const DEFAULT_TRH_CONFIG: TrhConfig = {
  pivotPeriod: 5,
  minContextAtr: 1.2,
  minSweepAtr: 0.05,
  baseConfirmBars: 6,
  rejectConfirmBars: 3,
  maxBaseBars: 40,
  minRoomAtr: 0.6,
  maxRoomAtr: 3.5,
  cooldownBars: 40,
  slPadAtr: 0.02,
  riskReward: 2.4,
  minLevelTouches: 2,
  levelTouchTolAtr: 0.25,
  enableLevelReject: true,
  blockCounterTrend: true,
  enableSwingReject: false,
};

export type TrhSetup = {
  dir: 1 | -1;
  entry: number;
  sl: number;
  tp: number;
  distal: number;
  proximal: number;
  barIndex: number;
  barTime: number;
  mode: "sweep" | "level_reject";
};

type Pending = {
  dir: 1 | -1;
  distal: number;
  hunt: number;
  bar: number;
  baseHigh: number;
  baseLow: number;
  mode: 0 | 1;
  needBars: number;
};

function atr(bars: Bar[], i: number, len = 14): number {
  if (i < 1) return bars[i].high - bars[i].low;
  let sum = 0;
  const start = Math.max(1, i - len + 1);
  for (let j = start; j <= i; j++) {
    sum += Math.max(
      bars[j].high - bars[j].low,
      Math.abs(bars[j].high - bars[j - 1].close),
      Math.abs(bars[j].low - bars[j - 1].close),
    );
  }
  return sum / (i - start + 1);
}

function pivotLow(bars: Bar[], i: number, p: number): number | null {
  if (i < p || i >= bars.length - p) return null;
  const v = bars[i].low;
  for (let j = i - p; j <= i + p; j++) if (j !== i && bars[j].low <= v) return null;
  return v;
}

function pivotHigh(bars: Bar[], i: number, p: number): number | null {
  if (i < p || i >= bars.length - p) return null;
  const v = bars[i].high;
  for (let j = i - p; j <= i + p; j++) if (j !== i && bars[j].high >= v) return null;
  return v;
}

function lastPivot(
  pivots: { price: number; bar: number }[],
  i: number,
  maxAge: number,
  p: number,
  lowSide: boolean,
) {
  let best: number | null = null;
  for (const pv of pivots) {
    const age = i - pv.bar;
    if (age >= p && age <= maxAge) {
      if (best === null || (lowSide ? pv.price <= best : pv.price >= best)) best = pv.price;
    }
  }
  return best;
}

function touchCount(bars: Bar[], i: number, level: number, lookback: number, tol: number) {
  let touches = 0;
  const start = Math.max(0, i - lookback);
  for (let k = start; k < i; k++) {
    if (bars[k].high >= level - tol && bars[k].low <= level + tol) touches++;
  }
  return touches;
}

function levels(dir: 1 | -1, proximal: number, distal: number, a: number, cfg: TrhConfig) {
  const entry = (proximal + distal) / 2;
  const pad = a * cfg.slPadAtr;
  const sl = dir === 1 ? distal - pad : distal + pad;
  const risk = Math.abs(entry - sl);
  const tp = dir === 1 ? entry + risk * cfg.riskReward : entry - risk * cfg.riskReward;
  return { entry, sl, tp, risk };
}

function nextLiqHigh(pivHi: { price: number }[], from: number, minDist: number) {
  let best: number | null = null;
  for (const p of pivHi) {
    if (p.price >= from + minDist && (best === null || p.price < best)) best = p.price;
  }
  return best;
}

function nextLiqLow(pivLo: { price: number }[], from: number, minDist: number) {
  let best: number | null = null;
  for (const p of pivLo) {
    if (p.price <= from - minDist && (best === null || p.price > best)) best = p.price;
  }
  return best;
}

export function scanTrhSetups(bars: Bar[], cfg: TrhConfig = DEFAULT_TRH_CONFIG): TrhSetup[] {
  const setups: TrhSetup[] = [];
  const p = cfg.pivotPeriod;
  const pivLo: { price: number; bar: number }[] = [];
  const pivHi: { price: number; bar: number }[] = [];

  let pending: Pending | null = null;
  let lastSetupBar = -9999;
  let lastBearRejectBar = -9999;
  let lastBullRejectBar = -9999;

  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const a = atr(bars, i);

    const pl = pivotLow(bars, i - p, p);
    const ph = pivotHigh(bars, i - p, p);
    if (pl !== null) {
      pivLo.push({ price: pl, bar: i - p });
      if (pivLo.length > 40) pivLo.shift();
    }
    if (ph !== null) {
      pivHi.push({ price: ph, bar: i - p });
      if (pivHi.length > 40) pivHi.shift();
    }

    const huntLo = lastPivot(pivLo, i, 120, p, true);
    const huntHi = lastPivot(pivHi, i, 120, p, false);
    const tol = a * cfg.levelTouchTolAtr;
    const strongLo = huntLo !== null && touchCount(bars, i, huntLo, 80, tol) >= cfg.minLevelTouches;
    const strongHi = huntHi !== null && touchCount(bars, i, huntHi, 80, tol) >= cfg.minLevelTouches;

    const slice = bars.slice(Math.max(0, i - 40), i);
    const priorHigh = slice.length ? Math.max(...slice.map((x) => x.high)) : b.high;
    const priorLow = slice.length ? Math.min(...slice.map((x) => x.low)) : b.low;

    const bullSweep =
      huntLo !== null &&
      b.low < huntLo - a * cfg.minSweepAtr &&
      b.close > huntLo &&
      b.close > b.open &&
      priorHigh - b.low >= a * cfg.minContextAtr;
    const bearSweep =
      huntHi !== null &&
      b.high > huntHi + a * cfg.minSweepAtr &&
      b.close < huntHi &&
      b.close < b.open &&
      b.high - priorLow >= a * cfg.minContextAtr;

    const bullLevelReject =
      cfg.enableLevelReject &&
      ((strongLo &&
        huntLo !== null &&
        b.low <= huntLo + tol &&
        b.low < huntLo + a * 0.05 &&
        b.close > huntLo &&
        b.close > b.open &&
        b.close - b.open >= a * 0.08) ||
        (cfg.enableSwingReject &&
          (() => {
            const swingLo = Math.min(...bars.slice(Math.max(0, i - 20), i).map((x) => x.low));
            return (
              b.low <= swingLo + a * 0.1 &&
              b.close > b.open &&
              b.close - b.low >= a * 0.45 &&
              b.close > (b.high + b.low) * 0.5
            );
          })()));
    const bearLevelReject =
      cfg.enableLevelReject &&
      ((strongHi &&
        huntHi !== null &&
        b.high >= huntHi - tol &&
        b.high > huntHi - a * 0.05 &&
        b.close < huntHi &&
        b.close < b.open &&
        b.open - b.close >= a * 0.08) ||
        (cfg.enableSwingReject &&
          (() => {
            const swingHi = Math.max(...bars.slice(Math.max(0, i - 20), i).map((x) => x.high));
            return (
              b.high >= swingHi - a * 0.1 &&
              b.close < b.open &&
              b.high - b.close >= a * 0.45 &&
              b.close < (b.high + b.low) * 0.5
            );
          })()));

    if (bearLevelReject) lastBearRejectBar = i;
    if (bullLevelReject) lastBullRejectBar = i;

    const blockLong = cfg.blockCounterTrend && i - lastBearRejectBar <= 25;
    const blockShort = cfg.blockCounterTrend && i - lastBullRejectBar <= 25;
    const canStart = !pending && i - lastSetupBar >= cfg.cooldownBars;

    if (canStart && bearLevelReject && !blockShort) {
      pending = {
        dir: -1,
        distal: b.high,
        hunt: huntHi ?? b.high,
        bar: i,
        baseHigh: b.high,
        baseLow: b.low,
        mode: 1,
        needBars: cfg.rejectConfirmBars,
      };
    } else if (canStart && bullLevelReject && !blockLong) {
      pending = {
        dir: 1,
        distal: b.low,
        hunt: huntLo ?? b.low,
        bar: i,
        baseHigh: b.high,
        baseLow: b.low,
        mode: 1,
        needBars: cfg.rejectConfirmBars,
      };
    } else if (canStart && bearSweep && !blockShort && huntHi !== null) {
      pending = {
        dir: -1,
        distal: b.high,
        hunt: huntHi,
        bar: i,
        baseHigh: b.high,
        baseLow: b.low,
        mode: 0,
        needBars: cfg.baseConfirmBars,
      };
    } else if (canStart && bullSweep && !blockLong && huntLo !== null) {
      pending = {
        dir: 1,
        distal: b.low,
        hunt: huntLo,
        bar: i,
        baseHigh: b.high,
        baseLow: b.low,
        mode: 0,
        needBars: cfg.baseConfirmBars,
      };
    }

    if (pending && pending.dir === 1 && bearLevelReject && cfg.blockCounterTrend) pending = null;
    if (pending && pending.dir === -1 && bullLevelReject && cfg.blockCounterTrend) pending = null;

    if (!pending) continue;

    pending.baseHigh = Math.max(pending.baseHigh, b.high);
    pending.baseLow = Math.min(pending.baseLow, b.low);
    if (pending.dir === 1 && b.low < pending.distal) pending.distal = b.low;
    if (pending.dir === -1 && b.high > pending.distal) pending.distal = b.high;

    const age = i - pending.bar;
    if (age > cfg.maxBaseBars) {
      pending = null;
      continue;
    }
    if (age < pending.needBars) continue;
    if (pending.dir === 1 && blockLong) continue;
    if (pending.dir === -1 && blockShort) continue;

    const minW = a * (pending.mode === 1 ? Math.min(cfg.minRoomAtr, 0.45) : cfg.minRoomAtr);
    const maxW = a * (pending.mode === 1 ? Math.min(cfg.maxRoomAtr, 2.2) : cfg.maxRoomAtr);

    if (pending.dir === 1) {
      const distal = pending.distal;
      const proximal = pending.baseHigh;
      const width = proximal - distal;
      const prevBaseHigh = i > pending.bar ? bars[i - 1].high : proximal;
      const microBreak =
        b.close > b.open && (b.high >= prevBaseHigh || b.close >= distal + width * 0.65);
      if (width >= minW && width <= maxW && microBreak) {
        const lv = levels(1, proximal, distal, a, cfg);
        const liq = nextLiqHigh(pivHi, lv.entry, lv.risk * 1.5);
        const tp = liq !== null ? Math.max(lv.tp, liq) : lv.tp;
        setups.push({
          dir: 1,
          entry: lv.entry,
          sl: lv.sl,
          tp,
          distal,
          proximal,
          barIndex: i,
          barTime: b.time,
          mode: pending.mode === 1 ? "level_reject" : "sweep",
        });
        lastSetupBar = i;
        pending = null;
      }
    } else {
      const distal = pending.distal;
      let proximal = pending.baseLow;
      let width = distal - proximal;
      // Aug 26: keep short room tight under the high if price dumps
      if (width > maxW) {
        proximal = distal - maxW;
        width = maxW;
      }
      const prevBaseLow = i > pending.bar ? bars[i - 1].low : proximal;
      const microBreak =
        b.close < b.open && (b.low <= prevBaseLow || b.close <= distal - width * 0.65);
      const rejectHold = pending.mode === 1 && b.close < pending.hunt && b.close < b.open;
      if (width >= minW && width <= maxW && (microBreak || rejectHold)) {
        const lv = levels(-1, proximal, distal, a, cfg);
        const liq = nextLiqLow(pivLo, lv.entry, lv.risk * 1.5);
        const tp = liq !== null ? Math.min(lv.tp, liq) : lv.tp;
        setups.push({
          dir: -1,
          entry: lv.entry,
          sl: lv.sl,
          tp,
          distal,
          proximal,
          barIndex: i,
          barTime: b.time,
          mode: pending.mode === 1 ? "level_reject" : "sweep",
        });
        lastSetupBar = i;
        pending = null;
      }
    }
  }

  return setups;
}
