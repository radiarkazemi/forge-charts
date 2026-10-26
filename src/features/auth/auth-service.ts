import type { KeyValueStorage } from "@/application";
import { hashPassword, verifyPassword } from "./password";

const USERS_KEY = "forge.auth.users.v1";
const SESSION_KEY = "forge.auth.session.v1";
const LEGACY_CLAIM_KEY = "forge.auth.legacyClaimed.v1";

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

function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "").slice(0, 32);
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
  constructor(private readonly storage: KeyValueStorage) {}

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
    if (!/^[a-z0-9._-]+$/.test(username)) {
      throw new Error("Username may only use letters, numbers, . _ -");
    }
    if (password.length < 6) throw new Error("Password must be at least 6 characters.");
    const users = this.users();
    if (users.some((u) => u.username === username)) {
      throw new Error("That username is already taken.");
    }
    const displayName =
      (input.displayName?.trim() || username).slice(0, 48) || username;
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
