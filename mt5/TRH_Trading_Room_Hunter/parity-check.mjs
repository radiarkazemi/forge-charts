#!/usr/bin/env node
/**
 * Parity check: MT5 TRH defaults + detector must match Pine / JS engine.
 * Run: node mt5/TRH_Trading_Room_Hunter/parity-check.mjs
 */
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { DEFAULT_TRH_CONFIG, scanTrhSetups } from "../../indicators/trh-engine.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = __dirname;

const EXPECTED = {
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

function assert(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("OK  ", msg);
}

// 1) JS defaults match documented Pine sample
for (const [k, v] of Object.entries(EXPECTED)) {
  assert(DEFAULT_TRH_CONFIG[k] === v, `JS DEFAULT_TRH_CONFIG.${k} === ${v}`);
}

// 2) MT5 sources ship the same numeric defaults
const files = [
  "TRH_Engine.mqh",
  "TRH_Trading_Room_Hunter.mq5",
  "TRH_AutoTrade.mq5",
];
const sources = Object.fromEntries(
  files.map((f) => [f, readFileSync(join(root, f), "utf8")]),
);

assert(sources["TRH_Engine.mqh"].includes("cfg.pivotPeriod     = 5"), "Engine default pivotPeriod=5");
assert(sources["TRH_Engine.mqh"].includes("cfg.riskReward      = 2.4"), "Engine default riskReward=2.4");
assert(sources["TRH_Engine.mqh"].includes("cfg.baseConfirmBars = 8"), "Engine default baseConfirmBars=8");
assert(sources["TRH_Trading_Room_Hunter.mq5"].includes('InpPivotPeriod     = 5'), "Indicator InpPivotPeriod=5");
assert(sources["TRH_Trading_Room_Hunter.mq5"].includes("InpRiskReward      = 2.4"), "Indicator InpRiskReward=2.4");
assert(sources["TRH_AutoTrade.mq5"].includes("InpAutoTrade         = true"), "EA AutoTrade ON by default");
assert(sources["TRH_Engine.mqh"].includes("Wilder RMA"), "Engine ATR is Wilder RMA (Pine ta.atr)");
assert(sources["TRH_Trading_Room_Hunter.mq5"].includes("InpTradeMode = TRH_TM_BOTH"), "Indicator default A+B");
assert(sources["TRH_AutoTrade.mq5"].includes("InpTradeMode = TRH_TM_BOTH"), "EA default A+B");
assert(sources["TRH_AutoTrade.mq5"].includes("InpRiskReward      = 2.4"), "EA InpRiskReward=2.4");
assert(sources["TRH_AutoTrade.mq5"].includes('#include "TRH_Engine.mqh"'), "EA includes shared engine");
assert(sources["TRH_Trading_Room_Hunter.mq5"].includes('#include "TRH_Engine.mqh"'), "Indicator includes shared engine");

// Pine prior-range excludes current bar — engine must document / implement that
assert(
  sources["TRH_Engine.mqh"].includes("exclude current bar") ||
    sources["TRH_Engine.mqh"].includes("high[1], 40"),
  "Engine priorHigh excludes current bar (Pine parity)",
);

// 3) Synthetic sweep geometry → one LONG with mid-room entry
function bar(t, o, h, l, c) {
  return { time: t, open: o, high: h, low: l, close: c };
}

const bars = [];
let t0 = 1_700_000_000;
// Quiet range then selloff into a pivot low, sweep, base, micro-break
for (let i = 0; i < 80; i++) {
  const base = 100 + Math.sin(i / 7) * 0.3;
  bars.push(bar(t0 + i * 60, base, base + 0.4, base - 0.4, base + 0.1));
}
// Build a clear pivot low around bar 90
for (let i = 80; i < 100; i++) {
  const px = 99.5 - (i - 80) * 0.15;
  bars.push(bar(t0 + i * 60, px + 0.2, px + 0.5, px, px + 0.15));
}
// Bounce / base after low
for (let i = 100; i < 108; i++) {
  bars.push(bar(t0 + i * 60, 97.2, 97.8, 97.0, 97.5));
}
// Deeper sweep then reclaim (bullish)
bars.push(bar(t0 + 108 * 60, 97.3, 97.6, 96.2, 97.45)); // sweep low 96.2, close reclaim
// Base build ≥8 bars with room width
for (let i = 109; i < 118; i++) {
  bars.push(bar(t0 + i * 60, 97.4, 98.4, 97.1, 97.9));
}
// Micro-break: bullish close pressing base high
bars.push(bar(t0 + 118 * 60, 97.8, 98.9, 97.6, 98.7));
// Padding so pivots can confirm
for (let i = 119; i < 140; i++) {
  bars.push(bar(t0 + i * 60, 98.5, 99.0, 98.2, 98.6));
}

const setups = scanTrhSetups(bars);
assert(setups.length >= 1, `synthetic sweep produced ≥1 setup (got ${setups.length})`);
const last = setups[setups.length - 1];
assert(last.dir === 1, `last setup is LONG (dir=${last.dir})`);
assert(last.entry > last.sl, `ENTRY ${last.entry} > SL ${last.sl}`);
assert(last.tp > last.entry, `TP ${last.tp} > ENTRY ${last.entry}`);
const mid = (last.proximal + last.distal) / 2;
assert(Math.abs(last.entry - mid) < 1e-9, `ENTRY is mid-room (${last.entry} vs ${mid})`);

console.log("\nLast synthetic setup:", {
  dir: last.dir === 1 ? "LONG" : "SHORT",
  entry: +last.entry.toFixed(4),
  sl: +last.sl.toFixed(4),
  tp: +last.tp.toFixed(4),
  distal: +last.distal.toFixed(4),
  proximal: +last.proximal.toFixed(4),
});
console.log("\nAll parity checks passed. Install MT5 indicator next and compare vs TradingView.");
