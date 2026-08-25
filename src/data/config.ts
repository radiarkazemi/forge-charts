const STORAGE_KEY = "forge.chartApiUrl";

export const CHART_API_PROXY = "/cp";

export function readStoredChartApiUrl(): string {
  try {
    return localStorage.getItem(STORAGE_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

export function storeChartApiUrl(url: string): void {
  try {
    const trimmed = url.trim().replace(/\/+$/, "");
    if (trimmed) localStorage.setItem(STORAGE_KEY, trimmed);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Browser-facing Chart API origin: explicit URL, env, or the Vite `/cp` proxy. */
export function chartApiBase(): string {
  const stored = typeof window !== "undefined" ? readStoredChartApiUrl() : "";
  const env = (import.meta.env.VITE_CHART_API_URL ?? "").trim().replace(/\/+$/, "");
  return stored || env || CHART_API_PROXY;
}

export function chartApiWsUrl(path = "/ws"): string {
  const base = chartApiBase();
  if (base.startsWith("http://") || base.startsWith("https://")) {
    const u = new URL(path, `${base}/`);
    u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
    return u.toString();
  }
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}${base}${path}`;
}
