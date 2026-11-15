/**
 * Charting Library settings_adapter — stores favorites / user settings in
 * ScopedStorage so they can ride along with cloud profile sync.
 */

import type { KeyValueStorage } from "@/application";
import type { ISettingsAdapter, InitialSettingsMap } from "@/infrastructure/tradingview";

export const USER_SETTINGS_KEY = "forge.tv.userSettings.v1";
/** Per-key time of the last real edit. An untouched copy must not wipe the other computer. */
export const USER_SETTINGS_META_KEY = "forge.tv.userSettings.meta.v1";

/** Default starred Forge indicators (must match study description / UI name). */
export const DEFAULT_FAVORITE_INDICATORS = [
  "Order Block + CISD",
  "IFVG + BPR",
  "BOS / MSS",
  "IRL / ERL",
  "Real Swing High/Low",
  "Fractal (igor-T)",
  "Forge Certainty",
  "Forge Trading Assistant",
  "Forge Replay Mentor",
  "Forge Structure Intelligence",
  "Dealing Ranges",
  "ICT HTF Candles",
  "Forge Sessions",
  "Watermark",
] as const;

type SettingsMap = Record<string, string>;
export type SettingsStamp = Record<string, number>;

let persistHeldUntil = 0;

/** Ignore chart writes that echo the state we just replaced from the other computer. */
export function holdProfilePersist(ms = 2500): void {
  persistHeldUntil = Math.max(persistHeldUntil, Date.now() + ms);
}

export function profilePersistHeld(): boolean {
  return Date.now() < persistHeldUntil;
}

function readMap(storage: KeyValueStorage): SettingsMap {
  const raw = storage.get<SettingsMap | null>(USER_SETTINGS_KEY, null);
  if (!raw || typeof raw !== "object") return {};
  const out: SettingsMap = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

function writeMap(storage: KeyValueStorage, map: SettingsMap): void {
  storage.set(USER_SETTINGS_KEY, map);
}

export function readSettingsStamps(storage: KeyValueStorage): SettingsStamp {
  const raw = storage.get<SettingsStamp | null>(USER_SETTINGS_META_KEY, null);
  if (!raw || typeof raw !== "object") return {};
  const out: SettingsStamp = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
  }
  return out;
}

function writeStamps(storage: KeyValueStorage, stamps: SettingsStamp): void {
  storage.set(USER_SETTINGS_META_KEY, stamps);
}

function touchStamp(storage: KeyValueStorage, key: string): void {
  const stamps = readSettingsStamps(storage);
  stamps[key] = Date.now();
  writeStamps(storage, stamps);
}

/**
 * Keep every setting from both computers. The later edit wins.
 * A key neither side has stamped keeps the other computer's value.
 */
export function mergeUserSettings(
  localMap: SettingsMap,
  remoteMap: SettingsMap,
  localStamps: SettingsStamp,
  remoteStamps: SettingsStamp,
): { map: SettingsMap; stamps: SettingsStamp } {
  const map: SettingsMap = {};
  const stamps: SettingsStamp = {};
  const keys = new Set([
    ...Object.keys(localMap),
    ...Object.keys(remoteMap),
    ...Object.keys(localStamps),
    ...Object.keys(remoteStamps),
  ]);
  for (const key of keys) {
    const localAt = localStamps[key] ?? 0;
    const remoteAt = remoteStamps[key] ?? 0;
    const localValue = localMap[key];
    const remoteValue = remoteMap[key];
    if (localAt > remoteAt) {
      if (localValue !== undefined) map[key] = localValue;
      stamps[key] = localAt;
      continue;
    }
    if (remoteAt > localAt) {
      if (remoteValue !== undefined) map[key] = remoteValue;
      stamps[key] = remoteAt;
      continue;
    }
    if (remoteValue !== undefined) map[key] = remoteValue;
    else if (localValue !== undefined) map[key] = localValue;
    if (remoteAt > 0) stamps[key] = remoteAt;
  }
  return { map, stamps };
}

