#!/usr/bin/env node
/**
 * LIVE SL clamp — mirrors TRH AutoTrade v3.54 market-fill logic.
 * Reproduces the user's SHORT screenshot numbers and proves LIVE SL
 * never sits inside the structural distal.
 *
 * Run: node mt5/TRH_Trading_Room_Hunter/live-sl-clamp-test.mjs
 */

function assert(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("OK  ", msg);
}

/** Old buggy same-risk rebuild (pre-v3.54) */
function oldLiveSl(dir, setupEntry, setupSl, fill) {
  const risk = Math.abs(setupEntry - setupSl);
  return dir === 1 ? fill - risk : fill + risk;
}

/** v3.54: keep structural SL; broker pad may only widen */
function liveSlV354(dir, structuralSl, ask, bid, minDist = 0.1) {
  if (dir === 1) {
    const brokerFloor = bid - minDist;
    return Math.min(structuralSl, brokerFloor);
  }
  const brokerCeil = ask + minDist;
  return Math.max(structuralSl, brokerCeil);
}

// --- User SHORT screenshot ---
const setupEntry = 4405.05;
const setupSl = 4407.59; // Real / distal
const liveEntry = 4403.47; // better short fill
const ask = 4403.50;
const bid = 4403.40;

const buggy = oldLiveSl(-1, setupEntry, setupSl, liveEntry);
assert(buggy < setupSl, `old logic puts LIVE SL ${buggy.toFixed(2)} UNDER Real SL ${setupSl}`);
assert(Math.abs(buggy - 4405.93) < 0.15, `old LIVE SL ≈ 4405.93 (got ${buggy.toFixed(2)})`);

const fixed = liveSlV354(-1, setupSl, ask, bid, 0.1);
assert(fixed >= setupSl, `v3.54 LIVE SL ${fixed} >= Real SL ${setupSl}`);
assert(fixed === setupSl, `v3.54 keeps distal exactly when broker allows (got ${fixed})`);

const liveRisk = Math.abs(liveEntry - fixed);
const rr = 2.4;
const liveTp = liveEntry - liveRisk * rr;
assert(liveTp < liveEntry, `SHORT LIVE TP ${liveTp.toFixed(2)} below entry`);
assert(liveRisk > Math.abs(setupEntry - setupSl), "better fill → larger risk to distal (correct)");

// --- LONG: better fill must not raise SL above distal ---
const longSetupE = 100;
const longSetupSl = 98;
const longFill = 101; // better long fill
const longBuggy = oldLiveSl(1, longSetupE, longSetupSl, longFill);
assert(longBuggy > longSetupSl, `old LONG LIVE SL ${longBuggy} ABOVE Real SL ${longSetupSl} (tighter)`);
const longFixed = liveSlV354(1, longSetupSl, 101.1, 101.0, 0.1);
assert(longFixed <= longSetupSl, `v3.54 LONG LIVE SL ${longFixed} <= Real SL ${longSetupSl}`);

// --- Broker widen only (short SL too close to ask) ---
const tightStructural = 4403.55; // almost at ask
const widened = liveSlV354(-1, tightStructural, 4403.5, 4403.4, 0.5);
assert(widened === 4404.0, `broker pad widens short SL to ask+minDist (got ${widened})`);
assert(widened > tightStructural, "widen moves SL farther from price, not inside");

console.log("\nScreenshot SHORT:");
console.log({
  setupEntry,
  realSl: setupSl,
  liveEntry,
  oldLiveSl: +buggy.toFixed(2),
  v354LiveSl: fixed,
  liveTp: +liveTp.toFixed(2),
  liveRisk: +liveRisk.toFixed(2),
});
console.log("\nAll LIVE SL clamp tests passed.");
