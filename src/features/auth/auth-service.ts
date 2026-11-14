import type { KeyValueStorage } from "@/application";
import { hashPassword, verifyPassword } from "./password";
import {
  isSafetyProfileComplete,
  type SafetyAuthorizationProfile,
} from "./safety-profile";
import { safetyProfileStorageKey } from "./user-isolation";

const USERS_KEY = "forge.auth.users.v1";
const SESSION_KEY = "forge.auth.session.v1";
const SIGNED_OUT_KEY = "forge.auth.signedOut.v1";
const LEGACY_CLAIM_KEY = "forge.auth.legacyClaimed.v1";

/**
 * The chart iframe snapshots localStorage and writes it back when it closes,
 * which revives the session and deletes a localStorage-only sign-out mark.
 * sessionStorage is not part of that snapshot.
 */
function sessionSignedOut(next?: boolean): boolean {
  try {
    if (typeof sessionStorage === "undefined") return false;
    if (next === true) {
      sessionStorage.setItem(SIGNED_OUT_KEY, "1");
      return true;
    }
    if (next === false) {
      sessionStorage.removeItem(SIGNED_OUT_KEY);
      return false;
    }
    return sessionStorage.getItem(SIGNED_OUT_KEY) === "1";
  } catch {
    return false;
  }
}

/** Stable owner account — password stored as PBKDF2 hash only (never plaintext). */
const OWNER_ID = "owner-radiarkazemi";
const OWNER_USERNAME = "radiarkazemi@gmail.com";
const OWNER_DISPLAY = "Radiar";
const OWNER_PASSWORD_HASH =
  "pbkdf2$120000$JomrF2F0EQ+29BSwT0rNkw==$UWehN8xXdjBPS9e0DQOyyF1LBhtvZqzyqxV6xTNcFMQ=";

/** Team sign-in. The password is stored only as a PBKDF2 hash. */
const TEAM_ID = "team-forge-dev";
const TEAM_USERNAME = "forge-dev";
const TEAM_DISPLAY = "Forge";
const TEAM_PASSWORD_HASH =
  "pbkdf2$120000$2NgSkTqyrfGI1rSw7v9aVQ==$mJ/TXM/+B4A87ecNujkL5mmtrm05gyxP/sG8U+nmon0=";

export interface AuthUserPublic {
  readonly id: string;
  readonly username: string;
  readonly displayName: string;
  readonly createdAt: number;
  readonly safetyComplete: boolean;
}

/**
 * Global registry row — MUST NOT hold phone / national ID / full safety PII.
 * Those live only under `forge.u.<userId>.*` so other accounts cannot read them.
 */
interface AuthUserRecord {
  readonly id: string;
  readonly username: string;
  readonly displayName: string;
  readonly createdAt: number;
  readonly passwordHash: string;
  readonly safetyComplete?: boolean;
  /** @deprecated legacy — migrated out to scoped storage on boot */
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
 * Chart data + safety PII live in per-user scoped keys — other accounts cannot read them.
 */
export class AuthService {
  private unguard: (() => void) | null = null;

  constructor(private readonly storage: KeyValueStorage) {
    try {
      this.migrateSafetyOutOfRegistry();
      this.ensureOwnerAccount();
      this.ensureTeamAccount();
    } catch {
      /* private mode / blocked storage — login will surface a clear error */
    }
  }

  /**
   * @deprecated Not for UI — listing every local account would leak usernames.
   * Prefer `currentUser()`.
   */
  listUsers(): AuthUserPublic[] {
    const self = this.currentUser();
    return self ? [self] : [];
  }

  /** Signed-in account only (never other users on this browser). */
  currentUser(): AuthUserPublic | null {
    const session = this.getSession();
    if (!session) return null;
    const user = this.users().find((u) => u.id === session.userId);
    return user ? this.toPublic(user) : null;
  }

  getSession(): AuthSession | null {
    // Ignore a session the chart iframe copied back after sign-out.
    if (sessionSignedOut() || this.storage.get(SIGNED_OUT_KEY, null)) {
      this.storage.remove(SESSION_KEY);
      this.armSignOutGuard();
      return null;
    }
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
    // Never return another account’s public record to callers — session-bound only.
    const session = this.getSession();
    if (!session || session.userId !== userId) return null;
    const user = this.users().find((u) => u.id === userId);
    return user ? this.toPublic(user) : null;
  }

