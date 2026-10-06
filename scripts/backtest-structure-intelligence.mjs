/**
 * Backtest Forge Structure Intelligence confirmed entries on XAUUSD history.
 * Usage: node scripts/backtest-structure-intelligence.mjs
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bundle = spawnSync(
  "npx",
  [
    "--yes",
    "esbuild",
    "src/features/structure-intelligence/runtime.ts",
    "--bundle",
    "--format=esm",
    "--outfile=/tmp/si-runtime.mjs",
    "--platform=neutral",
    "--alias:@=./src",
    "--external:@/infrastructure/tradingview",
  ],
  { cwd: root, stdio: "inherit" },
);
if (bundle.status !== 0) process.exit(bundle.status ?? 1);

const {
  computeStructureIntelligence,
  siFamilyName,
  siWhy,
} = await import("/tmp/si-runtime.mjs");

function loadPacked(path) {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  return raw
    .map((r) => ({
      time: Math.floor(Number(r[0])),
      open: Number(r[1]),
      high: Number(r[2]),
      low: Number(r[3]),
      close: Number(r[4]),
    }))
    .filter((b) => Number.isFinite(b.time) && b.high > 0);
}

function aggregate(bars, sec) {
  if (!bars.length) return [];
  const out = [];
  let bucket = null;
  for (const b of bars) {
    const t0 = Math.floor(b.time / sec) * sec;
    if (!bucket || bucket.time !== t0) {
      if (bucket) out.push(bucket);
      bucket = { time: t0, open: b.open, high: b.high, low: b.low, close: b.close };
    } else {
      bucket.high = Math.max(bucket.high, b.high);
      bucket.low = Math.min(bucket.low, b.low);
      bucket.close = b.close;
    }
  }
  if (bucket) out.push(bucket);
  return out;
}

function iso(sec) {
  return new Date(sec * 1000).toISOString().replace(".000Z", "Z");
}

function resolveTrade(bars, ev) {
  const risk = Math.abs(ev.entry - ev.stop);
  const r1 = ev.entry + ev.dir * risk;
  const r2 = ev.entry + ev.dir * risk * 2;
  const r3 = ev.entry + ev.dir * risk * 3;
  let hit1 = null;
  let hit2 = null;
  let hit3 = null;
  let hitStop = null;
  let first = "open";
  let mfe = 0;
  for (let i = ev.bar + 1; i < bars.length; i += 1) {
    const b = bars[i];
    const fav = ev.dir === 1 ? b.high - ev.entry : ev.entry - b.low;
    mfe = Math.max(mfe, fav);
    const stopHit = ev.dir === 1 ? b.low <= ev.stop : b.high >= ev.stop;
    const t1 = ev.dir === 1 ? b.high >= r1 : b.low <= r1;
    const t2 = ev.dir === 1 ? b.high >= r2 : b.low <= r2;
    const t3 = ev.dir === 1 ? b.high >= r3 : b.low <= r3;
    if (hit1 == null && t1) hit1 = i;
    if (hit2 == null && t2) hit2 = i;
    if (hit3 == null && t3) hit3 = i;
    if (hitStop == null && stopHit) hitStop = i;
    if (stopHit && t3) {
      first = "ambiguous";
      break;
    }
    if (stopHit && hit3 == null) {
      first = "stop";
      break;
    }
    if (t3 && hitStop == null) {
      first = "target3";
      break;
    }
    if (i - ev.bar > 250 && first === "open") {
      first = "expired";
      break;
    }
  }
  const before = (h) => h != null && (hitStop == null || h < hitStop);
  return {
    first,
    hit1,
    hit2,
    hit3,
    hitStop,
    risk,
    mfeR: risk > 0 ? mfe / risk : 0,
    win1: before(hit1),
    win2: before(hit2),
    win3: before(hit3),
  };
}

function summarize(label, bars, opts) {
  const result = computeStructureIntelligence(bars, opts);
  const trades = result.history.map((ev) => {
    const res = resolveTrade(bars, ev);
    const chase = ev.dir === 1 ? ev.entry - ev.zhi : ev.zlo - ev.entry;
    return {
      ...ev,
      ...res,
      chase,
      familyName: siFamilyName(ev.family),
      why: siWhy(ev.flags),
    };
  });
  const n = trades.length;
  const count = (k) => trades.filter((t) => t.first === k).length;
  const fam = {};
  for (const t of trades) {
    fam[t.familyName] ??= { n: 0, t3: 0, r1: 0, stop: 0 };
    fam[t.familyName].n += 1;
    if (t.win3) fam[t.familyName].t3 += 1;
    if (t.win1) fam[t.familyName].r1 += 1;
    if (t.first === "stop") fam[t.familyName].stop += 1;
  }
  const pct = (x) => (n ? ((100 * x) / n).toFixed(1) : "0");
  return {
    label,
    bars: bars.length,
    confirms: n,
    target3: count("target3"),
    stop: count("stop"),
    ambiguous: count("ambiguous"),
    expired: count("expired") + count("open"),
    r1BeforeStop: trades.filter((t) => t.win1).length,
    r2BeforeStop: trades.filter((t) => t.win2).length,
    r3BeforeStop: trades.filter((t) => t.win3).length,
    win3: pct(trades.filter((t) => t.win3).length),
    win1: pct(trades.filter((t) => t.win1).length),
    win2: pct(trades.filter((t) => t.win2).length),
    stopPct: pct(count("stop")),
    avgMfeR: n ? (trades.reduce((a, t) => a + t.mfeR, 0) / n).toFixed(2) : "0",
    families: fam,
    trades: trades.map((t) => ({
      t: iso(t.time),
      dir: t.dir === 1 ? "BUY" : "SELL",
      fam: t.familyName,
      first: t.first,
      win1: t.win1,
      win3: t.win3,
      entry: t.entry.toFixed(2),
      stop: t.stop.toFixed(2),
      why: t.why,
    })),
  };
}

const m1 = loadPacked("/tmp/xauusd-1m.json");
const m5 = aggregate(m1, 300);
const m15file = loadPacked("/tmp/xauusd-15.json");
const m15 = m15file.length > 200 ? m15file : aggregate(m1, 900);

const variants = [
  { name: "defaults (current)", opts: { historyLimit: 5000 } },
  { name: "FVG only", opts: { historyLimit: 5000, zoneMode: "FVG only" } },
  { name: "minScore 75", opts: { historyLimit: 5000, minScore: 75 } },
  { name: "require sweep", opts: { historyLimit: 5000, requireSweep: true } },
];

const report = {
  generatedAt: new Date().toISOString(),
  span1m: [iso(m1[0].time), iso(m1.at(-1).time)],
  n1m: m1.length,
  n5: m5.length,
  n15: m15.length,
  sets: [],
};

for (const tf of [
  { name: "XAUUSD 15m", bars: m15 },
  { name: "XAUUSD 5m", bars: m5 },
  { name: "XAUUSD 1m", bars: m1.slice(-15000) },
]) {
  for (const v of variants) {
    const s = summarize(`${tf.name} · ${v.name}`, tf.bars, v.opts);
    report.sets.push(s);
    console.log(
      `${s.label.padEnd(52)} n=${String(s.confirms).padStart(4)}  3R=${s.win3}%  2R=${s.win2}%  1R=${s.win1}%  SL=${s.stopPct}%  mfe=${s.avgMfeR}R`,
    );
    if (v.name === "defaults (current)") {
      console.log("  families", JSON.stringify(s.families));
    }
  }
  console.log("---");
}

writeFileSync("/tmp/si-backtest.json", JSON.stringify(report, null, 2));
writeFileSync("/opt/cursor/artifacts/si-backtest.json", JSON.stringify(report, null, 2));
console.log("wrote /tmp/si-backtest.json");
