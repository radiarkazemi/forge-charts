import type { Interval } from "./engine/types";

export type EmbedChrome = {
  header: boolean;
  toolbar: boolean;
  drawings: boolean;
  widgets: boolean;
  bottom: boolean;
};

export type EmbedDataSource = "market" | "external";

export type EmbedConfig = {
  /** True when `embed=1` (or truthy) — iframe / in-app WebView mode. */
  embed: boolean;
  symbol: string;
  exchange?: string;
  name?: string;
  interval: Interval;
  theme?: "dark" | "light";
  chrome: EmbedChrome;
  /** Force phone-size chrome even on any width (`mobile=1`). */
  mobile: boolean;
  /**
   * `market` = Binance / Forexcom / crypto-chart feeds.
   * `external` = your OHLC via `dataUrl` and/or parent `postMessage` (chart-only).
   */
  source: EmbedDataSource;
  /** JSON endpoint for external OHLC. Supports `{symbol}` / `{interval}` placeholders. */
  dataUrl?: string;
  /** Poll `dataUrl` every N seconds (0 = fetch once). */
  dataRefresh: number;
  pricePrecision?: number;
  /** Restrict inbound postMessage origin (default: any). */
  parentOrigin?: string;
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

function parseSource(raw: string | null, hasDataUrl: boolean): EmbedDataSource {
  const v = (raw || "").trim().toLowerCase();
  if (v === "external" || v === "custom" || v === "own" || v === "data") return "external";
  if (v === "market" || v === "live") return "market";
  return hasDataUrl ? "external" : "market";
}

/**
 * Embed / deep-link URL API for hosting the full chart inside another app
 * (iframe or WebView).
 *
 * Market data:
 *   https://goldanil.ir/charts/?embed=1&symbol=BTCUSDT&exchange=BINANCE&interval=15
 *
 * Your own OHLC (chart only):
 *   https://goldanil.ir/charts/?embed=1&source=external&symbol=MYASSET&dataUrl=https://api.example.com/ohlc.json
 *   — or push bars from the parent app with postMessage (see EMBED.md).
 */
export function parseEmbedConfig(search = typeof window !== "undefined" ? window.location.search : ""): EmbedConfig {
  const params = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
  const embed = parseBool(params.get("embed"), false);
  const symbol = (params.get("symbol") || params.get("ticker") || "XAUUSD").trim().toUpperCase() || "XAUUSD";
  const exchangeRaw = (params.get("exchange") || params.get("ex") || "").trim().toUpperCase();
  const interval = (params.get("interval") || params.get("resolution") || "15").trim() || "15";
  const dataUrlRaw = (params.get("dataUrl") || params.get("data") || params.get("ohlc") || "").trim();
  const refreshRaw = Number(params.get("dataRefresh") || params.get("refresh") || "0");
  const precisionParam = params.get("precision") ?? params.get("pricePrecision");
  const precisionRaw = precisionParam == null || precisionParam === "" ? NaN : Number(precisionParam);
  const name = (params.get("name") || "").trim() || undefined;
  const parentOrigin = (params.get("parentOrigin") || "").trim() || undefined;

  const chrome: EmbedChrome = {
    header: parseBool(params.get("header"), embed ? false : true),
    toolbar: parseBool(params.get("toolbar"), true),
    drawings: parseBool(params.get("drawings") ?? params.get("draw"), embed ? false : true),
    widgets: parseBool(params.get("widgets") ?? params.get("dock"), embed ? false : true),
    bottom: parseBool(params.get("bottom"), embed ? false : true),
  };

  let dataUrl = dataUrlRaw || undefined;
  if (dataUrl && dataUrl.startsWith("/") && typeof window !== "undefined") {
    dataUrl = `${window.location.origin}${dataUrl}`;
  }

  return {
    embed,
    symbol,
    exchange: exchangeRaw || undefined,
    name,
    interval,
    theme: parseTheme(params.get("theme")),
    chrome,
    mobile: parseBool(params.get("mobile"), false),
    source: parseSource(params.get("source"), !!dataUrl),
    dataUrl,
    dataRefresh: Number.isFinite(refreshRaw) && refreshRaw > 0 ? Math.min(3600, refreshRaw) : 0,
    pricePrecision: Number.isFinite(precisionRaw) && precisionRaw >= 0 ? precisionRaw : undefined,
    parentOrigin,
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
    source?: EmbedDataSource;
    dataUrl?: string;
    dataRefresh?: number;
    name?: string;
    precision?: number;
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
  if (opts.source) q.set("source", opts.source);
  if (opts.dataUrl) q.set("dataUrl", opts.dataUrl);
  if (opts.dataRefresh) q.set("dataRefresh", String(opts.dataRefresh));
  if (opts.name) q.set("name", opts.name);
  if (opts.precision != null) q.set("precision", String(opts.precision));
  const path = base.endsWith("/") || base.includes("?") ? base.replace(/\?.*$/, "") : `${base}`;
  return `${path}?${q.toString()}`;
}
