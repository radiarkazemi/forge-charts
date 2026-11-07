/** Derive account + sync keys from login credentials (never send the password). */

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const dig = await crypto.subtle.digest("SHA-256", data);
  return toHex(dig);
}

/** Stable public account id — SHA-256(lowercase username). */
export async function deriveAccountKey(username: string): Promise<string> {
  return sha256Hex(username.trim().toLowerCase());
}

/**
 * Sync bearer — SHA-256(username + "\\n" + password).
 * Same credentials on every PC yield the same key so the cloud blob is shared.
 */
export async function deriveSyncKey(username: string, password: string): Promise<string> {
  return sha256Hex(`${username.trim().toLowerCase()}\n${password}`);
}
