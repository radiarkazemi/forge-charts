/**
 * Pull / push Radiar (account) chart state across devices.
 */

import type { KeyValueStorage } from "@/application";
import { mergeLineToolStores } from "@/infrastructure/tradingview/local-save-load-adapter";
import {
  applyProfilePayload,
  collectProfilePayload,
  mergeAccountLayout,
  mergeDrawingTemplates,
  readLocalStamp,
  touchLocalStamp,
  type ProfilePayload,
} from "./profile-blob";
import {
  holdProfilePersist,
  mergeUserSettings,
  readSettingsStamps,
  readUserSettings,
  writeSettingsStamps,
  writeUserSettings,
  USER_SETTINGS_KEY,
  USER_SETTINGS_META_KEY,
} from "./settings-adapter";

const SYNC_KEY_SESSION = "forge.profile.syncKey.v1";
const ACCOUNT_KEY_SESSION = "forge.profile.accountKey.v1";
const CREDS_LOCAL = "forge.profile.syncCreds.v1";
const SIGNED_OUT_KEY = "forge.auth.signedOut.v1";

/** Fired when a cloud conflict merged drawings into this browser. The chart repaints them. */
export const DRAWINGS_UPDATED_EVENT = "forge:drawings-updated";
/** Fired when chart properties arrived from the other computer. The chart reloads them. */
export const SETTINGS_UPDATED_EVENT = "forge:settings-updated";

export interface ProfileSyncCredentials {
  readonly accountKey: string;
  readonly syncKey: string;
}

function apiBase(): string {
  // Same-origin when served from forgechart.ir; Vite proxies /api/forge-profile in dev.
  return "/api/forge-profile";
}

function rememberCreds(creds: ProfileSyncCredentials | null): void {
  try {
    if (!creds) localStorage.removeItem(CREDS_LOCAL);
    else localStorage.setItem(CREDS_LOCAL, JSON.stringify(creds));
  } catch {
    /* private mode */
  }
}

function validCreds(syncKey: string, accountKey: string): ProfileSyncCredentials | null {
  if (syncKey.length === 64 && accountKey.length === 64) return { syncKey, accountKey };
  return null;
}

export function storeSyncCredentials(creds: ProfileSyncCredentials): void {
  try {
    sessionStorage.setItem(SYNC_KEY_SESSION, creds.syncKey);
    sessionStorage.setItem(ACCOUNT_KEY_SESSION, creds.accountKey);
  } catch {
    /* private mode */
  }
  // Survive a closed phone browser. The password itself is never stored.
  rememberCreds(creds);
}

export function clearSyncCredentials(): void {
  try {
    sessionStorage.removeItem(SYNC_KEY_SESSION);
    sessionStorage.removeItem(ACCOUNT_KEY_SESSION);
  } catch {
    /* ignore */
  }
  rememberCreds(null);
}

export function readSyncCredentials(): ProfileSyncCredentials | null {
  try {
    if (sessionStorage.getItem(SIGNED_OUT_KEY) === "1") return null;
  } catch {
    /* ignore */
  }
  try {
    const fromSession = validCreds(
      sessionStorage.getItem(SYNC_KEY_SESSION) || "",
      sessionStorage.getItem(ACCOUNT_KEY_SESSION) || "",
    );
    if (fromSession) {
      // A refresh keeps the tab key. Copy it so the next closed browser can still sync.
      rememberCreds(fromSession);
      return fromSession;
    }
  } catch {
    /* ignore */
  }
  try {
    const raw = localStorage.getItem(CREDS_LOCAL);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ProfileSyncCredentials>;
    const creds = validCreds(parsed.syncKey || "", parsed.accountKey || "");
    if (!creds) return null;
    try {
      sessionStorage.setItem(SYNC_KEY_SESSION, creds.syncKey);
      sessionStorage.setItem(ACCOUNT_KEY_SESSION, creds.accountKey);
    } catch {
      /* ignore */
    }
    return creds;
  } catch {
    return null;
  }
}

interface RemoteProfile {
  readonly updatedAt: number;
  readonly payload: ProfilePayload | null;
}

export interface ProfilePullResult {
  readonly appliedRemote: boolean;
  readonly drawingsChanged: boolean;
  readonly settingsChanged: boolean;
}

function stableSettings(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return JSON.stringify(entries);
}

function asSettings(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === "string") out[key] = entry;
  }
  return out;
}

function asStamps(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, number> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === "number" && Number.isFinite(entry)) out[key] = entry;
  }
  return out;
}

