#!/usr/bin/env node
/** Generate TRH shared secrets for VPS + Android app */
import { createHmac, randomBytes } from "crypto";
import { writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const dir = dirname(fileURLToPath(import.meta.url));
const out = join(dir, "../indicators/.trh-secrets.json");

if (existsSync(out) && !process.argv.includes("--force")) {
  console.log("Secrets exist:", out);
  process.exit(0);
}

const secretKey = randomBytes(32).toString("hex");
const appToken = createHmac("sha256", secretKey).update("trh-app-v1").digest("hex");
const secrets = { secretKey, appToken, createdAt: new Date().toISOString() };
writeFileSync(out, JSON.stringify(secrets, null, 2));
console.log("Wrote", out);
