#!/usr/bin/env node
/** Embed secrets + ntfy WS URL into Android Config.kt */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const secretsPath = join(root, "indicators/.trh-secrets.json");
const outPath = join(root, "android-trh-alert/app/src/main/java/com/forge/trhalert/Config.kt");

if (!existsSync(secretsPath)) {
  console.error("Missing", secretsPath, "— run: node scripts/generate-trh-secrets.mjs");
  process.exit(1);
}

const secrets = JSON.parse(readFileSync(secretsPath, "utf8"));
const topic = process.env.NTFY_TOPIC || "trh-forge-radiarkazemi-bc13";
const ntfyServer = (process.env.NTFY_SERVER || "https://ntfy.sh").replace(/\/$/, "");
const wsUrl = ntfyServer.replace(/^http/, "ws") + `/${topic}/ws`;

const kt = `package com.forge.trhalert

/** Auto-generated — do not edit. Run: node scripts/embed-android-config.mjs */
object Config {
    // Stable public channel (no VPS tunnel required). Topic name is the secret.
    const val WS_URL = "${wsUrl}"
    const val APP_TOKEN = "${secrets.appToken}"
    const val SECRET_KEY_HEX = "${secrets.secretKey}"
}
`;

writeFileSync(outPath, kt);
console.log("Wrote", outPath);
console.log("WS_URL =", wsUrl);
