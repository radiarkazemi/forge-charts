/** Minimal persistence port; implemented by localStorage in the browser. */
export interface KeyValueStorage {
  get<T>(key: string, fallback: T): T;
  set(key: string, value: unknown): void;
  remove(key: string): void;
}
