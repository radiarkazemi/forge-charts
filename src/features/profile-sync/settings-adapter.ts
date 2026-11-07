/**
 * Charting Library settings_adapter — stores favorites / user settings in
 * ScopedStorage so they can ride along with cloud profile sync.
 */

import type { KeyValueStorage } from "@/application";
import type { ISettingsAdapter, InitialSettingsMap } from "@/infrastructure/tradingview";

export const USER_SETTINGS_KEY = "forge.tv.userSettings.v1";

/** Default starred Forge indicators (must match study description / UI name). */
export const DEFAULT_FAVORITE_INDICATORS = [
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

export function createSettingsAdapter(
  storage: KeyValueStorage,
  onChange?: () => void,
): ISettingsAdapter {
  seedFavoriteIndicators(storage);
  const initial = readMap(storage);

  return {
    initialSettings: initial as InitialSettingsMap,
    setValue(key: string, value: string) {
      const map = readMap(storage);
      map[key] = String(value);
      writeMap(storage, map);
      onChange?.();
    },
    removeValue(key: string) {
      const map = readMap(storage);
      if (!(key in map)) return;
      delete map[key];
      writeMap(storage, map);
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
