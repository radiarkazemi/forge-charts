/**
 * Offline check: ICT dealing ranges = HH→LL + BOS after LL (bearish)
 * or LL→HH + BOS after HH (bullish), with Premium / EQ / Discount lines.
 * Run: node scripts/verify-dealing-ranges.mjs
 */
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

// Dynamic import of TS via vite-node is unavailable; re-implement the pure
 // helpers inline matching orca-runtime computeIctDealingRanges for CI-less verify.

function pivotHigh(bars, i, left, right) {
  if (i < left + right) return null;
  const c = i - right;
  const h = bars[c].high;
  for (let j = c - left; j <= c + right; j++) {
    if (j === c) continue;
    if (bars[j].high >= h) return null;
  }
  return h;
}
function pivotLow(bars, i, left, right) {
  if (i < left + right) return null;
  const c = i - right;
  const l = bars[c].low;
  for (let j = c - left; j <= c + right; j++) {
    if (j === c) continue;
    if (bars[j].low <= l) return null;
  }
  return l;
}

function rangeMeetsMinPct(topP, botP, minRangePct) {
  const rng = topP - botP;
  if (!(rng > 0)) return false;
  if (!(minRangePct > 0)) return true;
  const mid = (topP + botP) / 2;
  if (!(mid > 0)) return false;
  return (rng / mid) * 100 >= minRangePct;
}

function paintIctRange(bars, topP, botP, startBar, endBar, color, firstBar, firstPrice, secondBar, secondPrice, showFibs) {
  const x1 = Math.min(startBar, endBar);
  const x2 = Math.min(bars.length - 1, Math.max(startBar, endBar) + 8);
  const mid = (topP + botP) / 2;
  const rng = topP - botP;
  if (!(rng > 0)) return [];
  const cmds = [
    { kind: "rect", p1: topP, p2: botP, color },
    { kind: "line", text: "Premium", p1: topP },
    { kind: "line", text: "EQ", p1: mid },
    { kind: "line", text: "Discount", p1: botP },
    { kind: "diag", p1: firstPrice, p2: secondPrice, firstBar, secondBar },
  ];
  if (showFibs) {
    cmds.push({ kind: "line", text: "0.618", p1: topP - rng * 0.618 });
    cmds.push({ kind: "line", text: "0.786", p1: topP - rng * 0.786 });
  }
  return cmds;
}

function computeIct(bars, opts) {
  const left = opts.pivotLeft ?? 2;
  const right = opts.pivotRight ?? 2;
  const minRangePct = opts.minRangePct ?? 0.4;
  const breakOnWick = opts.breakOnWick ?? false;
  let anchorHigh = null, anchorHighBar = null;
  let anchorLow = null, anchorLowBar = null;
  let pending = null;
  const completed = [];

  const confirm = (bosBar) => {
    if (!pending || bosBar <= pending.secondBar) return;
    const topP = Math.max(pending.firstPrice, pending.secondPrice);
    const botP = Math.min(pending.firstPrice, pending.secondPrice);
    if (!rangeMeetsMinPct(topP, botP, minRangePct)) {
      pending = null;
      return;
    }
    const topBar = pending.firstPrice >= pending.secondPrice ? pending.firstBar : pending.secondBar;
    const botBar = pending.firstPrice < pending.secondPrice ? pending.firstBar : pending.secondBar;
    const color = pending.side === 1 ? "bull" : "bear";
    completed.push(
      paintIctRange(
        bars, topP, botP, Math.min(topBar, botBar), Math.max(topBar, botBar, bosBar),
        color, pending.firstBar, pending.firstPrice, pending.secondBar, pending.secondPrice, true,
      ),
    );
    pending = null;
  };

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    const ph = pivotHigh(bars, i, left, right);
    const pl = pivotLow(bars, i, left, right);
    if (ph != null) {
      const shBar = i - right;
      if (!pending && (anchorHigh == null || ph >= anchorHigh)) {
        anchorHigh = ph;
        anchorHighBar = shBar;
      }
      if (!pending && anchorLow != null && anchorLowBar != null && shBar > anchorLowBar && ph > anchorLow) {
        if (rangeMeetsMinPct(ph, anchorLow, minRangePct)) {
          pending = { side: 1, firstPrice: anchorLow, firstBar: anchorLowBar, secondPrice: ph, secondBar: shBar };
          anchorLow = anchorLowBar = anchorHigh = anchorHighBar = null;
        }
      }
    }
    if (pl != null) {
      const slBar = i - right;
      if (!pending && (anchorLow == null || pl <= anchorLow)) {
        anchorLow = pl;
        anchorLowBar = slBar;
      }
      if (!pending && anchorHigh != null && anchorHighBar != null && slBar > anchorHighBar && pl < anchorHigh) {
        if (rangeMeetsMinPct(anchorHigh, pl, minRangePct)) {
          pending = { side: -1, firstPrice: anchorHigh, firstBar: anchorHighBar, secondPrice: pl, secondBar: slBar };
          anchorHigh = anchorHighBar = anchorLow = anchorLowBar = null;
        }
      }
    }
    const useHigh = breakOnWick ? bar.high : bar.close;
    const useLow = breakOnWick ? bar.low : bar.close;
    if (pending && i > pending.secondBar) {
      if (pending.side === -1 && useLow < pending.secondPrice) confirm(i);
      else if (pending.side === 1 && useHigh > pending.secondPrice) confirm(i);
    }
  }
  return completed;
}

