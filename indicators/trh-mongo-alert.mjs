#!/usr/bin/env node
/**
 * TRH classic SWEEP alerts from VPS MongoDB (FOREXCOM:XAUUSD via TradingView fetcher).
 * Runs 24/7 — does not need your PC.
 *
 * Env:
 *   MONGO_URI=mongodb://127.0.0.1:27017
 *   MONGO_DB=historical_data
 *   MONGO_COLL=xauusd_1m
 *   NTFY_TOPIC=...
 *   TRH_POLL_SEC=30
 *   TRH_MAX_AGE_BARS=5
 *   TRH_MIN_RISK=2.0
 *   TRH_LOOKBACK=1500
 */
import { MongoClient } from "mongodb";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { createCipheriv, randomBytes } from "crypto";
import { scanTrhSetups } from "./trh-engine.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = join(__dir, ".trh-mongo-alert-state.json");
const SECRETS_FILE = join(__dir, ".trh-secrets.json");

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017";
const MONGO_DB = process.env.MONGO_DB || "historical_data";
const MONGO_COLL = process.env.MONGO_COLL || "xauusd_1m";
const POLL_SEC = Number(process.env.TRH_POLL_SEC || 30);
const NTFY_TOPIC = process.env.NTFY_TOPIC || "trh-forge-radiarkazemi-bc13";
const NTFY_SERVER = process.env.NTFY_SERVER || "https://ntfy.sh";
const MAX_AGE = Number(process.env.TRH_MAX_AGE_BARS || 5);
const MIN_RISK = Number(process.env.TRH_MIN_RISK || 2.0);
const LOOKBACK = Number(process.env.TRH_LOOKBACK || 1500);
const SYMBOL_LABEL = process.env.TRH_SYMBOL || "XAUUSD FOREXCOM";
const RUN_ONCE = process.argv.includes("--once");

function loadSecrets() {
  if (!existsSync(SECRETS_FILE)) return null;
  try {
    return JSON.parse(readFileSync(SECRETS_FILE, "utf8"));
  } catch {
    return null;
  }
}
const SECRETS = loadSecrets();

function encryptPayload(obj) {
  if (!SECRETS?.secretKey) return null;
  const key = Buffer.from(SECRETS.secretKey, "hex");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plain = Buffer.from(JSON.stringify(obj), "utf8");
  const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    type: "alert",
    iv: iv.toString("base64"),
    data: enc.toString("base64"),
    tag: tag.toString("base64"),
  };
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
  return Number(n).toFixed(2);
}

async function fetchBars(client) {
  const col = client.db(MONGO_DB).collection(MONGO_COLL);
  const docs = await col
    .find({})
    .sort({ _id: -1 })
    .limit(LOOKBACK)
    .toArray();
  docs.reverse(); // oldest → newest
  const bars = [];
  for (const doc of docs) {
    const d = doc.data;
    if (!d || d.open == null) continue;
    const t =
      d.time instanceof Date
        ? Math.floor(d.time.getTime() / 1000)
        : Math.floor(new Date(d.time).getTime() / 1000);
    bars.push({
      time: t,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    });
  }
  return bars;
}

async function notifyNtfy(title, message, payloadObj) {
  if (!NTFY_TOPIC) return false;
  let ok = false;
  const envelope = encryptPayload({
    title,
    message,
    ...(payloadObj || {}),
  });
  if (envelope) {
    const resEnc = await fetch(`${NTFY_SERVER}/${NTFY_TOPIC}`, {
      method: "POST",
      headers: {
        Title: title,
        Priority: "urgent",
        Tags: "chart_with_upwards_trend,moneybag",
        "X-TRH-Encrypted": "aes-256-gcm",
      },
      body: JSON.stringify(envelope),
    });
    ok = resEnc.ok || ok;
  }
  const res = await fetch(`${NTFY_SERVER}/${NTFY_TOPIC}`, {
    method: "POST",
    headers: {
      Title: title,
      Priority: "urgent",
      Tags: "chart_with_upwards_trend,moneybag",
    },
    body: message,
  });
  return res.ok || ok;
}

async function tick(client) {
  const bars = await fetchBars(client);
  if (bars.length < 120) {
    console.log(`[trh-mongo] only ${bars.length} bars — wait`);
    return;
  }
  const last = bars[bars.length - 1];
  const setups = scanTrhSetups(bars);
  const state = loadState();

  if (setups.length === 0) {
    console.log(
      `[trh-mongo] ${new Date().toISOString()} scanning… last=${fmt(last.close)} @ ${new Date(last.time * 1000).toISOString()}`,
    );
    return;
  }

  let chosen = null;
  for (let i = setups.length - 1; i >= 0; i--) {
    const s = setups[i];
    const age = bars.length - 1 - s.barIndex;
    const risk = Math.abs(s.entry - s.sl);
    if (state.lastAlertTime && s.barTime <= state.lastAlertTime) break;
    if (age > MAX_AGE) continue;
    if (risk < MIN_RISK) continue;
    chosen = { ...s, age, risk };
    break;
  }

  if (!chosen) {
    if (!state.lastAlertTime) {
      state.lastAlertTime = setups[setups.length - 1].barTime;
      saveState(state);
      console.log(`[trh-mongo] seeded state @ ${state.lastAlertTime}`);
    } else {
      const latest = setups[setups.length - 1];
      console.log(
        `[trh-mongo] ${new Date().toISOString()} last setup age=${bars.length - 1 - latest.barIndex} ENTRY ${fmt(latest.entry)} — waiting for new`,
      );
    }
    return;
  }

  const side = chosen.dir === 1 ? "LONG" : "SHORT";
  const msg =
    `${SYMBOL_LABEL} 1m | TRH ${side} SETUP\n` +
    `ENTRY ${fmt(chosen.entry)}\n` +
    `SL ${fmt(chosen.sl)}\n` +
    `TP ${fmt(chosen.tp)}\n` +
    `Risk ${fmt(chosen.risk)} · ${new Date(chosen.barTime * 1000).toISOString()}`;
  const title = `TRH ${side} SETUP`;

  console.log(`[trh-mongo] NEW (age ${chosen.age}m)\n${msg}`);
  const sent = await notifyNtfy(title, msg, {
    side,
    symbol: SYMBOL_LABEL,
    entry: chosen.entry,
    sl: chosen.sl,
    tp: chosen.tp,
    barTime: chosen.barTime,
    source: "mongo-forexcom",
  });
  console.log(`[trh-mongo] ntfy → ${sent ? "ok" : "fail"}`);

  state.lastAlertTime = chosen.barTime;
  state.latest = {
    side,
    entry: chosen.entry,
    sl: chosen.sl,
    tp: chosen.tp,
    barTime: chosen.barTime,
    at: Date.now(),
  };
  saveState(state);
}

async function main() {
  console.log(
    `[trh-mongo] FOREXCOM XAUUSD alert — ${RUN_ONCE ? "once" : `poll ${POLL_SEC}s`} mongo=${MONGO_URI}/${MONGO_DB}.${MONGO_COLL}`,
  );
  const client = new MongoClient(MONGO_URI, { maxPoolSize: 4 });
  await client.connect();
  try {
    await tick(client);
    if (!RUN_ONCE) {
      setInterval(() => {
        tick(client).catch((e) => console.error("[trh-mongo] tick error", e));
      }, POLL_SEC * 1000);
    } else {
      await client.close();
    }
  } catch (e) {
    await client.close();
    throw e;
  }
}

main().catch((e) => {
  console.error("[trh-mongo] fatal", e);
  process.exit(1);
});
