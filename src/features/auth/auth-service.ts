import type { KeyValueStorage } from "@/application";
import { hashPassword, verifyPassword } from "./password";
import {
  isSafetyProfileComplete,
  type SafetyAuthorizationProfile,
} from "./safety-profile";

const USERS_KEY = "forge.auth.users.v1";
const SESSION_KEY = "forge.auth.session.v1";
const LEGACY_CLAIM_KEY = "forge.auth.legacyClaimed.v1";

/** Stable owner account — password stored as PBKDF2 hash only (never plaintext). */
const OWNER_ID = "owner-radiarkazemi";
const OWNER_USERNAME = "radiarkazemi@gmail.com";
const OWNER_DISPLAY = "Radiar";
const OWNER_PASSWORD_HASH =
  "pbkdf2$120000$JomrF2F0EQ+29BSwT0rNkw==$UWehN8xXdjBPS9e0DQOyyF1LBhtvZqzyqxV6xTNcFMQ=";

export interface AuthUserPublic {
  readonly id: string;
  readonly username: string;
  readonly displayName: string;
  readonly createdAt: number;
  readonly safetyComplete: boolean;
}

interface AuthUserRecord {
  readonly id: string;
  readonly username: string;
  readonly displayName: string;
  readonly createdAt: number;
  readonly passwordHash: string;
  readonly safety?: SafetyAuthorizationProfile;
}

export interface AuthSession {
  readonly userId: string;
  readonly username: string;
  readonly displayName: string;
  readonly token: string;
  readonly createdAt: number;
  readonly safetyComplete: boolean;
}

export interface PendingSignup {
  readonly userId: string;
  readonly username: string;
  readonly displayName: string;
  /** Kept only in memory until safety completes — never written to storage. */
  readonly password: string;
}

function isEmail(value: string): boolean {
  return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(value);
}

function normalizeUsername(raw: string): string {
  const trimmed = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (isEmail(trimmed)) return trimmed.slice(0, 64);
  return trimmed.slice(0, 32);
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function assertCryptoAvailable(): void {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    throw new Error(
      "Secure browser context required for sign up. Open the site over HTTPS and try again.",
    );
  }
}

/**
 * Local account registry + session.
 * Chart data lives in ScopedStorage per userId — other accounts cannot read it.
 */
export class AuthService {
  constructor(private readonly storage: KeyValueStorage) {
    try {
      this.ensureOwnerAccount();
    } catch {
      /* private mode / blocked storage — login will surface a clear error */
    }
  }

  listUsers(): AuthUserPublic[] {
    return this.users().map((u) => this.toPublic(u));
  }

  getSession(): AuthSession | null {
    const session = this.storage.get<AuthSession | null>(SESSION_KEY, null);
    if (!session?.userId || !session.token) return null;
    const user = this.users().find((u) => u.id === session.userId);
    if (!user) {
      this.logout();
      return null;
    }
    return this.toSession(user, session.token, session.createdAt);
  }

  getUser(userId: string): AuthUserPublic | null {
    const user = this.users().find((u) => u.id === userId);
    return user ? this.toPublic(user) : null;
  }

  getSafetyProfile(userId: string): SafetyAuthorizationProfile | null {
    const user = this.users().find((u) => u.id === userId);
    return user?.safety && isSafetyProfileComplete(user.safety) ? user.safety : null;
  }

  needsSafety(userId: string): boolean {
    return !this.getSafetyProfile(userId);
  }

