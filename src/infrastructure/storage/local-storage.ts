import type { KeyValueStorage } from "@/application";

/** `KeyValueStorage` backed by `window.localStorage`; silently degrades when unavailable. */
export class LocalStorageAdapter implements KeyValueStorage {
  constructor(private readonly storage: Storage | null = safeLocalStorage()) {}

  get<T>(key: string, fallback: T): T {
    try {
      const raw = this.storage?.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  }

  set(key: string, value: unknown): void {
    try {
      if (value === undefined) {
        this.storage?.removeItem(key);
        return;
      }
      this.storage?.setItem(key, JSON.stringify(value));
    } catch {
      /* quota exceeded or private mode */
    }
  }

  remove(key: string): void {
    try {
      this.storage?.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}