/** Chart properties the library used to keep only in this browser. */
function isBrowserChartSettingKey(key: string): boolean {
  return (
    key === "chartproperties" ||
    key.startsWith("chartproperties.") ||
    key.startsWith("chart.") ||
    key.startsWith("Chart") ||
    key.startsWith("linetool")
  );
}

function migrateBrowserChartSettings(storage: KeyValueStorage): void {
  if (typeof localStorage === "undefined") return;
  const map = readMap(storage);
  let changed = false;
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key || key.startsWith("forge.") || map[key] || !isBrowserChartSettingKey(key)) continue;
    const value = localStorage.getItem(key);
    if (!value) continue;
    map[key] = value;
    changed = true;
  }
  if (changed) writeMap(storage, map);
}

/** Ensure favorite indicators are present for a brand-new settings bag. */
export function seedFavoriteIndicators(storage: KeyValueStorage): void {
  const map = readMap(storage);
  const key = "chart.favoriteIndicators";
  const existing = map[key];
  if (existing && existing !== "[]" && existing !== "null") return;
  map[key] = JSON.stringify([...DEFAULT_FAVORITE_INDICATORS]);
  // Common CL variants
  map["favoriteIndicators"] = map[key];
  writeMap(storage, map);
}

/** Deduplicate / normalize favorite intervals (fixes double "1m" in the TF strip). */
const DEFAULT_FAVORITE_INTERVALS = [
  "5S",
  "1",
  "5",
  "15",
  "30",
  "60",
  "240",
  "1D",
  "1W",
  "1M",
  "3M",
];

export function seedFavoriteIntervals(storage: KeyValueStorage): void {
  const map = readMap(storage);
  const payload = JSON.stringify(DEFAULT_FAVORITE_INTERVALS);
  let changed = false;
  for (const key of ["chart.favoriteIntervals", "favoriteIntervals"]) {
    const existing = map[key];
    if (!existing || existing === "[]" || existing === "null") {
      map[key] = payload;
      changed = true;
      continue;
    }
    try {
      const parsed = JSON.parse(existing) as unknown;
      if (!Array.isArray(parsed)) {
        map[key] = payload;
        changed = true;
        continue;
      }
      const asStr = parsed.map((x) => String(x));
      const deduped = [...new Set(asStr)];
      if (deduped.length !== asStr.length) {
        map[key] = JSON.stringify(deduped);
        changed = true;
      }
    } catch {
      map[key] = payload;
      changed = true;
    }
  }
  if (changed) writeMap(storage, map);
}

export function createSettingsAdapter(
  storage: KeyValueStorage,
  onChange?: () => void,
): ISettingsAdapter {
  migrateBrowserChartSettings(storage);
  seedFavoriteIndicators(storage);
  seedFavoriteIntervals(storage);

  return {
    // Read at widget start so a sync that landed after login is what the chart shows.
    get initialSettings() {
      return readMap(storage) as InitialSettingsMap;
    },
    setValue(key: string, value: string) {
      if (profilePersistHeld()) return;
      const map = readMap(storage);
      const next = String(value);
      if (map[key] === next) return;
      map[key] = next;
      writeMap(storage, map);
      touchStamp(storage, key);
      onChange?.();
    },
    removeValue(key: string) {
      if (profilePersistHeld()) return;
      const map = readMap(storage);
      if (!(key in map)) return;
      delete map[key];
      writeMap(storage, map);
      touchStamp(storage, key);
      onChange?.();
    },
  };
}

export function readUserSettings(storage: KeyValueStorage): SettingsMap {
  return readMap(storage);
}

export function writeUserSettings(storage: KeyValueStorage, map: SettingsMap): void {
  writeMap(storage, map ?? {});
}

export function writeSettingsStamps(storage: KeyValueStorage, stamps: SettingsStamp): void {
  writeStamps(storage, stamps ?? {});
}