  /**
   * Safety / authorization PII for the signed-in user only.
   * Returns null for any other userId (even if it exists on this browser).
   */
  getSafetyProfile(userId?: string): SafetyAuthorizationProfile | null {
    const session = this.getSession();
    if (!session) return null;
    if (userId != null && userId !== session.userId) return null;
    return this.readSafetyScoped(session.userId);
  }

  needsSafety(userId?: string): boolean {
    const session = this.getSession();
    const id = userId ?? session?.userId;
    if (!id) return true;
    // Allow checking the session user, or a pending signup id (no session yet).
    if (session && id !== session.userId) return true;
    if (this.isSafetyCompleteFlag(id)) return false;
    return !this.readSafetyScoped(id);
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
      safetyComplete: false,
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

  /** Persist safety profile (scoped) and open the authenticated session. */
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
    this.writeSafetyScoped(pending.userId, safety);
    const current = users[idx]!;
    const next: AuthUserRecord = {
      id: current.id,
      username: current.username,
      displayName: (safety.fullName.trim() || current.displayName).slice(0, 48),
      createdAt: current.createdAt,
      passwordHash: current.passwordHash,
      safetyComplete: true,
    };
    const copy = [...users];
    copy[idx] = next;
    this.writeUsers(copy);
    if (!this.readSafetyScoped(pending.userId)) {
      throw new Error(
        "Could not save authorization details. Check browser storage and try again.",
      );
    }
    return this.startSession(next);
  }

  /** Save safety details for the signed-in account only. */
  saveSafetyProfile(userId: string, safety: SafetyAuthorizationProfile): AuthSession {
    if (!isSafetyProfileComplete(safety)) {
      throw new Error("Complete all safety and authorization fields.");
    }
    const session = this.getSession();
    // Pending login always has a session; reject writes for any other id.
    if (!session || session.userId !== userId) {
      throw new Error("You can only update your own authorization details.");
    }
    const users = this.users();
    const idx = users.findIndex((u) => u.id === userId);
    if (idx < 0) throw new Error("Account not found. Please log in again.");
    this.writeSafetyScoped(userId, safety);
    const current = users[idx]!;
    const next: AuthUserRecord = {
      id: current.id,
      username: current.username,
      displayName: (safety.fullName.trim() || current.displayName).slice(0, 48),
      createdAt: current.createdAt,
      passwordHash: current.passwordHash,
      safetyComplete: true,
    };
    const copy = [...users];
    copy[idx] = next;
    this.writeUsers(copy);
    const updated = this.toSession(next, session.token, session.createdAt);
    this.storage.set(SESSION_KEY, updated);
    this.assertSessionPersisted(updated);
    return updated;
  }

  /** @deprecated Prefer beginSignUp + completeSignup */
  async signUp(input: {
    username: string;
    password: string;
    displayName?: string;
  }): Promise<AuthSession> {
    const pending = await this.beginSignUp(input);
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
    // Same message either way — do not reveal whether the email exists.
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
    // Replace any previous session so the prior account’s UI state cannot linger.
    this.storage.remove(SESSION_KEY);
    return this.startSession(user);
  }

  /**
   * Sign in with a Google profile that was already verified against Google.
   * New emails become accounts and still go through the safety page.
   * The Google subject is the sync secret (stable on every device, never a password).
   */
  signInWithGoogle(profile: {
    email: string;
    name: string;
    sub: string;
  }):
    | { readonly kind: "session"; readonly session: AuthSession; readonly syncSecret: string }
    | { readonly kind: "pending"; readonly pending: PendingSignup; readonly syncSecret: string } {
    assertCryptoAvailable();
    const username = normalizeUsername(profile.email);
    const sub = profile.sub.trim();
    if (!isEmail(username) || sub.length < 4) {
      throw new Error("Google could not confirm this sign-in.");
    }
    const marker = `google$${sub}`;
    const users = this.users();
    const existing = users.find((u) => u.username === username);
    if (existing) {
      if (!existing.passwordHash.startsWith("google$")) {
        throw new Error("This email already has a password. Sign in with email and password.");
      }
      if (existing.passwordHash !== marker) {
        throw new Error("This email is linked to a different Google account.");
      }
      this.storage.remove(SESSION_KEY);
      return { kind: "session", session: this.startSession(existing), syncSecret: sub };
    }
    const displayName = (profile.name.trim() || username.split("@")[0] || username).slice(0, 48);
    const record: AuthUserRecord = {
      id: newId(),
      username,
      displayName,
      createdAt: Date.now(),
      passwordHash: marker,
      safetyComplete: false,
    };
    this.writeUsers([...users, record]);
    const saved = this.users().find((u) => u.id === record.id);
    if (!saved) {
      throw new Error(
        "Could not save your account. Disable private mode / allow site storage, then try again.",
      );
    }
    this.storage.remove(SESSION_KEY);
    return {
      kind: "pending",
      pending: {
        userId: saved.id,
        username: saved.username,
        displayName: saved.displayName,
        password: sub,
      },
      syncSecret: sub,
    };
  }

