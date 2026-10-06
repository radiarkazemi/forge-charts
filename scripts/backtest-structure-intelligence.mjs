/**
 * Focused SI backtest on the working timeframes: XAUUSD 5m and 1m.
 * Usage: node scripts/backtest-structure-intelligence.mjs
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
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

const { computeStructureIntelligence, siFamilyName, siWhy } = await import("/tmp/si-runtime.mjs");

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
    risk,
    mfeR: risk > 0 ? mfe / risk : 0,
    win1: before(hit1),
    win2: before(hit2),
    win3: before(hit3),
    barsTo1: hit1 != null ? hit1 - ev.bar : null,
    barsToStop: hitStop != null ? hitStop - ev.bar : null,
  };
}

function summarize(label, bars, opts) {
  const result = computeStructureIntelligence(bars, opts);
  const trades = result.history.map((ev) => {
    const res = resolveTrade(bars, ev);
    return {
      t: iso(ev.time),
      dir: ev.dir === 1 ? "BUY" : "SELL",
      fam: siFamilyName(ev.family),
      why: siWhy(ev.flags),
      first: res.first,
      win1: res.win1,
      win2: res.win2,
      win3: res.win3,
      entry: +ev.entry.toFixed(2),
      stop: +ev.stop.toFixed(2),
      risk: +res.risk.toFixed(2),
      mfeR: +res.mfeR.toFixed(2),
      barsTo1: res.barsTo1,
      barsToStop: res.barsToStop,
    };
  });
  const n = trades.length;
  const pct = (x) => (n ? ((100 * x) / n).toFixed(1) : "0");
  const fam = {};
  for (const t of trades) {
    fam[t.fam] ??= { n: 0, r1: 0, r2: 0, r3: 0, sl: 0 };
    fam[t.fam].n += 1;
    if (t.win1) fam[t.fam].r1 += 1;
    if (t.win2) fam[t.fam].r2 += 1;
    if (t.win3) fam[t.fam].r3 += 1;
    if (t.first === "stop") fam[t.fam].sl += 1;
  }
  return {
    label,
    bars: bars.length,
    from: bars.length ? iso(bars[0].time) : null,
    to: bars.length ? iso(bars.at(-1).time) : null,
    confirms: n,
    win1: pct(trades.filter((t) => t.win1).length),
    win2: pct(trades.filter((t) => t.win2).length),
    win3: pct(trades.filter((t) => t.win3).length),
    stopPct: pct(trades.filter((t) => t.first === "stop").length),
    expired: trades.filter((t) => t.first === "expired" || t.first === "open").length,
    avgMfeR: n ? (trades.reduce((a, t) => a + t.mfeR, 0) / n).toFixed(2) : "0",
    families: fam,
    trades,
  };
}

const m1 = loadPacked("/tmp/xauusd-1m.json");
const m5file = existsSync("/tmp/xauusd-5m.json") ? loadPacked("/tmp/xauusd-5m.json") : [];
const m5 = m5file.length > 200 ? m5file : aggregate(m1, 300);

const variants = [
  { name: "defaults", opts: { historyLimit: 5000 } },
  { name: "minScore 75", opts: { historyLimit: 5000, minScore: 75 } },
  { name: "require sweep", opts: { historyLimit: 5000, requireSweep: true } },
  { name: "require outer", opts: { historyLimit: 5000, requireOuter: true } },
];

const report = {
  generatedAt: new Date().toISOString(),
  focus: ["5m", "1m"],
  n1m: m1.length,
  n5: m5.length,
  span1m: [iso(m1[0].time), iso(m1.at(-1).time)],
  sets: [],
};

function printSet(s, listTrades) {
  console.log(
    `\n${s.label}\n  bars=${s.bars}  ${s.from} → ${s.to}\n  n=${s.confirms}  1R=${s.win1}%  2R=${s.win2}%  3R=${s.win3}%  SL=${s.stopPct}%  exp=${s.expired}  mfe=${s.avgMfeR}R`,
  );
  console.log("  families", JSON.stringify(s.families));
  if (listTrades) {
    for (const t of s.trades) {
      const mark = t.win3 ? "3R" : t.win1 ? "1R" : t.first === "stop" ? "SL" : t.first;
      console.log(
        `    ${t.t} ${t.dir.padEnd(4)} ${t.fam.padEnd(18)} ${mark.padEnd(6)} entry=${t.entry} sl=${t.stop} mfe=${t.mfeR}  ${t.why}`,
      );
    }
  }
}

for (const tf of [
  { name: "XAUUSD 5m", bars: m5 },
  { name: "XAUUSD 1m", bars: m1 },
]) {
  for (const v of variants) {
    const s = summarize(`${tf.name} · ${v.name}`, tf.bars, v.opts);
    report.sets.push(s);
    printSet(s, v.name === "defaults");
  }
}

writeFileSync("/tmp/si-backtest-5m-1m.json", JSON.stringify(report, null, 2));
writeFileSync("/opt/cursor/artifacts/si-backtest-5m-1m.json", JSON.stringify(report, null, 2));
console.log("\nwrote /tmp/si-backtest-5m-1m.json");
