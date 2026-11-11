import type { AuthSession } from "@/features/auth";

const PREFIX = "forge.dev.";

/** Development charts are served under /dev/. Product stays on /charts/. */
export function isDevSite(): boolean {
  try {
    const path = window.location.pathname;
    return path === "/dev" || path.startsWith("/dev/");
  } catch {
    return false;
  }
}

/**
 * Signed-in session for the private development site.
 * It never uses the product account registry.
 */
export const DEV_SESSION: AuthSession = {
  userId: "dev-private",
  username: "dev",
  displayName: "Development",
  token: "dev-private",
  createdAt: 1,
  safetyComplete: true,
};

function prefixStore(raw: Storage): void {
  const getItem = raw.getItem.bind(raw);
  const setItem = raw.setItem.bind(raw);
  const removeItem = raw.removeItem.bind(raw);
  const key = raw.key.bind(raw);
  raw.getItem = (name: string) => getItem(PREFIX + name);
  raw.setItem = (name: string, value: string) => setItem(PREFIX + name, value);
  raw.removeItem = (name: string) => removeItem(PREFIX + name);
  raw.key = (index: number) => {
    let seen = 0;
    for (let i = 0; i < raw.length; i += 1) {
      const found = key(i);
      if (!found?.startsWith(PREFIX)) continue;
      if (seen === index) return found.slice(PREFIX.length);
      seen += 1;
    }
    return null;
  };
  raw.clear = () => {
    const doomed: string[] = [];
    for (let i = 0; i < raw.length; i += 1) {
      const found = key(i);
      if (found?.startsWith(PREFIX)) doomed.push(found);
    }
    for (const found of doomed) removeItem(found);
  };
}

/** Keep development chart data out of the product keys on this browser. */
export function isolateDevStorage(): void {
  if (!isDevSite()) return;
  try {
    prefixStore(window.localStorage);
    prefixStore(window.sessionStorage);
  } catch {
    /* private mode */
  }
}

isolateDevStorage();
