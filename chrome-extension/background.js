/* TRH Chrome extension — zero config desktop notifications */

const CFG = {
  pivotPeriod: 5, minContextAtr: 1.2, minSweepAtr: 0.05, baseConfirmBars: 8,
  maxBaseBars: 40, minRoomAtr: 0.8, maxRoomAtr: 3.5, cooldownBars: 50,
  slPadAtr: 0.02, riskReward: 2.4,
};
const PRICE_OFFSET = 56;
const SYMBOL = "XAUUSD";

function atr(bars, i, len = 14) {
  let sum = 0;
  const start = Math.max(1, i - len + 1);
  for (let j = start; j <= i; j++) {
    sum += Math.max(bars[j].high - bars[j].low,
      Math.abs(bars[j].high - bars[j - 1].close),
      Math.abs(bars[j].low - bars[j - 1].close));
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

function levels(dir, proximal, distal, a) {
  const entry = (proximal + distal) / 2;
  const pad = a * CFG.slPadAtr;
  const sl = dir === 1 ? distal - pad : distal + pad;
  const risk = Math.abs(entry - sl);
  const tp = dir === 1 ? entry + risk * CFG.riskReward : entry - risk * riskReward;
  return { entry, sl, tp };
}

function validRoom(dir, proximal, distal, a) {
  const w = Math.abs(proximal - distal);
  if (w <= 0) return false;
  if (dir === 1 && distal >= proximal) return false;
  if (dir === -1 && distal <= proximal) return false;
  return w >= a * CFG.minRoomAtr && w <= a * CFG.maxRoomAtr;
}

function scanTrhSetups(bars) {
  const setups = [];
  const p = CFG.pivotPeriod;
  const pivLo = [], pivHi = [];
  let pending = null, lastSetupBar = -9999;

  for (let i = 0; i < bars.length; i++) {
    const b = bars[i], a = atr(bars, i);
    const pl = pivotLow(bars, i - p, p), ph = pivotHigh(bars, i - p, p);
    if (pl !== null) { pivLo.push({ price: pl, bar: i - p }); if (pivLo.length > 30) pivLo.shift(); }
    if (ph !== null) { pivHi.push({ price: ph, bar: i - p }); if (pivHi.length > 30) pivHi.shift(); }

    const huntLo = lastPivot(pivLo, i, 80, p, true);
    const huntHi = lastPivot(pivHi, i, 80, p, false);
    const slice = bars.slice(Math.max(0, i - 40), i);
    const priorHigh = slice.length ? Math.max(...slice.map(x => x.high)) : b.high;
    const priorLow = slice.length ? Math.min(...slice.map(x => x.low)) : b.low;

    const bullSweep = huntLo !== null && b.low < huntLo - a * CFG.minSweepAtr && b.close > huntLo &&
      b.close > b.open && priorHigh - b.low >= a * CFG.minContextAtr;
    const bearSweep = huntHi !== null && b.high > huntHi + a * CFG.minSweepAtr && b.close < huntHi &&
      b.close < b.open && b.high - priorLow >= a * CFG.minContextAtr;

    if (!pending && i - lastSetupBar >= CFG.cooldownBars) {
      if (bullSweep) pending = { dir: 1, distal: b.low, bar: i, baseHigh: b.high, baseLow: b.low };
      else if (bearSweep) pending = { dir: -1, distal: b.high, bar: i, baseHigh: b.high, baseLow: b.low };
    }

    if (pending) {
      pending.baseHigh = Math.max(pending.baseHigh, b.high);
      pending.baseLow = Math.min(pending.baseLow, b.low);
      if (pending.dir === 1 && b.low < pending.distal) pending.distal = b.low;
      if (pending.dir === -1 && b.high > pending.distal) pending.distal = b.high;
      const age = i - pending.bar;
      if (age > CFG.maxBaseBars) { pending = null; continue; }
      if (age >= CFG.baseConfirmBars) {
        let ok = false;
        if (pending.dir === 1) {
          const distal = pending.distal, proximal = pending.baseHigh, width = proximal - distal;
          const prevBaseHigh = i > pending.bar ? bars[i - 1].high : proximal;
          const microBreak = b.close > b.open && (b.high >= prevBaseHigh || b.close >= distal + width * 0.7);
          if (validRoom(1, proximal, distal, a) && microBreak) {
            setups.push({ dir: 1, ...levels(1, proximal, distal, a), barTime: b.time, barIndex: i });
            ok = true;
          }
        } else {
          const distal = pending.distal, proximal = pending.baseLow, width = distal - proximal;
          const prevBaseLow = i > pending.bar ? bars[i - 1].low : proximal;
          const microBreak = b.close < b.open && (b.low <= prevBaseLow || b.close <= distal - width * 0.7);
          if (validRoom(-1, proximal, distal, a) && microBreak) {
            setups.push({ dir: -1, ...levels(-1, proximal, distal, a), barTime: b.time, barIndex: i });
            ok = true;
          }
        }
        if (ok) { lastSetupBar = i; pending = null; }
      }
    }
  }
  return setups;
}

async function fetchGold1m() {
  const url = "https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF?interval=1m&range=1d";
  const res = await fetch(url);
  const j = await res.json();
  const r = j.chart.result[0];
  const bars = [];
  for (let i = 0; i < r.timestamp.length; i++) {
    const o = r.indicators.quote[0].open[i];
    if (o == null) continue;
    bars.push({
      time: r.timestamp[i],
      open: o - PRICE_OFFSET, high: r.indicators.quote[0].high[i] - PRICE_OFFSET,
      low: r.indicators.quote[0].low[i] - PRICE_OFFSET,
      close: r.indicators.quote[0].close[i] - PRICE_OFFSET,
    });
  }
  return bars;
}

function notifySetup(s) {
  const side = s.dir === 1 ? "LONG" : "SHORT";
  const payload = {
    side, entry: s.entry, sl: s.sl, tp: s.tp, barTime: s.barTime,
    title: `TRH ${side} Hunt`,
    message: `${SYMBOL} 1m | TRH ${side}\nENTRY ${s.entry.toFixed(2)}\nSL ${s.sl.toFixed(2)}\nTP ${s.tp.toFixed(2)}`,
  };
  chrome.storage.local.set({ lastSetup: payload, lastScan: Date.now() });
  chrome.notifications.create(`trh-${s.barTime}`, {
    type: "basic",
    iconUrl: "icon128.png",
    title: payload.title,
    message: payload.message,
    priority: 2,
    requireInteraction: true,
  });
}

async function scanLocal() {
  try {
    const bars = await fetchGold1m();
    chrome.storage.local.set({ lastScan: Date.now() });
    if (bars.length < 100) return;
    const setups = scanTrhSetups(bars);
    if (!setups.length) return;
    const s = setups[setups.length - 1];
    if (bars.length - 1 - s.barIndex > 3) return;
    const { lastAlertTime } = await chrome.storage.local.get("lastAlertTime");
    if (lastAlertTime === s.barTime) return;
    await chrome.storage.local.set({ lastAlertTime: s.barTime });
    notifySetup(s);
  } catch (e) {
    console.error("TRH scan", e);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("trh-scan", { periodInMinutes: 1 });
  scanLocal();
});

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "trh-scan") scanLocal();
});

scanLocal();
