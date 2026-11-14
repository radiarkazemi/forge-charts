/**
 * PBKDF2-SHA256 password hashing (Web Crypto).
 * New hashes use the current iteration count. Older hashes still verify,
 * and a successful login replaces them.
 */

const ITERATIONS = 600_000;
export const MIN_NEW_PASSWORD = 15;
export const MAX_PASSWORD = 128;

const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "password123",
  "password1234",
  "password12345",
  "123456789012345",
  "1234567890123456",
  "qwertyuiopasdfg",
  "qwertyuiopasdfgh",
  "changeme1234567",
  "letmeinletmein1",
  "iloveyouiloveyou",
  "adminadminadmin",
  "welcomewelcome1",
  "forgechartforge",
  "forgechart12345",
]);

/** Reject short, huge, repeated, or widely used passwords. No character-class rules. */
export function passwordPolicyError(password: string): string | null {
  if (password.length < MIN_NEW_PASSWORD) {
    return `Password must be at least ${MIN_NEW_PASSWORD} characters.`;
  }
  if (password.length > MAX_PASSWORD) {
    return `Password must be at most ${MAX_PASSWORD} characters.`;
  }
  if (/^(.)\1+$/.test(password) || COMMON_PASSWORDS.has(password.toLowerCase())) {
    return "Choose a password that is not a common password.";
  }
  return null;
}

export function passwordNeedsUpgrade(stored: string): boolean {
  const parts = stored.split("$");
  if (parts[0] !== "pbkdf2" || parts.length !== 4) return false;
  const iterations = Number(parts[1]);
  return !Number.isFinite(iterations) || iterations < ITERATIONS;
}

const SALT_BYTES = 16;
const KEY_BYTES = 32;

function bufToB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 1) s += String.fromCharCode(bytes[i]!);
  return btoa(s);
}

function b64ToBuf(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i += 1) out[i] = s.charCodeAt(i);
  return out;
}

async function derive(password: string, salt: Uint8Array): Promise<ArrayBuffer> {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  return crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations: ITERATIONS,
      hash: "SHA-256",
    },
    base,
    KEY_BYTES * 8,
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const bits = await derive(password, salt);
  return `pbkdf2$${ITERATIONS}$${bufToB64(salt)}$${bufToB64(bits)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = Number(parts[1]);
  if (!Number.isFinite(iterations) || iterations < 10_000) return false;
  const salt = b64ToBuf(parts[2]!);
  const expected = b64ToBuf(parts[3]!);
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations,
      hash: "SHA-256",
    },
    base,
    expected.length * 8,
  );
  const actual = new Uint8Array(bits);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i += 1) diff |= actual[i]! ^ expected[i]!;
  return diff === 0;
}