  logout(): void {
    sessionSignedOut(true);
    this.storage.set(SIGNED_OUT_KEY, Date.now());
    this.storage.remove(SESSION_KEY);
    this.armSignOutGuard();
  }

  /**
   * The chart iframe is another document on this origin. Its storage writes
   * are visible here, so a revived session is removed again immediately.
   */
  private armSignOutGuard(): void {
    if (typeof window === "undefined" || this.unguard) return;
    const onStorage = (event: StorageEvent) => {
      const key = event.key ?? "";
      const sessionRevived = key.includes("forge.auth.session") && event.newValue != null;
      const markCleared = key.includes("forge.auth.signedOut") && event.newValue == null;
      if (!sessionRevived && !markCleared) return;
      this.storage.remove(SESSION_KEY);
      sessionSignedOut(true);
      try {
        this.storage.set(SIGNED_OUT_KEY, Date.now());
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("storage", onStorage);
    this.unguard = () => window.removeEventListener("storage", onStorage);
  }

  private disarmSignOutGuard(): void {
    this.unguard?.();
    this.unguard = null;
  }

  legacyAvailable(): boolean {
    return this.storage.get(LEGACY_CLAIM_KEY, "") === "";
  }

  markLegacyClaimed(userId: string): void {
    const session = this.getSession();
    if (session && session.userId !== userId) return;
    this.storage.set(LEGACY_CLAIM_KEY, userId);
  }

  private readSafetyScoped(userId: string): SafetyAuthorizationProfile | null {
    const raw = this.storage.get<SafetyAuthorizationProfile | null>(
      safetyProfileStorageKey(userId),
      null,
    );
    return isSafetyProfileComplete(raw) ? raw : null;
  }

  private writeSafetyScoped(userId: string, safety: SafetyAuthorizationProfile): void {
    this.storage.set(safetyProfileStorageKey(userId), safety);
  }

  private isSafetyCompleteFlag(userId: string): boolean {
    const user = this.users().find((u) => u.id === userId);
    if (user?.safetyComplete === true && this.readSafetyScoped(userId)) return true;
    return false;
  }

  /** Move legacy embedded `safety` objects out of the shared registry into scoped keys. */
  private migrateSafetyOutOfRegistry(): void {
    const users = this.users();
    let changed = false;
    const next = users.map((u) => {
      if (u.safety && isSafetyProfileComplete(u.safety)) {
        if (!this.readSafetyScoped(u.id)) {
          this.writeSafetyScoped(u.id, u.safety);
        }
        changed = true;
        return {
          id: u.id,
          username: u.username,
          displayName: u.displayName,
          createdAt: u.createdAt,
          passwordHash: u.passwordHash,
          safetyComplete: true,
        } satisfies AuthUserRecord;
      }
      if ("safety" in u && u.safety != null) {
        changed = true;
        return {
          id: u.id,
          username: u.username,
          displayName: u.displayName,
          createdAt: u.createdAt,
          passwordHash: u.passwordHash,
          safetyComplete: Boolean(u.safetyComplete),
        } satisfies AuthUserRecord;
      }
      return u;
    });
    if (changed) this.writeUsers(next);
  }

  private ensureOwnerAccount(): void {
    const users = this.users();
    const ownerSafety: SafetyAuthorizationProfile = {
      fullName: OWNER_DISPLAY,
      phone: "09000000000",
      nationalId: "0000000000",
      country: "Iran",
      acceptedTerms: true,
      acceptedRisk: true,
      completedAt: 1,
    };
    const owner: AuthUserRecord = {
      id: OWNER_ID,
      username: OWNER_USERNAME,
      displayName: OWNER_DISPLAY,
      createdAt: Date.now(),
      passwordHash: OWNER_PASSWORD_HASH,
      safetyComplete: true,
    };
    const byId = users.findIndex((u) => u.id === OWNER_ID);
    const byName = users.findIndex((u) => u.username === OWNER_USERNAME);
    if (byId >= 0) {
      const prev = users[byId]!;
      const next = [...users];
      next[byId] = {
        ...owner,
        createdAt: prev.createdAt || owner.createdAt,
        displayName: prev.displayName || owner.displayName,
        safetyComplete: true,
      };
      const cleaned = next.filter((u, i) => i === byId || u.username !== OWNER_USERNAME);
      this.writeUsers(cleaned);
      if (!this.readSafetyScoped(OWNER_ID)) this.writeSafetyScoped(OWNER_ID, ownerSafety);
      return;
    }
    if (byName >= 0) {
      const prev = users[byName]!;
      const next = [...users];
      next[byName] = {
        ...owner,
        id: prev.id,
        createdAt: prev.createdAt || owner.createdAt,
        displayName: prev.displayName || owner.displayName,
        safetyComplete: true,
      };
      this.writeUsers(next);
      if (!this.readSafetyScoped(prev.id)) this.writeSafetyScoped(prev.id, ownerSafety);
      return;
    }
    this.writeUsers([...users, owner]);
    this.writeSafetyScoped(OWNER_ID, ownerSafety);
  }

  /** Built-in team login. Accepts the username even though it is not an email. */
  private ensureTeamAccount(): void {
    const users = this.users();
    const safety: SafetyAuthorizationProfile = {
      fullName: TEAM_DISPLAY,
      phone: "",
      nationalId: "",
      country: "Iran",
      acceptedTerms: true,
      acceptedRisk: true,
      completedAt: 1,
    };
    const account: AuthUserRecord = {
      id: TEAM_ID,
      username: TEAM_USERNAME,
      displayName: TEAM_DISPLAY,
      createdAt: Date.now(),
      passwordHash: TEAM_PASSWORD_HASH,
      safetyComplete: true,
    };
    const byName = users.findIndex((u) => u.username === TEAM_USERNAME);
    if (byName >= 0) {
      const prev = users[byName]!;
      const next = [...users];
      next[byName] = {
        ...account,
        id: prev.id,
        createdAt: prev.createdAt || account.createdAt,
        displayName: prev.displayName || account.displayName,
        safetyComplete: true,
      };
      this.writeUsers(next);
      if (!this.readSafetyScoped(prev.id)) this.writeSafetyScoped(prev.id, safety);
      return;
    }
    this.writeUsers([...users, account]);
    this.writeSafetyScoped(TEAM_ID, safety);
  }

  private startSession(user: AuthUserRecord): AuthSession {
    this.disarmSignOutGuard();
    sessionSignedOut(false);
    this.storage.remove(SIGNED_OUT_KEY);
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
    // Strip any accidental PII before persisting the shared registry.
    const clean = users.map((u) => ({
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      createdAt: u.createdAt,
      passwordHash: u.passwordHash,
      safetyComplete: Boolean(u.safetyComplete) || this.readSafetyScoped(u.id) != null,
    }));
    this.storage.set(USERS_KEY, clean);
    const saved = this.users();
    if (saved.length < clean.length) {
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
      safetyComplete: Boolean(user.safetyComplete) || this.readSafetyScoped(user.id) != null,
    };
  }

  private toSession(user: AuthUserRecord, token: string, createdAt: number): AuthSession {
    return {
      userId: user.id,
      username: user.username,
      displayName: user.displayName,
      token,
      createdAt,
      safetyComplete: Boolean(user.safetyComplete) || this.readSafetyScoped(user.id) != null,
    };
  }

  private users(): AuthUserRecord[] {
    const raw = this.storage.get<AuthUserRecord[]>(USERS_KEY, []);
    return Array.isArray(raw) ? raw : [];
  }
}