/** Fold the other computer's drawings and settings in before this device publishes. */
function absorbRemoteEdits(storage: KeyValueStorage, payload: ProfilePayload | null | undefined): {
  drawingsChanged: boolean;
  settingsChanged: boolean;
} {
  if (!payload?.keys) return { drawingsChanged: false, settingsChanged: false };
  const beforeTools = JSON.stringify(storage.get("forge.tv.lineTools", null));
  const beforeSettings = stableSettings(readUserSettings(storage));
  const remoteTools = payload.keys["forge.tv.lineTools"];
  if (remoteTools !== undefined) {
    storage.set("forge.tv.lineTools", mergeLineToolStores(storage.get("forge.tv.lineTools", {}), remoteTools));
  }
  const remoteTemplates = payload.keys["forge.tv.drawingTemplates"];
  if (remoteTemplates !== undefined) {
    storage.set(
      "forge.tv.drawingTemplates",
      mergeDrawingTemplates(storage.get("forge.tv.drawingTemplates", {}), remoteTemplates),
    );
  }
  if (payload.keys[USER_SETTINGS_KEY] !== undefined || payload.keys[USER_SETTINGS_META_KEY] !== undefined) {
    const merged = mergeUserSettings(
      readUserSettings(storage),
      asSettings(payload.keys[USER_SETTINGS_KEY]),
      readSettingsStamps(storage),
      asStamps(payload.keys[USER_SETTINGS_META_KEY]),
    );
    writeUserSettings(storage, merged.map);
    writeSettingsStamps(storage, merged.stamps);
  }
  const layoutChanged = mergeAccountLayout(storage, payload.keys, false);
  return {
    drawingsChanged: beforeTools !== JSON.stringify(storage.get("forge.tv.lineTools", null)),
    settingsChanged: beforeSettings !== stableSettings(readUserSettings(storage)) || layoutChanged,
  };
}

