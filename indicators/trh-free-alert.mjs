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

import { readFileSync, writeFileSync, existsSync, appendFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createCipheriv, randomBytes } from "crypto";
import { scanTrhSetups } from "./trh-engine.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = join(__dir, ".trh-alert-state.json");
const SECRETS_FILE = join(__dir, ".trh-secrets.json");

const POLL_SEC = Number(process.env.TRH_POLL_SEC || 60);
const NTFY_TOPIC = process.env.NTFY_TOPIC || "trh-forge-radiarkazemi-bc13";
const NTFY_SERVER = process.env.NTFY_SERVER || "https://ntfy.sh";
const ALERT_EMAIL = process.env.TRH_ALERT_EMAIL || "radiarkazemi@gmail.com";
const TELEGRAM_BOT = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT = process.env.TELEGRAM_CHAT_ID || "";
const PRICE_OFFSET = Number(process.env.TRH_PRICE_OFFSET || 56);
const SYMBOL_LABEL = process.env.TRH_SYMBOL || "XAUUSD";
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

// TRH engine: indicators/trh-engine.mjs

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

  // Live poll: only brand-new setups (≤3 bars).
  // GitHub Actions --once: allow a short window (≤8 bars) because cron can lag,
  // but NOT 45 bars — that alerted stale Yahoo setups that were not on the chart.
  const maxAgeBars = RUN_ONCE ? Number(process.env.TRH_MAX_AGE_BARS || 8) : 3;
  const minRisk = Number(process.env.TRH_MIN_RISK || 2.5);
  const barsSinceSetup = bars.length - 1 - latest.barIndex;
  if (barsSinceSetup > maxAgeBars) {
    console.log(
      `[trh] latest setup is ${barsSinceSetup} bars old (max ${maxAgeBars}) — skip`,
    );
    return;
  }
  if (state.lastAlertTime === latest.barTime) {
    console.log("[trh] already alerted this setup");
    return;
  }

  const risk = Math.abs(latest.entry - latest.sl);
  if (risk < minRisk) {
    console.log(`[trh] risk ${risk.toFixed(2)} < min ${minRisk} — skip noisy room`);
    return;
  }
  // Skip chase: mid-room already gone (same as Pine LATE)
  const maxLateR = Number(process.env.TRH_MAX_LATE_R || 0.35);
  const lastBar = bars[bars.length - 1];
  const chaseR =
    risk > 0
      ? latest.dir === 1
        ? (lastBar.close - latest.entry) / risk
        : (latest.entry - lastBar.close) / risk
      : 0;
  const isLate = latest.late === true || chaseR > maxLateR;
  if (isLate) {
    console.log(
      `[trh] LATE chaseR=${chaseR.toFixed(2)} > ${maxLateR} (close ${fmt(lastBar.close)} vs ENTRY ${fmt(latest.entry)}) — skip phone alert`,
    );
    state.lastAlertTime = latest.barTime;
    saveState(state);
    return;
  }
  const modes = (process.env.TRH_ALERT_MODES || "sweep").split(",").map((x) => x.trim());
  const mode = latest.mode || "sweep";
  if (!modes.includes(mode)) {
    console.log(`[trh] mode ${mode} not in alert modes [${modes}] — skip`);
    return;
  }

  const msg = setupMessage(latest);
  const title = `TRH ${latest.dir === 1 ? "LONG" : "SHORT"} Hunt`;

  console.log("[trh] NEW SETUP\n" + msg);

  let sent = false;
  if (NTFY_TOPIC) {
    sent =
      (await notifyNtfy(title, msg, {
        side: latest.dir === 1 ? "LONG" : "SHORT",
        symbol: SYMBOL_LABEL,
        entry: latest.entry,
        sl: latest.sl,
        tp: latest.tp,
        barTime: latest.barTime,
      })) || sent;
    console.log("[trh] ntfy →", sent ? "ok" : "fail");
  }
  if (TELEGRAM_BOT) {
    sent = (await notifyTelegram(msg)) || sent;
    console.log("[trh] telegram →", sent ? "ok" : "fail");
  }

  state.lastAlertTime = latest.barTime;
  saveState(state);

  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `alert=true\nalert_body=${encodeURIComponent(msg)}\n`);
  }

  if (!sent && !process.env.GITHUB_OUTPUT) {
    console.log("[trh] alert recorded locally");
  }
}

async function main() {
  console.log(`[trh] alert monitor — ${RUN_ONCE ? "once" : `poll ${POLL_SEC}s`} → ${ALERT_EMAIL}`);
  await tick();
  if (!RUN_ONCE) setInterval(tick, POLL_SEC * 1000);
}

main().catch((e) => {
  console.error("[trh] fatal", e);
  process.exit(1);
});
