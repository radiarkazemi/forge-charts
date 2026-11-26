import { afterEach, describe, expect, it, vi } from "vitest";

function install(hostname: string, pathname: string): Map<string, string> {
  const store = new Map<string, string>();
  const makeStorage = (bucket: Map<string, string>) => ({
    get length() {
      return bucket.size;
    },
    getItem: (key: string) => (bucket.has(key) ? bucket.get(key)! : null),
    setItem: (key: string, value: string) => {
      bucket.set(key, value);
    },
    removeItem: (key: string) => {
      bucket.delete(key);
    },
    key: (index: number) => [...bucket.keys()][index] ?? null,
    clear: () => {
      bucket.clear();
    },
  });
  vi.stubGlobal("window", {
    location: { hostname, pathname, search: "", hash: "" },
    localStorage: makeStorage(store),
    sessionStorage: makeStorage(new Map<string, string>()),
  });
  return store;
}

describe("dev subdomain", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("treats dev.forgechart.ir as the dev site even at the root", async () => {
    install("dev.forgechart.ir", "/");
    const site = await import("../src/dev-site");
    expect(site.isDevSite()).toBe(true);
    expect(site.devRoot()).toBe("/dev");
  });

  it("keeps chart keys off the product names on the dev subdomain", async () => {
    const store = install("dev.forgechart.ir", "/dev/");
    await import("../src/dev-site");
    window.localStorage.setItem("forge.settings.v1", "layout");
    window.localStorage.setItem("forge.auth.users.v1", "accounts");
    expect(store.get("forge.dev.forge.settings.v1")).toBe("layout");
    expect(store.get("forge.auth.users.v1")).toBe("accounts");
  });

  it("does not mark the product charts host as the dev site", async () => {
    const store = install("forgechart.ir", "/charts/");
    const site = await import("../src/dev-site");
    expect(site.isDevSite()).toBe(false);
    window.localStorage.setItem("forge.settings.v1", "product");
    expect(store.get("forge.settings.v1")).toBe("product");
    expect(store.has("forge.dev.forge.settings.v1")).toBe(false);
  });

  it("keeps www separate from the dev subdomain", async () => {
    install("www.forgechart.ir", "/");
    const site = await import("../src/dev-site");
    expect(site.isDevSite()).toBe(false);
    expect(site.devRoot()).toBe("/team");
  });
});
