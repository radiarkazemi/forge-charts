/**
 * Pack / unpack the per-account chart state that must look identical on every PC.
 */

import type { KeyValueStorage } from "@/application";
import { mergeLineToolStores } from "@/infrastructure/tradingview/local-save-load-adapter";
import {
  USER_SETTINGS_KEY,
  USER_SETTINGS_META_KEY,
  mergeUserSettings,
  readSettingsStamps,
  readUserSettings,
  writeSettingsStamps,
  writeUserSettings,
  type SettingsStamp,
} from "./settings-adapter";

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
  USER_SETTINGS_META_KEY,
  // Own-account safety PII only — scoped storage + syncKey gate keep it private.
  "forge.auth.safetyProfile.v1",
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

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** Union of drawing templates. The other computer's copy wins when both saved the same name. */
export function mergeDrawingTemplates(local: unknown, remote: unknown): Record<string, Record<string, string>> {
  const left = asRecord(local) ?? {};
  const right = asRecord(remote) ?? {};
  const out: Record<string, Record<string, string>> = {};
  for (const tool of new Set([...Object.keys(left), ...Object.keys(right)])) {
    const localTool = asRecord(left[tool]) ?? {};
    const remoteTool = asRecord(right[tool]) ?? {};
    const templates: Record<string, string> = {};
    for (const name of new Set([...Object.keys(localTool), ...Object.keys(remoteTool)])) {
      const chosen = remoteTool[name] !== undefined ? remoteTool[name] : localTool[name];
      if (typeof chosen === "string") templates[name] = chosen;
    }
    out[tool] = templates;
  }
  return out;
}

function asSettingsMap(value: unknown): Record<string, string> {
  const record = asRecord(value);
  if (!record) return {};
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(record)) {
    if (typeof entry === "string") out[key] = entry;
  }
  return out;
}

function asStamps(value: unknown): SettingsStamp {
  const record = asRecord(value);
  if (!record) return {};
  const out: SettingsStamp = {};
  for (const [key, entry] of Object.entries(record)) {
    if (typeof entry === "number" && Number.isFinite(entry)) out[key] = entry;
  }
  return out;
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
    if (key === USER_SETTINGS_KEY || key === USER_SETTINGS_META_KEY) {
      continue;
    }
    try {
      if (key === "forge.tv.lineTools") {
        // Union with this device so a phone trendline is not dropped by a newer computer save.
        storage.set(key, mergeLineToolStores(storage.get(key, {}), value));
        continue;
      }
      if (key === "forge.tv.drawingTemplates") {
        storage.set(key, mergeDrawingTemplates(storage.get(key, {}), value));
        continue;
      }
      storage.set(key, value);
    } catch {
      /* ignore */
    }
  }
  if (USER_SETTINGS_KEY in payload.keys || USER_SETTINGS_META_KEY in payload.keys) {
    const merged = mergeUserSettings(
      readUserSettings(storage),
      asSettingsMap(payload.keys[USER_SETTINGS_KEY]),
      readSettingsStamps(storage),
      asStamps(payload.keys[USER_SETTINGS_META_KEY]),
    );
    writeUserSettings(storage, merged.map);
    writeSettingsStamps(storage, merged.stamps);
  }
}
