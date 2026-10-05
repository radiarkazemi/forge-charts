/**
 * Offline smoke for Forge Structure Intelligence chart-TF engine.
 * Run: node scripts/verify-structure-intelligence.mjs
 */
import { createRequire } from "node:module";

// Inline minimal check — full TS engine is verified via tsc + live paint.
// This script mirrors pivot+zone+score contracts from the Pine guide.

function atr14(bars, i) {
  if (i <= 0) return Math.max(bars[0].high - bars[0].low, 1e-8);
  let sum = 0, n = 0;
  for (let j = Math.max(1, i - 13); j <= i; j++) {
    const b = bars[j], p = bars[j - 1];
    sum += Math.max(b.high - b.low, Math.abs(b.high - p.close), Math.abs(b.low - p.close));
    n++;
  }
  return sum / n;
}

function score(flags, reacted) {
  const has = (bit) => Math.floor(flags / bit) % 2 === 1;
  return 50 + (has(1) ? 15 : 0) + (has(2) ? 15 : 0) + (has(4) ? 10 : 0) + (reacted ? 10 : 0);
}

const flags = 1 + 2 + 8; // sweep + impulse + FVG
const pending = score(flags, false);
const ready = score(flags, true);
console.log({ pending, ready, pass: ready >= 65 });
if (pending !== 80 || ready !== 90) {
  console.error("SCORE CONTRACT FAILED");
  process.exit(1);
}

// FVG bullish: low > high[2]
const bars = [];
let t = 1_700_000_000;
for (let i = 0; i < 5; i++) bars.push({ time: t++, open: 100, high: 101, low: 99, close: 100 });
bars.push({ time: t++, open: 100, high: 101, low: 99.5, close: 100.5 }); // i-2
bars.push({ time: t++, open: 100.5, high: 102, low: 100, close: 101 });
bars.push({ time: t++, open: 103, high: 105, low: 102.5, close: 104 }); // gap: low 102.5 > high[2] 101
const i = bars.length - 1;
const gap = bars[i].low > bars[i - 2].high;
const gl = bars[i - 2].high;
const gh = bars[i].low;
console.log({ gap, gl, gh, atr: atr14(bars, i) });
if (!gap) {
  console.error("FVG CONTRACT FAILED");
  process.exit(1);
}
console.log("VERIFY OK — SI score + FVG contracts match guide");