async function fetchRemote(creds: ProfileSyncCredentials, meta = false): Promise<RemoteProfile | null> {
  const stamp = meta ? "&meta=1" : "";
  const url = `${apiBase()}/v1/profile?accountKey=${encodeURIComponent(creds.accountKey)}${stamp}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${creds.syncKey}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (res.status === 401 || res.status === 403) return null;
  if (!res.ok) throw new Error(`profile pull failed (${res.status})`);
  const data = (await res.json()) as {
    updatedAt?: number;
    payload?: ProfilePayload | null;
  };
  return {
    updatedAt: Number(data.updatedAt) || 0,
    // meta=1 omits the layout blob. An older server still sends it; keep it so we don't download twice.
    payload: data.payload ?? null,
  };
}

async function pushRemote(
  creds: ProfileSyncCredentials,
  storage: KeyValueStorage,
  updatedAt: number,
): Promise<{ ok: boolean; updatedAt: number; conflict?: RemoteProfile }> {
  const payload = collectProfilePayload(storage);
  const res = await fetch(`${apiBase()}/v1/profile`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${creds.syncKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      accountKey: creds.accountKey,
      updatedAt,
      payload,
    }),
  });
  if (res.status === 409) {
    const data = (await res.json()) as {
      updatedAt?: number;
      payload?: ProfilePayload | null;
    };
    return {
      ok: false,
      updatedAt: Number(data.updatedAt) || 0,
      conflict: {
        updatedAt: Number(data.updatedAt) || 0,
        payload: data.payload ?? null,
      },
    };
  }
  if (!res.ok) throw new Error(`profile push failed (${res.status})`);
  const data = (await res.json()) as { updatedAt?: number };
  return { ok: true, updatedAt: Number(data.updatedAt) || updatedAt };
}

/**
 * On login: pull remote if newer, else push local.
 * Returns whether local storage was replaced (caller should remount chart services).
 */
export async function syncProfileOnLogin(
  storage: KeyValueStorage,
  creds: ProfileSyncCredentials,
): Promise<{ appliedRemote: boolean }> {
  storeSyncCredentials(creds);
  let remote: RemoteProfile | null = null;
  try {
    remote = await fetchRemote(creds);
  } catch {
    // Offline / API down — keep local, still try a later push.
    return { appliedRemote: false };
  }
  if (!remote) return { appliedRemote: false };

  const localAt = readLocalStamp(storage);
  const hasLocalAutosave = Boolean(
    storage.get<unknown>("forge.tv.autosave.v3", undefined) ||
      storage.get<unknown>("forge.tv.charts", undefined),
  );

  if (remote.payload && remote.updatedAt > localAt) {
    const remoteTools = JSON.stringify(remote.payload.keys?.["forge.tv.lineTools"] ?? null);
    holdProfilePersist();
    applyProfilePayload(storage, remote.payload);
    touchLocalStamp(storage, remote.updatedAt);
    // This device had a trendline the other one did not. Publish the union.
    const merged = JSON.stringify(storage.get("forge.tv.lineTools", null));
    if (merged !== remoteTools) {
      try {
        const result = await pushRemote(creds, storage, remote.updatedAt + 1);
        if (result.ok) touchLocalStamp(storage, result.updatedAt);
      } catch {
        /* offline */
      }
    }
    return { appliedRemote: true };
  }

  // Remote empty or older — publish this device if we have anything.
  if (hasLocalAutosave || localAt > 0) {
    const at = Math.max(localAt, Date.now());
    try {
      const result = await pushRemote(creds, storage, at);
      if (result.conflict?.payload) {
        holdProfilePersist();
        applyProfilePayload(storage, result.conflict.payload);
        touchLocalStamp(storage, result.conflict.updatedAt);
        return { appliedRemote: true };
      }
      if (result.ok) touchLocalStamp(storage, result.updatedAt);
    } catch {
      /* ignore offline */
    }
  }
  return { appliedRemote: false };
}

/**
 * Pull the account when another device saved more recently.
 * Does not push, so an open chart does not overwrite the other device's trendline.
 */
export async function pullProfileIfNewer(
  storage: KeyValueStorage,
  creds: ProfileSyncCredentials,
): Promise<ProfilePullResult> {
  const unchanged: ProfilePullResult = { appliedRemote: false, drawingsChanged: false, settingsChanged: false };
  let remote: RemoteProfile | null = null;
  try {
    const head = await fetchRemote(creds, true);
    if (!head || !(head.updatedAt > readLocalStamp(storage))) return unchanged;
    remote = head.payload ? head : await fetchRemote(creds);
  } catch {
    return unchanged;
  }
  if (!remote?.payload || !(remote.updatedAt > readLocalStamp(storage))) {
    return unchanged;
  }
  const beforeTools = JSON.stringify(storage.get("forge.tv.lineTools", null));
  const beforeSettings = stableSettings(readUserSettings(storage));
  const layoutFields = () => {
    const settings = storage.get<Record<string, unknown> | null>("forge.settings.v1", null);
    return JSON.stringify({
      chartLayout: settings?.chartLayout ?? null,
      paneSymbols: settings?.paneSymbols ?? null,
      layoutSync: settings?.layoutSync ?? null,
      current: storage.get("forge.layout.current.v1", null),
    });
  };
  const beforeLayout = layoutFields();
  holdProfilePersist();
  applyProfilePayload(storage, remote.payload);
  touchLocalStamp(storage, remote.updatedAt);
  const drawingsChanged = beforeTools !== JSON.stringify(storage.get("forge.tv.lineTools", null));
  const layoutChanged = beforeLayout !== layoutFields();
  const settingsChanged = beforeSettings !== stableSettings(readUserSettings(storage)) || layoutChanged;
  return { appliedRemote: drawingsChanged || settingsChanged, drawingsChanged, settingsChanged };
}

/** Debounced background push after local chart/settings changes. */
export function createProfileSyncPusher(storage: KeyValueStorage): {
  readonly notifyLocalChange: (delayMs?: number) => void;
  readonly dispose: () => void;
} {
  let timer: number | undefined;
  let disposed = false;
  let flushing = false;
  let queued = false;
  let lastSent = "";

  const flush = () => {
    if (disposed) return;
    if (flushing) {
      queued = true;
      return;
    }
    flushing = true;
    void (async () => {
      try {
        const creds = readSyncCredentials();
        if (!creds) return;
        let remote: RemoteProfile | null = null;
        try {
          const head = await fetchRemote(creds, true);
          const remoteNewer = Boolean(head && head.updatedAt > readLocalStamp(storage));
          if (head?.payload) remote = head;
          else if (remoteNewer) remote = await fetchRemote(creds);
        } catch {
          remote = null;
        }
        // Keep the other device's drawings and the settings this device did not edit.
        const absorbed = absorbRemoteEdits(storage, remote?.payload);
        const payload = collectProfilePayload(storage);
        const packed = JSON.stringify(payload);
        if (packed === lastSent && !remote) return;
        if (absorbed.settingsChanged) {
          holdProfilePersist();
          window.dispatchEvent(new CustomEvent(SETTINGS_UPDATED_EVENT));
        } else if (absorbed.drawingsChanged) {
          window.dispatchEvent(new CustomEvent(DRAWINGS_UPDATED_EVENT));
        }
        const at = Math.max(Date.now(), (remote?.updatedAt ?? 0) + 1);
        const result = await pushRemote(creds, storage, at);
        if (result.conflict?.payload) {
          const before = JSON.stringify(storage.get("forge.tv.lineTools", null));
          const beforeSettings = stableSettings(readUserSettings(storage));
          holdProfilePersist();
          applyProfilePayload(storage, result.conflict.payload);
          const again = await pushRemote(creds, storage, (result.conflict.updatedAt || 0) + 1);
          touchLocalStamp(storage, again.ok ? again.updatedAt : result.conflict.updatedAt);
          const after = JSON.stringify(storage.get("forge.tv.lineTools", null));
          const settingsChanged = beforeSettings !== stableSettings(readUserSettings(storage));
          if (settingsChanged) window.dispatchEvent(new CustomEvent(SETTINGS_UPDATED_EVENT));
          else if (before !== after) window.dispatchEvent(new CustomEvent(DRAWINGS_UPDATED_EVENT));
        } else if (result.ok) {
          touchLocalStamp(storage, result.updatedAt);
          lastSent = packed;
        }
        if (result.conflict) lastSent = JSON.stringify(collectProfilePayload(storage));
      } catch {
        /* offline */
      } finally {
        flushing = false;
        if (queued && !disposed) {
          queued = false;
          notifySoon(400);
        }
      }
    })();
  };

  const notifySoon = (delayMs: number) => {
    if (disposed) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(flush, delayMs);
  };

  return {
    notifyLocalChange(delayMs = 6_000) {
      notifySoon(delayMs);
    },
    dispose() {
      disposed = true;
      window.clearTimeout(timer);
    },
  };
}
