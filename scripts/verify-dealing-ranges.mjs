/**
 * Offline check: ICT dealing ranges = HH→LL + BOS after LL (bearish)
 * or LL→HH + BOS after HH (bullish).
 * Run: node scripts/verify-dealing-ranges.mjs
 */

function pivotHigh(bars, i, left, right) {
  const c = i - right;
  if (c < left || i >= bars.length) return null;
  const h = bars[c].high;
  for (let j = c - left; j <= c + right; j++) {
    if (j === c) continue;
    if (bars[j].high >= h) return null;
  }
  return h;
}
function pivotLow(bars, i, left, right) {
  const c = i - right;
  if (c < left || i >= bars.length) return null;
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

function computeIct(bars, opts) {
  const left = opts.pivotLeft ?? 2;
  const right = opts.pivotRight ?? 2;
  const minRangePct = opts.minRangePct ?? 0.25;
  const breakOnWick = opts.breakOnWick ?? false;
  let anchorHigh = null;
  let anchorHighBar = null;
  let anchorLow = null;
  let anchorLowBar = null;
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
    completed.push({
      bullish: pending.side === 1,
      top: topP,
      bot: botP,
      mid: (topP + botP) / 2,
      first: pending.firstPrice,
      second: pending.secondPrice,
      bosBar,
    });
    pending = null;
  };

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    const ph = pivotHigh(bars, i, left, right);
    const pl = pivotLow(bars, i, left, right);
    if (ph != null) {
      const shBar = i - right;
      const open = pending;
      if (open && open.side === 1 && shBar > open.firstBar && ph > open.secondPrice) {
        pending = { ...open, secondPrice: ph, secondBar: shBar };
      } else if (!open) {
        if (anchorHigh == null || ph >= anchorHigh) {
          anchorHigh = ph;
          anchorHighBar = shBar;
        }
        if (
          anchorLow != null &&
          anchorLowBar != null &&
          shBar > anchorLowBar &&
          ph > anchorLow &&
          rangeMeetsMinPct(ph, anchorLow, minRangePct)
        ) {
          pending = {
            side: 1,
            firstPrice: anchorLow,
            firstBar: anchorLowBar,
            secondPrice: ph,
            secondBar: shBar,
          };
          anchorLow = null;
          anchorLowBar = null;
          anchorHigh = null;
          anchorHighBar = null;
        }
      }
    }
    if (pl != null) {
      const slBar = i - right;
      const open = pending;
      if (open && open.side === -1 && slBar > open.firstBar && pl < open.secondPrice) {
        pending = { ...open, secondPrice: pl, secondBar: slBar };
      } else if (!open) {
        if (anchorLow == null || pl <= anchorLow) {
          anchorLow = pl;
          anchorLowBar = slBar;
        }
        if (
          anchorHigh != null &&
          anchorHighBar != null &&
          slBar > anchorHighBar &&
          pl < anchorHigh &&
          rangeMeetsMinPct(anchorHigh, pl, minRangePct)
        ) {
          pending = {
            side: -1,
            firstPrice: anchorHigh,
            firstBar: anchorHighBar,
            secondPrice: pl,
            secondBar: slBar,
          };
          anchorHigh = null;
          anchorHighBar = null;
          anchorLow = null;
          anchorLowBar = null;
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

/** Explicit OHLC — highs/lows chosen so left/right=2 pivots confirm uniquely. */
function bar(t, o, h, l, c) {
  return { time: t, open: o, high: h, low: l, close: c };
}

/**
 * Bearish: climb to HH=120, fall to LL=100, bounce, then close below LL.
 */
function synthBearish() {
  const t0 = 1_700_000_000;
  const rows = [
    // climb
    [100, 102, 99.5, 101.5],
    [101.5, 104, 101, 103.5],
    [103.5, 106, 103, 105.5],
    [105.5, 108, 105, 107.5],
    [107.5, 110, 107, 109.5],
    [109.5, 113, 109, 112],
    [112, 116, 111.5, 115],
    [115, 118, 114.5, 117],
    // HH pivot neighborhood (unique high 120)
    [117, 118.5, 116.5, 118],
    [118, 119, 117.5, 118.5],
    [118.5, 120, 118, 119.5], // HH
    [119.5, 119.8, 117, 117.5],
    [117.5, 118, 115, 115.5],
    // drop toward LL
    [115.5, 116, 112, 112.5],
    [112.5, 113, 109, 109.5],
    [109.5, 110, 106, 106.5],
    [106.5, 107, 103, 103.5],
    // LL pivot neighborhood (unique low 100)
    [103.5, 104, 102, 102.5],
    [102.5, 103, 101, 101.5],
    [101.5, 102, 100, 100.5], // LL
    [100.5, 101.5, 100.2, 101],
    [101, 102, 100.8, 101.5],
    // bounce then BOS below 100
    [101.5, 103, 101, 102.5],
    [102.5, 103.5, 101.5, 102],
    [102, 102.5, 99.5, 99.2], // BOS close < 100
    [99.2, 99.5, 98.5, 98.8],
    [98.8, 99, 97.5, 97.8],
  ];
  return rows.map((r, i) => bar(t0 + i * 60, r[0], r[1], r[2], r[3]));
}

/** Bullish mirror: LL=100 → HH=120 → BOS close above 120. */
function synthBullish() {
  const t0 = 1_700_000_000;
  const rows = [
    [120, 120.5, 118, 118.5],
    [118.5, 119, 116, 116.5],
    [116.5, 117, 114, 114.5],
    [114.5, 115, 112, 112.5],
    [112.5, 113, 110, 110.5],
    [110.5, 111, 108, 108.5],
    [108.5, 109, 106, 106.5],
    [106.5, 107, 104, 104.5],
    [104.5, 105, 102, 102.5],
    [102.5, 103, 101, 101.5],
    [101.5, 102, 100, 100.5], // LL
    [100.5, 101.5, 100.2, 101],
    [101, 103, 100.8, 102.5],
    [102.5, 106, 102, 105.5],
    [105.5, 109, 105, 108.5],
    [108.5, 113, 108, 112.5],
    [112.5, 116, 112, 115.5],
    [115.5, 118, 115, 117.5],
    [117.5, 119, 117, 118.5],
    [118.5, 120, 118, 119.5], // HH
    [119.5, 119.8, 118.5, 119],
    [119, 119.5, 117.5, 118],
    [118, 119, 117.8, 118.5],
    [118.5, 119.2, 118, 118.8],
    [118.8, 121, 118.5, 120.5], // BOS close > 120
    [120.5, 121.5, 120, 121],
    [121, 122, 120.5, 121.5],
  ];
  return rows.map((r, i) => bar(t0 + i * 60, r[0], r[1], r[2], r[3]));
}

const opts = { pivotLeft: 2, pivotRight: 2, minRangePct: 0.2, breakOnWick: false };
const bearBars = synthBearish();
const bullBars = synthBullish();
const bear = computeIct(bearBars, opts);
const bull = computeIct(bullBars, opts);

// Also count pivots for diagnostics
function countPivots(bars) {
  let h = 0;
  let l = 0;
  for (let i = 0; i < bars.length; i++) {
    if (pivotHigh(bars, i, 2, 2) != null) h += 1;
    if (pivotLow(bars, i, 2, 2) != null) l += 1;
  }
  return { h, l };
}

const bearOk =
  bear.length >= 1 &&
  bear.some((r) => !r.bullish && r.top > r.bot && r.top >= 115 && r.bot <= 105);
const bullOk =
  bull.length >= 1 &&
  bull.some((r) => r.bullish && r.top > r.bot && r.bot <= 105 && r.top >= 115);

console.log(
  JSON.stringify(
    {
      bearPivots: countPivots(bearBars),
      bullPivots: countPivots(bullBars),
      bearCount: bear.length,
      bearSample: bear[0] ?? null,
      bullCount: bull.length,
      bullSample: bull[0] ?? null,
      bearOk,
      bullOk,
      pass: bearOk && bullOk,
    },
    null,
    2,
  ),
);

if (!(bearOk && bullOk)) process.exit(1);
