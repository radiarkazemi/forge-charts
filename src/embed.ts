import type { Interval } from "./engine/types";

export type EmbedChrome = {
  header: boolean;
  toolbar: boolean;
  drawings: boolean;
  widgets: boolean;
  bottom: boolean;
};

export type EmbedConfig = {
  /** True when `embed=1` (or truthy) — iframe / in-app WebView mode. */
  embed: boolean;
  symbol: string;
  exchange?: string;
  interval: Interval;
  theme?: "dark" | "light";
  chrome: EmbedChrome;
  /** Force phone-size chrome even on wide viewports (`mobile=1`). */
  mobile: boolean;
};

const TRUTHY = new Set(["1", "true", "yes", "on"]);
const FALSY = new Set(["0", "false", "no", "off"]);

function parseBool(raw: string | null, fallback: boolean): boolean {
  if (raw == null || raw === "") return fallback;
  const v = raw.trim().toLowerCase();
  if (TRUTHY.has(v)) return true;
  if (FALSY.has(v)) return false;
  return fallback;
}

function parseTheme(raw: string | null): "dark" | "light" | undefined {
  if (!raw) return undefined;
  const v = raw.trim().toLowerCase();
  if (v === "dark" || v === "light") return v;
  return undefined;
}

/**
 * Embed / deep-link URL API for hosting the full chart inside another app
 * (iframe or WebView).
 *
 * Example:
 *   https://goldanil.ir/charts/?embed=1&symbol=BTCUSDT&exchange=BINANCE&interval=15&theme=dark
 *
 * Chrome flags (defaults apply only when `embed=1`):
 *   header=0|1   product header (default 0)
 *   toolbar=0|1  chart toolbar (default 1)
 *   drawings=0|1 left drawing rail (default 0)
 *   widgets=0|1  right widget dock (default 0)
 *   bottom=0|1   Pine / bottom dock (default 0)
 *   mobile=1     force compact phone layout
 */
export function parseEmbedConfig(search = typeof window !== "undefined" ? window.location.search : ""): EmbedConfig {
  const params = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
  const embed = parseBool(params.get("embed"), false);
  const symbol = (params.get("symbol") || params.get("ticker") || "XAUUSD").trim().toUpperCase() || "XAUUSD";
  const exchangeRaw = (params.get("exchange") || params.get("ex") || "").trim().toUpperCase();
  const interval = (params.get("interval") || params.get("resolution") || "15").trim() || "15";

  const chrome: EmbedChrome = {
    header: parseBool(params.get("header"), embed ? false : true),
    toolbar: parseBool(params.get("toolbar"), true),
    drawings: parseBool(params.get("drawings") ?? params.get("draw"), embed ? false : true),
    widgets: parseBool(params.get("widgets") ?? params.get("dock"), embed ? false : true),
    bottom: parseBool(params.get("bottom"), embed ? false : true),
  };

  return {
    embed,
    symbol,
    exchange: exchangeRaw || undefined,
    interval,
    theme: parseTheme(params.get("theme")),
    chrome,
    mobile: parseBool(params.get("mobile"), false),
  };
}

/** Build a shareable embed URL from the current origin + path. */
export function buildEmbedUrl(
  opts: {
    symbol: string;
    exchange?: string;
    interval: string;
    theme?: "dark" | "light";
    header?: boolean;
    toolbar?: boolean;
    drawings?: boolean;
    widgets?: boolean;
    bottom?: boolean;
    mobile?: boolean;
  },
  base = typeof window !== "undefined" ? `${window.location.origin}${window.location.pathname}` : "/charts/",
): string {
  const q = new URLSearchParams();
  q.set("embed", "1");
  q.set("symbol", opts.symbol);
  if (opts.exchange) q.set("exchange", opts.exchange);
  q.set("interval", opts.interval);
  if (opts.theme) q.set("theme", opts.theme);
  if (opts.header != null) q.set("header", opts.header ? "1" : "0");
  if (opts.toolbar != null) q.set("toolbar", opts.toolbar ? "1" : "0");
  if (opts.drawings != null) q.set("drawings", opts.drawings ? "1" : "0");
  if (opts.widgets != null) q.set("widgets", opts.widgets ? "1" : "0");
  if (opts.bottom != null) q.set("bottom", opts.bottom ? "1" : "0");
  if (opts.mobile) q.set("mobile", "1");
  const path = base.endsWith("/") || base.includes("?") ? base.replace(/\?.*$/, "") : `${base}`;
  return `${path}?${q.toString()}`;
}
