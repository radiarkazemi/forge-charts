import type { KeyValueStorage } from "@/application";

/**
 * Prefixes every key with a user id so accounts on the same browser
 * cannot read each other’s settings / autosave / layouts.
 */
export class ScopedStorage implements KeyValueStorage {
  private readonly prefix: string;

  constructor(
    private readonly inner: KeyValueStorage,
    userId: string,
  ) {
    const safe = userId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) || "anon";
    this.prefix = `forge.u.${safe}.`;
  }

  get<T>(key: string, fallback: T): T {
    return this.inner.get(this.prefix + key, fallback);
  }

  set(key: string, value: unknown): void {
    this.inner.set(this.prefix + key, value);
  }

  remove(key: string): void {
    this.inner.remove(this.prefix + key);
  }

  /** Absolute (unscoped) access — for one-time migrations only. */
  raw(): KeyValueStorage {
    return this.inner;
  }

  scopedKey(key: string): string {
    return this.prefix + key;
  }
}
