/**
 * TRH Chrome extension v2 — classic SWEEP on VPS FOREXCOM XAUUSD.
 * Data: http://185.222.163.116/crypto-chart/history (cp_fetcher Mongo)
 */

const CFG = {
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
};

const API_BASES = [
  "https://goldanil.ir/trh-api",
  "http://185.222.163.116/trh-api",
  "https://goldanil.ir/crypto-chart",
  "http://185.222.163.116/crypto-chart",
];
const SYMBOL = "XAUUSD";
const FEED = "FOREXCOM";
const LOOKBACK = 500;
const MAX_AGE_BARS = 3;
const MIN_RISK = 2.0;

function atr(bars, i, len = 14) {
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

function levels(dir, proximal, distal, a, pivHi, pivLo) {
  const entry = (proximal + distal) / 2;
  const pad = a * CFG.slPadAtr;
  const sl = dir === 1 ? distal - pad : distal + pad;
  const risk = Math.abs(entry - sl);
  let tp = dir === 1 ? entry + risk * CFG.riskReward : entry - risk * CFG.riskReward;
  if (dir === 1) {
    const liq = nextLiqHigh(pivHi, entry, risk * 1.5);
    if (liq !== null) tp = Math.max(tp, liq);
  } else {
    const liq = nextLiqLow(pivLo, entry, risk * 1.5);
    if (liq !== null) tp = Math.min(tp, liq);
  }
  return { entry, sl, tp, risk };
}

/** Classic SWEEP — mirrors indicators/trh-engine.mjs */
function scanTrhSetups(bars) {
  const setups = [];
  const p = CFG.pivotPeriod;
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

    const bullSweep =
      huntLo !== null &&
      b.low < huntLo - a * CFG.minSweepAtr &&
      b.close > huntLo &&
      b.close > b.open &&
      priorHigh - b.low >= a * CFG.minContextAtr;
    const bearSweep =
      huntHi !== null &&
      b.high > huntHi + a * CFG.minSweepAtr &&
      b.close < huntHi &&
      b.close < b.open &&
      b.high - priorLow >= a * CFG.minContextAtr;

    const canStart = !pending && i - lastSetupBar >= CFG.cooldownBars;
    if (canStart && bullSweep) {
      pending = { dir: 1, distal: b.low, bar: i, baseHigh: b.high, baseLow: b.low };
    } else if (canStart && bearSweep) {
      pending = { dir: -1, distal: b.high, bar: i, baseHigh: b.high, baseLow: b.low };
    }

    if (!pending) continue;

    const prevBaseHigh = pending.baseHigh;
    const prevBaseLow = pending.baseLow;
    pending.baseHigh = Math.max(pending.baseHigh, b.high);
    pending.baseLow = Math.min(pending.baseLow, b.low);
    if (pending.dir === 1 && b.low < pending.distal) pending.distal = b.low;
    if (pending.dir === -1 && b.high > pending.distal) pending.distal = b.high;

    const age = i - pending.bar;
    if (age > CFG.maxBaseBars) {
      pending = null;
      continue;
    }
    if (age < CFG.baseConfirmBars) continue;

    if (pending.dir === 1) {
      const distal = pending.distal;
      const proximal = pending.baseHigh;
      const width = proximal - distal;
      const microBreak =
        b.close > b.open && (b.high >= prevBaseHigh || b.close >= distal + width * 0.7);
      if (width >= a * CFG.minRoomAtr && width <= a * CFG.maxRoomAtr && microBreak) {
        const lv = levels(1, proximal, distal, a, pivHi, pivLo);
        setups.push({
          dir: 1,
          ...lv,
          distal,
          proximal,
          barIndex: i,
          barTime: b.time,
          mode: "sweep",
        });
        lastSetupBar = i;
        pending = null;
      }
    } else {
      const distal = pending.distal;
      const proximal = pending.baseLow;
      const width = distal - proximal;
      const microBreak =
        b.close < b.open && (b.low <= prevBaseLow || b.close <= distal - width * 0.7);
      if (width >= a * CFG.minRoomAtr && width <= a * CFG.maxRoomAtr && microBreak) {
        const lv = levels(-1, proximal, distal, a, pivHi, pivLo);
        setups.push({
          dir: -1,
          ...lv,
          distal,
          proximal,
          barIndex: i,
          barTime: b.time,
          mode: "sweep",
        });
        lastSetupBar = i;
        pending = null;
      }
    }
  }
  return setups;
}

async function fetchBarsFromBase(base) {
  const path = base.includes("/trh-api")
    ? `${base}/bars?limit=${LOOKBACK}`
    : `${base}/history?symbol=xauusd&timeframe=1m&limit=${LOOKBACK}`;
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`${base} HTTP ${res.status}`);
  const j = await res.json();
  if (!j.bars || !j.bars.length) throw new Error(`${base} empty bars`);
  return j.bars.map((row) => ({
    time: row[0],
    open: row[1],
    high: row[2],
    low: row[3],
    close: row[4],
  }));
}

async function fetchForexcomBars() {
  let lastErr;
  for (const base of API_BASES) {
    try {
      const bars = await fetchBarsFromBase(base);
      return { bars, source: base };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("all API bases failed");
}

function notifySetup(s) {
  const side = s.dir === 1 ? "LONG" : "SHORT";
  const payload = {
    side,
    entry: s.entry,
    sl: s.sl,
    tp: s.tp,
    barTime: s.barTime,
    feed: FEED,
    title: `TRH ${side} SETUP`,
    message: `${SYMBOL} ${FEED} 1m | TRH ${side}\nENTRY ${s.entry.toFixed(2)}\nSL ${s.sl.toFixed(2)}\nTP ${s.tp.toFixed(2)}`,
  };
  chrome.storage.local.set({ lastSetup: payload, lastScan: Date.now() });
  chrome.notifications.create(`trh-${s.barTime}`, {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: payload.title,
    message: payload.message,
    priority: 2,
    requireInteraction: true,
  });
}

async function scan() {
  try {
    const { bars, source } = await fetchForexcomBars();
    const last = bars[bars.length - 1];
    await chrome.storage.local.set({
      lastScan: Date.now(),
      lastPrice: last?.close,
      lastBarTime: last?.time,
      dataSource: source,
      status: "ok",
      error: null,
    });

    if (bars.length < 120) return;

    const setups = scanTrhSetups(bars);
    if (!setups.length) return;

    const s = setups[setups.length - 1];
    const age = bars.length - 1 - s.barIndex;
    const risk = Math.abs(s.entry - s.sl);
    if (age > MAX_AGE_BARS) return;
    if (risk < MIN_RISK) return;

    const { lastAlertTime } = await chrome.storage.local.get("lastAlertTime");
    if (lastAlertTime === s.barTime) return;

    await chrome.storage.local.set({ lastAlertTime: s.barTime });
    notifySetup(s);
  } catch (e) {
    console.error("TRH scan", e);
    await chrome.storage.local.set({
      lastScan: Date.now(),
      status: "error",
      error: String(e.message || e),
    });
  }
}

function ensureAlarm() {
  chrome.alarms.create("trh-scan", { periodInMinutes: 1 });
}

chrome.runtime.onInstalled.addListener(() => {
  ensureAlarm();
  scan();
});

chrome.runtime.onStartup.addListener(() => {
  ensureAlarm();
  scan();
});

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "trh-scan") scan();
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "scan-now") {
    scan().then(() => sendResponse({ ok: true }));
    return true;
  }
});

ensureAlarm();
scan();
