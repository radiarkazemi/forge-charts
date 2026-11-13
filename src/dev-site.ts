const PREFIX = "forge.dev.";

/**
 * Development charts. `/dev/` stays behind the server password.
 * `/team/` is the same build with the normal login form, so teammates
 * can open it without that password dialog.
 */
export function isDevSite(): boolean {
  try {
    const path = window.location.pathname;
    return (
      path === "/dev"
      || path.startsWith("/dev/")
      || path === "/team"
      || path.startsWith("/team/")
    );
  } catch {
    return false;
  }
}

/** Same accounts and safety answers as the product login. Chart keys stay on the dev prefix. */
function sharesWithProduct(name: string): boolean {
  return name === "forge.auth.users.v1" || name.endsWith(".forge.auth.safetyProfile.v1");
}

function prefixStore(raw: Storage): void {
  const getItem = raw.getItem.bind(raw);
  const setItem = raw.setItem.bind(raw);
  const removeItem = raw.removeItem.bind(raw);
  const key = raw.key.bind(raw);
  const storedName = (name: string) => (sharesWithProduct(name) ? name : PREFIX + name);
  raw.getItem = (name: string) => getItem(storedName(name));
  raw.setItem = (name: string, value: string) => setItem(storedName(name), value);
  raw.removeItem = (name: string) => removeItem(storedName(name));
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