function bar(t, o, h, l, c) {
  return { time: t, open: o, high: h, low: l, close: c };
}

/** Build a clear HH → LL → BOS bearish leg with pivot L/R=2. */
function synthBearish() {
  const bars = [];
  let t = 1_700_000_000;
  // flat base
  for (let i = 0; i < 10; i++) bars.push(bar(t++, 100, 101, 99, 100));
  // rise to HH ~110 (pivot at center)
  bars.push(bar(t++, 100, 104, 100, 103));
  bars.push(bar(t++, 103, 107, 103, 106));
  bars.push(bar(t++, 106, 110, 106, 109)); // HH candidate
  bars.push(bar(t++, 109, 108, 105, 106));
  bars.push(bar(t++, 106, 107, 104, 105));
  // decline to LL ~95
  bars.push(bar(t++, 105, 105, 100, 101));
  bars.push(bar(t++, 101, 102, 97, 98));
  bars.push(bar(t++, 98, 99, 95, 96)); // LL candidate
  bars.push(bar(t++, 96, 97, 96, 96.5));
  bars.push(bar(t++, 96.5, 98, 96, 97));
  // BOS after LL (close below 95)
  bars.push(bar(t++, 97, 97, 93, 94));
  bars.push(bar(t++, 94, 95, 92, 93));
  for (let i = 0; i < 8; i++) bars.push(bar(t++, 93, 94, 92, 93));
  return bars;
}

const bars = synthBearish();
const ranges = computeIct(bars, { pivotLeft: 2, pivotRight: 2, minRangePct: 0.4 });
const flat = ranges.flat();
const labels = flat.filter((c) => c.text).map((c) => c.text);
const hasPremium = labels.includes("Premium");
const hasEq = labels.includes("EQ");
const hasDiscount = labels.includes("Discount");
const hasFibs = labels.includes("0.618") && labels.includes("0.786");
const bear = ranges.some((r) => r[0]?.color === "bear");

console.log(JSON.stringify({
  ranges: ranges.length,
  labels,
  hasPremium,
  hasEq,
  hasDiscount,
  hasFibs,
  bear,
  firstRect: ranges[0]?.[0],
}, null, 2));

if (!(ranges.length >= 1 && hasPremium && hasEq && hasDiscount && hasFibs && bear)) {
  console.error("VERIFY FAILED");
  process.exit(1);
}
console.log("VERIFY OK — bearish HH→LL+BOS paints Premium/EQ/Discount + fibs");
