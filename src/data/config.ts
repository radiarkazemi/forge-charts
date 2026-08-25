const STORAGE_KEY = "forge.chartApiUrl";

/** Same-origin cp_fetcher REST (nginx injects X-API-Key). */
export const CHART_API_PROXY = "/crypto-api";
/** Same-origin cp_fetcher realtime WebSocket. */
export const CHART_WS_PROXY = "/crypto-ws";

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

export function chartApiBase(): string {
  const stored = typeof window !== "undefined" ? readStoredChartApiUrl() : "";
  const env = (import.meta.env.VITE_CHART_API_URL ?? "").trim().replace(/\/+$/, "");
  return stored || env || CHART_API_PROXY;
}

export function chartApiWsUrl(): string {
  const base = chartApiBase();
  if (base.startsWith("http://") || base.startsWith("https://")) {
    const u = new URL(base);
    u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
    u.pathname = "/crypto-ws";
    u.search = "";
    u.hash = "";
    return u.toString().replace(/\/$/, "");
  }
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}${CHART_WS_PROXY}`;
}
