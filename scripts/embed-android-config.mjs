#!/usr/bin/env node
/** Embed secrets + tunnel URL into Android Config.kt */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const secretsPath = join(root, "indicators/.trh-secrets.json");
const tunnelPath = join(root, "indicators/.trh-tunnel-url");
const outPath = join(root, "android-trh-alert/app/src/main/java/com/forge/trhalert/Config.kt");

if (!existsSync(secretsPath)) {
  console.error("Missing", secretsPath, "— run: node scripts/generate-trh-secrets.mjs");
  process.exit(1);
}

const secrets = JSON.parse(readFileSync(secretsPath, "utf8"));
const serverUrl = existsSync(tunnelPath)
  ? readFileSync(tunnelPath, "utf8").trim()
  : process.env.TRH_SERVER_URL || "wss://YOUR-TUNNEL.trycloudflare.com/ws";

function toWsUrl(url) {
  let u = url.trim();
  if (!u.endsWith("/ws")) u = u.replace(/\/$/, "") + "/ws";
  if (u.startsWith("https://")) u = "wss://" + u.slice(8);
  else if (u.startsWith("http://")) u = "ws://" + u.slice(7);
  else if (!u.startsWith("ws")) u = "wss://" + u;
  return u;
}

const kt = `package com.forge.trhalert

/** Auto-generated — do not edit. Run: node scripts/embed-android-config.mjs */
object Config {
    const val WS_URL = "${toWsUrl(serverUrl)}"
    const val APP_TOKEN = "${secrets.appToken}"
    const val SECRET_KEY_HEX = "${secrets.secretKey}"
}
`;

writeFileSync(outPath, kt);
console.log("Wrote", outPath);
console.log("WS_URL =", toWsUrl(serverUrl));
