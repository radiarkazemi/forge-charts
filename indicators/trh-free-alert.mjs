#!/usr/bin/env node
/**
 * FREE TRH mobile alerts — no TradingView subscription needed.
 *
 * Uses ntfy.sh (free push app) and/or Telegram bot.
 *
 * Setup:
 *   1. Install "ntfy" app on phone → subscribe to your secret topic
 *   2. export NTFY_TOPIC="your-secret-topic-name"
 *   3. node indicators/trh-free-alert.mjs
 *
 * Optional Telegram:
 *   export TELEGRAM_BOT_TOKEN="..."
 *   export TELEGRAM_CHAT_ID="..."
 *
 * Optional (FxPro vs GC=F price offset):
 *   export TRH_PRICE_OFFSET="56"
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dir = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = join(__dir, ".trh-alert-state.json");

const POLL_SEC = Number(process.env.TRH_POLL_SEC || 60);
const NTFY_TOPIC = process.env.NTFY_TOPIC || "";
const NTFY_SERVER = process.env.NTFY_SERVER || "https://ntfy.sh";
const TELEGRAM_BOT = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT = process.env.TELEGRAM_CHAT_ID || "";
const PRICE_OFFSET = Number(process.env.TRH_PRICE_OFFSET || 0);
const SYMBOL_LABEL = process.env.TRH_SYMBOL || "XAUUSD";

// ── minimal TRH engine (inline for .mjs — keep in sync with trh-engine.ts) ──

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

function atr(bars, i, len = 14) {
  let sum = 0;
  const start = Math.max(1, i - len + 1);
  for (let j = start; j <= i; j++) {
    const tr = Math.max(
      bars[j].high - bars[j].low,
      Math.abs(bars[j].high - bars[j - 1].close),
      Math.abs(bars[j].low - bars[j - 1].close),
    );
    sum += tr;
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
  let bestBar = -1;
  for (const pv of pivots) {
    const age = i - pv.bar;
    if (age >= p && age <= maxAge) {
      if (best === null || (lowSide ? pv.price <= best : pv.price >= best)) {
        best = pv.price;
        bestBar = pv.bar;
      }
    }
  }
  return { price: best, bar: bestBar };
}

function levels(dir, proximal, distal, a) {
  const entry = (proximal + distal) / 2;
  const pad = a * CFG.slPadAtr;
  const sl = dir === 1 ? distal - pad : distal + pad;
  const risk = Math.abs(entry - sl);
  const tp = dir === 1 ? entry + risk * CFG.riskReward : entry - risk * CFG.riskReward;
  return { entry, sl, tp };
}

function validRoom(dir, proximal, distal, a) {
  const w = Math.abs(proximal - distal);
  if (w <= 0) return false;
  if (dir === 1 && distal >= proximal) return false;
  if (dir === -1 && distal <= proximal) return false;
  if (w < a * CFG.minRoomAtr || w > a * CFG.maxRoomAtr) return false;
  return true;
}

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

    const { price: huntLo } = lastPivot(pivLo, i, 80, p, true);
    const { price: huntHi } = lastPivot(pivHi, i, 80, p, false);
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

    if (!pending && i - lastSetupBar >= CFG.cooldownBars) {
      if (bullSweep && huntLo !== null)
        pending = { dir: 1, distal: b.low, bar: i, baseHigh: b.high, baseLow: b.low };
      else if (bearSweep && huntHi !== null)
        pending = { dir: -1, distal: b.high, bar: i, baseHigh: b.high, baseLow: b.low };
    }

    if (pending) {
      pending.baseHigh = Math.max(pending.baseHigh, b.high);
      pending.baseLow = Math.min(pending.baseLow, b.low);
      if (pending.dir === 1 && b.low < pending.distal) pending.distal = b.low;
      if (pending.dir === -1 && b.high > pending.distal) pending.distal = b.high;

      const age = i - pending.bar;
      if (age > CFG.maxBaseBars) {
        pending = null;
        continue;
      }

      if (age >= CFG.baseConfirmBars) {
        let ok = false;
        if (pending.dir === 1) {
          const distal = pending.distal;
          const proximal = pending.baseHigh;
          const width = proximal - distal;
          const prevBaseHigh = i > pending.bar ? bars[i - 1].high : proximal;
          const microBreak = b.close > b.open && (b.high >= prevBaseHigh || b.close >= distal + width * 0.7);
          if (validRoom(1, proximal, distal, a) && microBreak) {
            const lv = levels(1, proximal, distal, a);
            setups.push({ dir: 1, ...lv, barTime: b.time, barIndex: i });
            ok = true;
          }
        } else {
          const distal = pending.distal;
          const proximal = pending.baseLow;
          const width = distal - proximal;
          const prevBaseLow = i > pending.bar ? bars[i - 1].low : proximal;
          const microBreak = b.close < b.open && (b.low <= prevBaseLow || b.close <= distal - width * 0.7);
          if (validRoom(-1, proximal, distal, a) && microBreak) {
            const lv = levels(-1, proximal, distal, a);
            setups.push({ dir: -1, ...lv, barTime: b.time, barIndex: i });
            ok = true;
          }
        }
        if (ok) {
          lastSetupBar = i;
          pending = null;
        }
      }
    }
  }
  return setups;
}

// ── data + notify ──

async function fetchGold1m() {
  const url = "https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF?interval=1m&range=1d";
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 TRH-Alert" } });
  if (!res.ok) throw new Error(`Yahoo ${res.status}`);
  const j = await res.json();
  const r = j.chart.result[0];
  const ts = r.timestamp;
  const q = r.indicators.quote[0];
  const bars = [];
  for (let i = 0; i < ts.length; i++) {
    const o = q.open[i];
    if (o == null) continue;
    bars.push({
      time: ts[i],
      open: o - PRICE_OFFSET,
      high: q.high[i] - PRICE_OFFSET,
      low: q.low[i] - PRICE_OFFSET,
      close: q.close[i] - PRICE_OFFSET,
    });
  }
  return bars;
}

function loadState() {
  if (!existsSync(STATE_FILE)) return { lastAlertTime: 0 };
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf8"));
  } catch {
    return { lastAlertTime: 0 };
  }
}

function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function fmt(n) {
  return n.toFixed(2);
}

function setupMessage(s) {
  const side = s.dir === 1 ? "LONG" : "SHORT";
  return (
    `${SYMBOL_LABEL} 1m | TRH ${side} SETUP\n` +
    `ENTRY ${fmt(s.entry)}\n` +
    `SL ${fmt(s.sl)}\n` +
    `TP ${fmt(s.tp)}`
  );
}

async function notifyNtfy(title, message) {
  if (!NTFY_TOPIC) return false;
  const res = await fetch(`${NTFY_SERVER}/${NTFY_TOPIC}`, {
    method: "POST",
    headers: {
      Title: title,
      Priority: "high",
      Tags: "chart_with_upwards_trend,moneybag",
    },
    body: message,
  });
  return res.ok;
}

async function notifyTelegram(message) {
  if (!TELEGRAM_BOT || !TELEGRAM_CHAT) return false;
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT, text: message }),
  });
  return res.ok;
}

async function tick() {
  const bars = await fetchGold1m();
  if (bars.length < 100) {
    console.log("[trh] not enough bars yet");
    return;
  }
  const setups = scanTrhSetups(bars);
  if (setups.length === 0) return;

  const latest = setups[setups.length - 1];
  const state = loadState();

  // Only alert if setup bar is recent (last 3 bars) and not already alerted
  const lastBar = bars[bars.length - 1];
  const barsSinceSetup = bars.length - 1 - latest.barIndex;
  if (barsSinceSetup > 2) return;
  if (state.lastAlertTime === latest.barTime) return;

  const msg = setupMessage(latest);
  const title = `TRH ${latest.dir === 1 ? "LONG" : "SHORT"} Hunt`;

  console.log("[trh] NEW SETUP\n" + msg);

  let sent = false;
  if (NTFY_TOPIC) {
    sent = (await notifyNtfy(title, msg)) || sent;
    console.log("[trh] ntfy →", sent ? "ok" : "fail");
  }
  if (TELEGRAM_BOT) {
    sent = (await notifyTelegram(msg)) || sent;
    console.log("[trh] telegram →", sent ? "ok" : "fail");
  }
  if (!NTFY_TOPIC && !TELEGRAM_BOT) {
    console.log("[trh] set NTFY_TOPIC or TELEGRAM_* to receive mobile push");
    return;
  }

  state.lastAlertTime = latest.barTime;
  saveState(state);
}

async function main() {
  console.log(`[trh] free alert monitor — poll every ${POLL_SEC}s`);
  if (!NTFY_TOPIC && !TELEGRAM_BOT) {
    console.log("[trh] ⚠ no notifier configured. See indicators/FREE-ALERTS.md");
  }
  await tick();
  setInterval(tick, POLL_SEC * 1000);
}

main().catch((e) => {
  console.error("[trh] fatal", e);
  process.exit(1);
});