  /**
   * Create the account without opening a chart session yet.
   * Caller must collect safety/authorization info, then call `completeSignup`.
   */
  async beginSignUp(input: {
    username: string;
    password: string;
    displayName?: string;
  }): Promise<PendingSignup> {
    assertCryptoAvailable();
    const username = normalizeUsername(input.username);
    const password = input.password;
    if (!isEmail(username)) {
      throw new Error("Enter a valid email address (example: you@email.com).");
    }
    if (username.length < 5) throw new Error("Email must be at least 5 characters.");
    if (password.length < 6) throw new Error("Password must be at least 6 characters.");
    const users = this.users();
    if (users.some((u) => u.username === username)) {
      throw new Error("That email is already registered. Log in instead.");
    }
    const displayName =
      (input.displayName?.trim() || username.split("@")[0] || username).slice(0, 48) || username;
    let passwordHash: string;
    try {
      passwordHash = await hashPassword(password);
    } catch {
      throw new Error(
        "Could not secure your password in this browser. Use HTTPS / another browser and try again.",
      );
    }
    const record: AuthUserRecord = {
      id: newId(),
      username,
      displayName,
      createdAt: Date.now(),
      passwordHash,
    };
    this.writeUsers([...users, record]);
    const saved = this.users().find((u) => u.id === record.id);
    if (!saved) {
      throw new Error(
        "Could not save your account. Disable private mode / allow site storage, then try again.",
      );
    }
    // Do not start a session yet — safety page must complete first.
    this.storage.remove(SESSION_KEY);
    return {
      userId: record.id,
      username: record.username,
      displayName: record.displayName,
      password,
    };
  }

  /** Persist safety profile and open the authenticated session. */
  async completeSignup(
    pending: PendingSignup,
    safety: SafetyAuthorizationProfile,
  ): Promise<AuthSession> {
    if (!isSafetyProfileComplete(safety)) {
      throw new Error("Complete all safety and authorization fields.");
    }
    const users = this.users();
    const idx = users.findIndex((u) => u.id === pending.userId);
    if (idx < 0) {
      throw new Error("Signup expired. Please create your account again.");
    }
    const current = users[idx]!;
    const next: AuthUserRecord = {
      ...current,
      displayName: (safety.fullName.trim() || current.displayName).slice(0, 48),
      safety,
    };
    const copy = [...users];
    copy[idx] = next;
    this.writeUsers(copy);
    const saved = this.users()[idx];
    if (!saved?.safety || !isSafetyProfileComplete(saved.safety)) {
      throw new Error(
        "Could not save authorization details. Check browser storage and try again.",
      );
    }
    return this.startSession(saved);
  }

  /** Save safety details for an existing logged-in account that skipped the form. */
  saveSafetyProfile(userId: string, safety: SafetyAuthorizationProfile): AuthSession {
    if (!isSafetyProfileComplete(safety)) {
      throw new Error("Complete all safety and authorization fields.");
    }
    const users = this.users();
    const idx = users.findIndex((u) => u.id === userId);
    if (idx < 0) throw new Error("Account not found. Please log in again.");
    const current = users[idx]!;
    const next: AuthUserRecord = {
      ...current,
      displayName: (safety.fullName.trim() || current.displayName).slice(0, 48),
      safety,
    };
    const copy = [...users];
    copy[idx] = next;
    this.writeUsers(copy);
    const saved = this.users().find((u) => u.id === userId);
    if (!saved) throw new Error("Could not save authorization details.");
    const existing = this.getSession();
    if (existing?.userId === userId) {
      const session = this.toSession(saved, existing.token, existing.createdAt);
      this.storage.set(SESSION_KEY, session);
      this.assertSessionPersisted(session);
      return session;
    }
    return this.startSession(saved);
  }

  /** @deprecated Prefer beginSignUp + completeSignup — kept for compatibility. */
  async signUp(input: {
    username: string;
    password: string;
    displayName?: string;
  }): Promise<AuthSession> {
    const pending = await this.beginSignUp(input);
    // Legacy one-shot signup without safety — still create a session so old callers work.
    const user = this.users().find((u) => u.id === pending.userId);
    if (!user) throw new Error("Could not create account.");
    return this.startSession(user);
  }

  async login(usernameRaw: string, password: string): Promise<AuthSession> {
    assertCryptoAvailable();
    this.ensureOwnerAccount();
    const username = normalizeUsername(usernameRaw);
    if (!username) throw new Error("Enter your email.");
    const user = this.users().find((u) => u.username === username);
    if (!user) throw new Error("Invalid email or password.");
    let ok = false;
    try {
      ok = await verifyPassword(password, user.passwordHash);
    } catch {
      throw new Error(
        "Could not verify password in this browser. Use HTTPS / another browser and try again.",
      );
    }
    if (!ok) throw new Error("Invalid email or password.");
    return this.startSession(user);
  }

