const DEFAULT_TRH_CONFIG = {
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
  huntOnSweep: true,
  huntRoomAtr: 1.2
};
function atr(bars, i, len = 14) {
  if (i < 1) return bars[i].high - bars[i].low;
  let sum = 0;
  const start = Math.max(1, i - len + 1);
  for (let j = start; j <= i; j++) {
    sum += Math.max(
      bars[j].high - bars[j].low,
      Math.abs(bars[j].high - bars[j - 1].close),
      Math.abs(bars[j].low - bars[j - 1].close)
    );
  }
  return sum / (i - start + 1);
}
function pivotLow(bars, i, p) {
  if (i < p || i >= bars.length - p) return null;
  const v = bars[i].low;
  for (let j = i - p; j <= i + p; j++) if (j !== i && bars[j].low <= v) return null;
  return v;
}
function pivotHigh(bars, i, p) {
  if (i < p || i >= bars.length - p) return null;
  const v = bars[i].high;
  for (let j = i - p; j <= i + p; j++) if (j !== i && bars[j].high >= v) return null;
  return v;
}
function lastPivot(pivots, i, maxAge, p, lowSide) {
  let best = null;
  for (const pv of pivots) {
    const age = i - pv.bar;
    if (age >= p && age <= maxAge) {
      if (best === null || (lowSide ? pv.price <= best : pv.price >= best)) best = pv.price;
    }
  }
  return best;
}
function levels(dir, proximal, distal, a, cfg, close) {
  const entry = (proximal + distal) / 2;
  const pad = a * cfg.slPadAtr;
  const sl = dir === 1 ? distal - pad : distal + pad;
  const risk = Math.abs(entry - sl);
  const tp = dir === 1 ? entry + risk * cfg.riskReward : entry - risk * cfg.riskReward;
  const chaseR = risk > 0 ? (dir === 1 ? (close - entry) / risk : (entry - close) / risk) : 0;
  return { entry, sl, tp, risk, chaseR };
}
function nextLiqHigh(pivHi, from, minDist) {
  let best = null;
  for (const p of pivHi) {
    if (p.price >= from + minDist && (best === null || p.price < best)) best = p.price;
  }
  return best;
}
function nextLiqLow(pivLo, from, minDist) {
  let best = null;
  for (const p of pivLo) {
    if (p.price <= from - minDist && (best === null || p.price > best)) best = p.price;
  }
  return best;
}
function pushSetup(setups, dir, proximal, distal, a, cfg, pivHi, pivLo, i, b, mode) {
  const lv = levels(dir, proximal, distal, a, cfg, b.close);
  const liq = dir === 1 ? nextLiqHigh(pivHi, lv.entry, lv.risk * 1.5) : nextLiqLow(pivLo, lv.entry, lv.risk * 1.5);
  const tp = liq !== null ? (dir === 1 ? Math.max(lv.tp, liq) : Math.min(lv.tp, liq)) : lv.tp;
  setups.push({
    dir,
    entry: lv.entry,
    sl: lv.sl,
    tp,
    distal,
    proximal,
    barIndex: i,
    barTime: b.time,
    mode,
    late: lv.chaseR > cfg.maxLateR,
    chaseR: lv.chaseR
  });
}
function scanTrhSetups(bars, cfg = DEFAULT_TRH_CONFIG) {
  const setups = [];
  const p = cfg.pivotPeriod;
  const pivLo = [];
  const pivHi = [];
  let pending = null;
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
    const bullSweep = huntLo !== null && b.low < huntLo - a * cfg.minSweepAtr && b.close > huntLo && b.close > b.open && priorHigh - b.low >= a * cfg.minContextAtr;
    const bearSweep = huntHi !== null && b.high > huntHi + a * cfg.minSweepAtr && b.close < huntHi && b.close < b.open && b.high - priorLow >= a * cfg.minContextAtr;
    const canStart = !pending && i - lastSetupBar >= cfg.cooldownBars;

    if (cfg.huntOnSweep && canStart && bullSweep && huntLo !== null) {
      const distal = b.low;
      const entry = Math.max(huntLo, distal + a * 0.25);
      const proximal = Math.max(entry + (entry - distal), distal + a * cfg.huntRoomAtr);
      const pad = a * cfg.slPadAtr;
      const sl = distal - pad;
      const risk = entry - sl;
      const tpRR = entry + risk * cfg.riskReward;
      const liq = nextLiqHigh(pivHi, entry, risk * 1.5);
      const tp = liq !== null ? Math.max(tpRR, liq) : tpRR;
      const chaseR = risk > 0 ? (b.close - entry) / risk : 0;
      setups.push({
        dir: 1, entry, sl, tp, distal, proximal,
        barIndex: i, barTime: b.time, mode: "hunt",
        late: chaseR > 2.0, chaseR
      });
      lastSetupBar = i;
      continue;
    }
    if (cfg.huntOnSweep && canStart && bearSweep && huntHi !== null) {
      const distal = b.high;
      const entry = Math.min(huntHi, distal - a * 0.25);
      const proximal = Math.min(entry - (distal - entry), distal - a * cfg.huntRoomAtr);
      const pad = a * cfg.slPadAtr;
      const sl = distal + pad;
      const risk = sl - entry;
      const tpRR = entry - risk * cfg.riskReward;
      const liq = nextLiqLow(pivLo, entry, risk * 1.5);
      const tp = liq !== null ? Math.min(tpRR, liq) : tpRR;
      const chaseR = risk > 0 ? (entry - b.close) / risk : 0;
      setups.push({
        dir: -1, entry, sl, tp, distal, proximal,
        barIndex: i, barTime: b.time, mode: "hunt",
        late: chaseR > 2.0, chaseR
      });
      lastSetupBar = i;
      continue;
    }
    if (cfg.huntOnSweep) continue;

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
      const microBreak = b.close > b.open && (b.high >= prevBaseHigh || b.close >= distal + width * 0.7);
      const widthOk = width >= a * cfg.minRoomAtr && width <= a * cfg.maxRoomAtr;
      const confirm = widthOk && (!cfg.requireImpulse || microBreak);
      if (confirm) {
        pushSetup(setups, 1, proximal, distal, a, cfg, pivHi, pivLo, i, b, "sweep");
        lastSetupBar = i;
        pending = null;
      }
    } else {
      const distal = pending.distal;
      const proximal = pending.baseLow;
      const width = distal - proximal;
      const microBreak = b.close < b.open && (b.low <= prevBaseLow || b.close <= distal - width * 0.7);
      const widthOk = width >= a * cfg.minRoomAtr && width <= a * cfg.maxRoomAtr;
      const confirm = widthOk && (!cfg.requireImpulse || microBreak);
      if (confirm) {
        pushSetup(setups, -1, proximal, distal, a, cfg, pivHi, pivLo, i, b, "sweep");
        lastSetupBar = i;
        pending = null;
      }
    }
  }
  return setups;
}
export {
  DEFAULT_TRH_CONFIG,
  scanTrhSetups
};
