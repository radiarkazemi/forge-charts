/** TRH classic SWEEP detector — mirrors Pine (early arm + late skip) */

export type Bar = { time: number; open: number; high: number; low: number; close: number };

export type TrhConfig = {
  pivotPeriod: number;
  minContextAtr: number;
  minSweepAtr: number;
  baseConfirmBars: number;
  maxBaseBars: number;
  minRoomAtr: number;
  maxRoomAtr: number;
  cooldownBars: number;
  slPadAtr: number;
  riskReward: number;
  /** When false (default), arm as soon as room width is valid — do not wait for top micro-break. */
  requireImpulse: boolean;
  /** If close already past mid-room by this many R, mark late. */
  maxLateR: number;
};

export const DEFAULT_TRH_CONFIG: TrhConfig = {
  pivotPeriod: 5,
  minContextAtr: 1.2,
  minSweepAtr: 0.05,
  baseConfirmBars: 8,
  maxBaseBars: 40,
  minRoomAtr: 0.8,
  maxRoomAtr: 3.5,
  cooldownBars: 50,
  slPadAtr: 0.02,
  riskReward: 2.4,
  requireImpulse: false,
  maxLateR: 0.35,
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
  mode: "sweep";
  late: boolean;
  chaseR: number;
};

type Pending = {
  dir: 1 | -1;
  distal: number;
  hunt: number;
  bar: number;
  baseHigh: number;
  baseLow: number;
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

function pushSetup(
  setups: TrhSetup[],
  dir: 1 | -1,
  proximal: number,
  distal: number,
  a: number,
  cfg: TrhConfig,
  pivHi: { price: number }[],
  pivLo: { price: number }[],
  i: number,
  b: Bar,
) {
  const lv = levels(dir, proximal, distal, a, cfg);
  const liq =
    dir === 1
      ? nextLiqHigh(pivHi, lv.entry, lv.risk * 1.5)
      : nextLiqLow(pivLo, lv.entry, lv.risk * 1.5);
  const tp =
    liq !== null
      ? dir === 1
        ? Math.max(lv.tp, liq)
        : Math.min(lv.tp, liq)
      : lv.tp;
  const chaseR =
    lv.risk > 0
      ? dir === 1
        ? (b.close - lv.entry) / lv.risk
        : (lv.entry - b.close) / lv.risk
      : 0;
  setups.push({
    dir,
    entry: lv.entry,
    sl: lv.sl,
    tp,
    distal,
    proximal,
    barIndex: i,
    barTime: b.time,
    mode: "sweep",
    late: chaseR > cfg.maxLateR,
    chaseR,
  });
}

/** Classic SWEEP scan — early arm (no impulse wait) + late flag. */
export function scanTrhSetups(bars: Bar[], cfg: TrhConfig = DEFAULT_TRH_CONFIG): TrhSetup[] {
  const setups: TrhSetup[] = [];
  const p = cfg.pivotPeriod;
  const pivLo: { price: number; bar: number }[] = [];
  const pivHi: { price: number; bar: number }[] = [];

  let pending: Pending | null = null;
  let lastSetupBar = -9999;

  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const a = atr(bars, i);

    const pl = pivotLow(bars, i - p, p);
    const ph = pivotHigh(bars, i - p, p);
    if (pl !== null) {
      pivLo.push({ price: pl, bar: i - p });
      if (pivLo.length > 30) pivLo.shift();
    }
    if (ph !== null) {
      pivHi.push({ price: ph, bar: i - p });
      if (pivHi.length > 30) pivHi.shift();
    }

    const huntLo = lastPivot(pivLo, i, 80, p, true);
    const huntHi = lastPivot(pivHi, i, 80, p, false);

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

    const canStart = !pending && i - lastSetupBar >= cfg.cooldownBars;

    if (canStart && bullSweep && huntLo !== null) {
      pending = { dir: 1, distal: b.low, hunt: huntLo, bar: i, baseHigh: b.high, baseLow: b.low };
    } else if (canStart && bearSweep && huntHi !== null) {
      pending = { dir: -1, distal: b.high, hunt: huntHi, bar: i, baseHigh: b.high, baseLow: b.low };
    }

    if (!pending) continue;

    const prevBaseHigh = pending.baseHigh;
    const prevBaseLow = pending.baseLow;

    pending.baseHigh = Math.max(pending.baseHigh, b.high);
    pending.baseLow = Math.min(pending.baseLow, b.low);
    if (pending.dir === 1 && b.low < pending.distal) pending.distal = b.low;
    if (pending.dir === -1 && b.high > pending.distal) pending.distal = b.high;

    const age = i - pending.bar;
    if (age > cfg.maxBaseBars) {
      pending = null;
      continue;
    }
    if (age < cfg.baseConfirmBars) continue;

    if (pending.dir === 1) {
      const distal = pending.distal;
      const proximal = pending.baseHigh;
      const width = proximal - distal;
      const microBreak =
        b.close > b.open && (b.high >= prevBaseHigh || b.close >= distal + width * 0.7);
      const widthOk = width >= a * cfg.minRoomAtr && width <= a * cfg.maxRoomAtr;
      const confirm = widthOk && (!cfg.requireImpulse || microBreak);
      if (confirm) {
        pushSetup(setups, 1, proximal, distal, a, cfg, pivHi, pivLo, i, b);
        lastSetupBar = i;
        pending = null;
      }
    } else {
      const distal = pending.distal;
      const proximal = pending.baseLow;
      const width = distal - proximal;
      const microBreak =
        b.close < b.open && (b.low <= prevBaseLow || b.close <= distal - width * 0.7);
      const widthOk = width >= a * cfg.minRoomAtr && width <= a * cfg.maxRoomAtr;
      const confirm = widthOk && (!cfg.requireImpulse || microBreak);
      if (confirm) {
        pushSetup(setups, -1, proximal, distal, a, cfg, pivHi, pivLo, i, b);
        lastSetupBar = i;
        pending = null;
      }
    }
  }

  return setups;
}