  logout(): void {
    this.storage.remove(SESSION_KEY);
  }

  /** True if legacy (pre-auth) chart data has not been claimed by any account yet. */
  legacyAvailable(): boolean {
    return this.storage.get(LEGACY_CLAIM_KEY, "") === "";
  }

  markLegacyClaimed(userId: string): void {
    this.storage.set(LEGACY_CLAIM_KEY, userId);
  }

  /** Ensure the owner email account exists with the seeded password hash. */
  private ensureOwnerAccount(): void {
    const users = this.users();
    const owner: AuthUserRecord = {
      id: OWNER_ID,
      username: OWNER_USERNAME,
      displayName: OWNER_DISPLAY,
      createdAt: Date.now(),
      passwordHash: OWNER_PASSWORD_HASH,
      // Owner is pre-authorized — no safety gate.
      safety: {
        fullName: OWNER_DISPLAY,
        phone: "09000000000",
        nationalId: "0000000000",
        country: "Iran",
        acceptedTerms: true,
        acceptedRisk: true,
        completedAt: 1,
      },
    };
    const byId = users.findIndex((u) => u.id === OWNER_ID);
    const byName = users.findIndex((u) => u.username === OWNER_USERNAME);
    if (byId >= 0) {
      const prev = users[byId]!;
      const next = [...users];
      next[byId] = {
        ...owner,
        createdAt: prev.createdAt || owner.createdAt,
        safety: isSafetyProfileComplete(prev.safety) ? prev.safety : owner.safety,
        displayName: prev.displayName || owner.displayName,
      };
      // Drop duplicate username rows pointing elsewhere.
      const cleaned = next.filter((u, i) => i === byId || u.username !== OWNER_USERNAME);
      this.writeUsers(cleaned);
      return;
    }
    if (byName >= 0) {
      const prev = users[byName]!;
      const next = [...users];
      next[byName] = {
        ...owner,
        id: prev.id, // keep existing scoped storage keys
        createdAt: prev.createdAt || owner.createdAt,
        safety: isSafetyProfileComplete(prev.safety) ? prev.safety : owner.safety,
        displayName: prev.displayName || owner.displayName,
      };
      this.writeUsers(next);
      return;
    }
    this.writeUsers([...users, owner]);
  }

  private startSession(user: AuthUserRecord): AuthSession {
    const session = this.toSession(user, newId(), Date.now());
    this.storage.set(SESSION_KEY, session);
    this.assertSessionPersisted(session);
    return session;
  }

  private assertSessionPersisted(session: AuthSession): void {
    const saved = this.storage.get<AuthSession | null>(SESSION_KEY, null);
    if (!saved?.token || saved.userId !== session.userId) {
      throw new Error(
        "Could not start your session. Allow site storage (disable private mode) and try again.",
      );
    }
  }

  private writeUsers(users: AuthUserRecord[]): void {
    this.storage.set(USERS_KEY, users);
    const saved = this.users();
    if (saved.length < users.length) {
      throw new Error(
        "Could not save account data. Allow site storage (disable private mode) and try again.",
      );
    }
  }

  private toPublic(user: AuthUserRecord): AuthUserPublic {
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      createdAt: user.createdAt,
      safetyComplete: isSafetyProfileComplete(user.safety),
    };
  }

  private toSession(user: AuthUserRecord, token: string, createdAt: number): AuthSession {
    return {
      userId: user.id,
      username: user.username,
      displayName: user.displayName,
      token,
      createdAt,
      safetyComplete: isSafetyProfileComplete(user.safety),
    };
  }

  private users(): AuthUserRecord[] {
    const raw = this.storage.get<AuthUserRecord[]>(USERS_KEY, []);
    return Array.isArray(raw) ? raw : [];
  }
}
