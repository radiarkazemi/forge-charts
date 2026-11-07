/**
 * Pack / unpack the per-account chart state that must look identical on every PC.
 */

import type { KeyValueStorage } from "@/application";
import { USER_SETTINGS_KEY, readUserSettings, writeUserSettings } from "./settings-adapter";

export const PROFILE_BLOB_KEYS = [
  "forge.settings.v1",
  "forge.tv.autosave.v3",
  "forge.tv.autosave.v3.bak",
  "forge.tv.charts",
  "forge.tv.studyTemplates",
  "forge.tv.drawingTemplates",
  "forge.tv.chartTemplates",
  "forge.tv.lineTools",
  USER_SETTINGS_KEY,
] as const;

export type ProfileBlobKey = (typeof PROFILE_BLOB_KEYS)[number];

export interface ProfilePayload {
  readonly version: 1;
  readonly keys: Partial<Record<ProfileBlobKey, unknown>>;
}

export interface LocalProfileStamp {
  readonly updatedAt: number;
}

const STAMP_KEY = "forge.profile.sync.stamp.v1";

export function readLocalStamp(storage: KeyValueStorage): number {
  const raw = storage.get<LocalProfileStamp | null>(STAMP_KEY, null);
  return raw && Number.isFinite(raw.updatedAt) ? Number(raw.updatedAt) : 0;
}

export function touchLocalStamp(storage: KeyValueStorage, at = Date.now()): number {
  storage.set(STAMP_KEY, { updatedAt: at } satisfies LocalProfileStamp);
  return at;
}

export function collectProfilePayload(storage: KeyValueStorage): ProfilePayload {
  const keys: Partial<Record<ProfileBlobKey, unknown>> = {};
  for (const key of PROFILE_BLOB_KEYS) {
    if (key === USER_SETTINGS_KEY) {
      keys[key] = readUserSettings(storage);
      continue;
    }
    try {
      const value = storage.get<unknown>(key, undefined);
      if (value !== undefined) keys[key] = value;
    } catch {
      /* ignore */
    }
  }
  return { version: 1, keys };
}

export function applyProfilePayload(
  storage: KeyValueStorage,
  payload: ProfilePayload | null | undefined,
): void {
  if (!payload || payload.version !== 1 || !payload.keys) return;
  for (const key of PROFILE_BLOB_KEYS) {
    if (!(key in payload.keys)) continue;
    const value = payload.keys[key];
    if (value === undefined) continue;
    if (key === USER_SETTINGS_KEY) {
      writeUserSettings(
        storage,
        value && typeof value === "object" ? (value as Record<string, string>) : {},
      );
      continue;
    }
    try {
      storage.set(key, value);
    } catch {
      /* ignore */
    }
  }
}
