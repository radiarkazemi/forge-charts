import type { KeyValueStorage } from "@/application";
import { hashPassword, verifyPassword } from "./password";

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
}

interface AuthUserRecord extends AuthUserPublic {
  readonly passwordHash: string;
}

export interface AuthSession {
  readonly userId: string;
  readonly username: string;
  readonly displayName: string;
  readonly token: string;
  readonly createdAt: number;
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

/**
 * Local account registry + session.
 * Chart data lives in ScopedStorage per userId — other accounts cannot read it.
 */
export class AuthService {
  constructor(private readonly storage: KeyValueStorage) {
    this.ensureOwnerAccount();
  }

  listUsers(): AuthUserPublic[] {
    return this.users().map(({ id, username, displayName, createdAt }) => ({
      id,
      username,
      displayName,
      createdAt,
    }));
  }

  getSession(): AuthSession | null {
    const session = this.storage.get<AuthSession | null>(SESSION_KEY, null);
    if (!session?.userId || !session.token) return null;
    const user = this.users().find((u) => u.id === session.userId);
    if (!user) {
      this.logout();
      return null;
    }
    return {
      ...session,
      username: user.username,
      displayName: user.displayName,
    };
  }

  async signUp(input: {
    username: string;
    password: string;
    displayName?: string;
  }): Promise<AuthSession> {
    const username = normalizeUsername(input.username);
    const password = input.password;
    if (username.length < 3) throw new Error("Username must be at least 3 characters.");
    if (!isEmail(username) && !/^[a-z0-9._-]+$/.test(username)) {
      throw new Error("Use an email or letters, numbers, . _ -");
    }
    if (password.length < 6) throw new Error("Password must be at least 6 characters.");
    const users = this.users();
    if (users.some((u) => u.username === username)) {
      throw new Error("That username is already taken.");
    }
    const displayName =
      (input.displayName?.trim() || (isEmail(username) ? username.split("@")[0]! : username)).slice(
        0,
        48,
      ) || username;
    const record: AuthUserRecord = {
      id: newId(),
      username,
      displayName,
      createdAt: Date.now(),
      passwordHash: await hashPassword(password),
    };
    this.storage.set(USERS_KEY, [...users, record]);
    return this.startSession(record);
  }

  async login(usernameRaw: string, password: string): Promise<AuthSession> {
    this.ensureOwnerAccount();
    const username = normalizeUsername(usernameRaw);
    const user = this.users().find((u) => u.username === username);
    if (!user) throw new Error("Invalid username or password.");
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) throw new Error("Invalid username or password.");
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
    };
    const byId = users.findIndex((u) => u.id === OWNER_ID);
    const byName = users.findIndex((u) => u.username === OWNER_USERNAME);
    if (byId >= 0) {
      const next = [...users];
      next[byId] = {
        ...owner,
        createdAt: users[byId]!.createdAt || owner.createdAt,
      };
      // Drop duplicate username rows pointing elsewhere.
      const cleaned = next.filter((u, i) => i === byId || u.username !== OWNER_USERNAME);
      this.storage.set(USERS_KEY, cleaned);
      return;
    }
    if (byName >= 0) {
      const next = [...users];
      next[byName] = {
        ...owner,
        id: users[byName]!.id, // keep existing scoped storage keys
        createdAt: users[byName]!.createdAt || owner.createdAt,
      };
      this.storage.set(USERS_KEY, next);
      return;
    }
    this.storage.set(USERS_KEY, [...users, owner]);
  }

  private startSession(user: AuthUserRecord): AuthSession {
    const session: AuthSession = {
      userId: user.id,
      username: user.username,
      displayName: user.displayName,
      token: newId(),
      createdAt: Date.now(),
    };
    this.storage.set(SESSION_KEY, session);
    return session;
  }

  private users(): AuthUserRecord[] {
    const raw = this.storage.get<AuthUserRecord[]>(USERS_KEY, []);
    return Array.isArray(raw) ? raw : [];
  }
}
