/**
 * Pull / push Radiar (account) chart state across devices.
 */

import type { KeyValueStorage } from "@/application";
import {
  applyProfilePayload,
  collectProfilePayload,
  readLocalStamp,
  touchLocalStamp,
  type ProfilePayload,
} from "./profile-blob";

const SYNC_KEY_SESSION = "forge.profile.syncKey.v1";
const ACCOUNT_KEY_SESSION = "forge.profile.accountKey.v1";

export interface ProfileSyncCredentials {
  readonly accountKey: string;
  readonly syncKey: string;
}

function apiBase(): string {
  // Same-origin when served from forgechart.ir; Vite proxies /api/forge-profile in dev.
  return "/api/forge-profile";
}

export function storeSyncCredentials(creds: ProfileSyncCredentials): void {
  try {
    sessionStorage.setItem(SYNC_KEY_SESSION, creds.syncKey);
    sessionStorage.setItem(ACCOUNT_KEY_SESSION, creds.accountKey);
  } catch {
    /* private mode */
  }
}

export function clearSyncCredentials(): void {
  try {
    sessionStorage.removeItem(SYNC_KEY_SESSION);
    sessionStorage.removeItem(ACCOUNT_KEY_SESSION);
  } catch {
    /* ignore */
  }
}

export function readSyncCredentials(): ProfileSyncCredentials | null {
  try {
    const syncKey = sessionStorage.getItem(SYNC_KEY_SESSION) || "";
    const accountKey = sessionStorage.getItem(ACCOUNT_KEY_SESSION) || "";
    if (syncKey.length === 64 && accountKey.length === 64) {
      return { syncKey, accountKey };
    }
  } catch {
    /* ignore */
  }
  return null;
}

interface RemoteProfile {
  readonly updatedAt: number;
  readonly payload: ProfilePayload | null;
}

async function fetchRemote(creds: ProfileSyncCredentials): Promise<RemoteProfile | null> {
  const url = `${apiBase()}/v1/profile?accountKey=${encodeURIComponent(creds.accountKey)}`;
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
    applyProfilePayload(storage, remote.payload);
    touchLocalStamp(storage, remote.updatedAt);
    return { appliedRemote: true };
  }

  // Remote empty or older — publish this device if we have anything.
  if (hasLocalAutosave || localAt > 0) {
    const at = Math.max(localAt, Date.now());
    try {
      const result = await pushRemote(creds, storage, at);
      if (result.conflict?.payload) {
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

/** Debounced background push after local chart/settings changes. */
export function createProfileSyncPusher(storage: KeyValueStorage): {
  readonly notifyLocalChange: () => void;
  readonly dispose: () => void;
} {
  let timer: number | undefined;
  let disposed = false;

  const flush = () => {
    if (disposed) return;
    const creds = readSyncCredentials();
    if (!creds) return;
    const at = touchLocalStamp(storage);
    void pushRemote(creds, storage, at).then((result) => {
      if (result.conflict?.payload && result.conflict.updatedAt > at) {
        // Remote won — apply quietly; next reload picks it up fully.
        applyProfilePayload(storage, result.conflict.payload);
        touchLocalStamp(storage, result.conflict.updatedAt);
      } else if (result.ok) {
        touchLocalStamp(storage, result.updatedAt);
      }
    }).catch(() => {
      /* offline */
    });
  };

  return {
    notifyLocalChange() {
      if (disposed) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(flush, 2_500);
    },
    dispose() {
      disposed = true;
      window.clearTimeout(timer);
    },
  };
}
