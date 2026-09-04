import type { Bar, Interval, SymbolInfo } from "../engine/types";

export const FORGE_MSG_SOURCE = "forge-charts";

export type ExternalSymbolInput = {
  ticker: string;
  name?: string;
  exchange?: string;
  type?: SymbolInfo["type"];
  pricePrecision?: number;
};

export type ExternalDataPayload = {
  bars: Bar[];
  symbol?: ExternalSymbolInput | string;
  interval?: Interval;
  live?: boolean;
};

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function parseTime(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw > 1e12 ? Math.floor(raw / 1000) : raw;
  if (typeof raw === "string" && raw) {
    const asNum = Number(raw);
    if (Number.isFinite(asNum) && asNum > 0) return asNum > 1e12 ? Math.floor(asNum / 1000) : asNum;
    const ms = Date.parse(raw.endsWith("Z") || /[+-]\d{2}:?\d{2}$/.test(raw) ? raw : `${raw}Z`);
    if (Number.isFinite(ms)) return Math.floor(ms / 1000);
  }
  return NaN;
}

/** Accept object bars, compact tuples `[t,o,h,l,c,v?]`, or TradingView-ish keys. */
export function normalizeBars(input: unknown): Bar[] {
  if (!input) return [];
  const rows = Array.isArray(input)
    ? input
    : typeof input === "object" && Array.isArray((input as { bars?: unknown }).bars)
      ? ((input as { bars: unknown[] }).bars)
      : typeof input === "object" && Array.isArray((input as { data?: unknown }).data)
        ? ((input as { data: unknown[] }).data)
        : typeof input === "object" && Array.isArray((input as { candles?: unknown }).candles)
          ? ((input as { candles: unknown[] }).candles)
          : [];

  const bars: Bar[] = [];
  for (const row of rows) {
    if (Array.isArray(row) && row.length >= 5) {
      const time = parseTime(row[0]);
      const open = num(row[1]);
      const high = num(row[2]);
      const low = num(row[3]);
      const close = num(row[4]);
      const volume = num(row[5]) || 0;
      if (!Number.isFinite(time) || !Number.isFinite(open) || !Number.isFinite(close)) continue;
      bars.push({
        time,
        open,
        high: Number.isFinite(high) ? high : Math.max(open, close),
        low: Number.isFinite(low) ? low : Math.min(open, close),
        close,
        volume,
      });
      continue;
    }
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const time = parseTime(r.time ?? r.t ?? r.timestamp ?? r.date ?? r.id);
    const open = num(r.open ?? r.o);
    const close = num(r.close ?? r.c ?? r.price);
    if (!Number.isFinite(time) || !Number.isFinite(open) || !Number.isFinite(close)) continue;
    const high = num(r.high ?? r.h);
    const low = num(r.low ?? r.l);
    bars.push({
      time,
      open,
      high: Number.isFinite(high) ? high : Math.max(open, close),
      low: Number.isFinite(low) ? low : Math.min(open, close),
      close,
      volume: num(r.volume ?? r.v ?? r.vol) || 0,
    });
  }
  return bars.sort((a, b) => a.time - b.time);
}

export function makeExternalSymbol(input: ExternalSymbolInput | string, fallbackTicker = "CUSTOM"): SymbolInfo {
  if (typeof input === "string") {
    const ticker = input.trim().toUpperCase() || fallbackTicker;
    return {
      ticker,
      name: ticker,
      exchange: "CUSTOM",
      type: "crypto",
      pricePrecision: 4,
    };
  }
  const ticker = (input.ticker || fallbackTicker).trim().toUpperCase() || fallbackTicker;
  const precision = input.pricePrecision;
  return {
    ticker,
    name: (input.name || ticker).trim() || ticker,
    exchange: (input.exchange || "CUSTOM").trim().toUpperCase() || "CUSTOM",
    type: input.type || "crypto",
    pricePrecision: typeof precision === "number" && Number.isFinite(precision) ? precision : 4,
  };
}

export function resolveDataUrl(template: string, symbol: string, interval: string): string {
  return template
    .replaceAll("{symbol}", encodeURIComponent(symbol))
    .replaceAll("{SYMBOL}", encodeURIComponent(symbol))
    .replaceAll("{interval}", encodeURIComponent(interval))
    .replaceAll("{INTERVAL}", encodeURIComponent(interval));
}

export async function fetchExternalBars(url: string, timeoutMs = 12000): Promise<ExternalDataPayload> {
  const ctrl = new AbortController();
  const t = window.setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, credentials: "omit" });
    if (!res.ok) throw new Error(`dataUrl ${res.status}`);
    const json = (await res.json()) as unknown;
    const bars = normalizeBars(json);
    let symbol: ExternalSymbolInput | string | undefined;
    let interval: Interval | undefined;
    let live: boolean | undefined;
    if (json && typeof json === "object" && !Array.isArray(json)) {
      const obj = json as Record<string, unknown>;
      if (typeof obj.symbol === "string" || (obj.symbol && typeof obj.symbol === "object")) {
        symbol = obj.symbol as ExternalSymbolInput | string;
      } else if (typeof obj.ticker === "string") {
        symbol = obj.ticker;
      }
      if (typeof obj.interval === "string") interval = obj.interval;
      if (typeof obj.live === "boolean") live = obj.live;
    }
    return { bars, symbol, interval, live };
  } finally {
    window.clearTimeout(t);
  }
}

export type ForgeInboundMessage =
  | { type: "setData"; bars?: unknown; data?: unknown; symbol?: ExternalSymbolInput | string; interval?: Interval; live?: boolean }
  | { type: "setBars"; bars: unknown }
  | { type: "upsertBar"; bar: unknown }
  | { type: "setSymbol"; symbol: ExternalSymbolInput | string }
  | { type: "setInterval"; interval: Interval }
  | { type: "setTheme"; theme: "dark" | "light" }
  | { type: "ping" };

export function parseInboundMessage(data: unknown): ForgeInboundMessage | null {
  if (!data || typeof data !== "object") return null;
  const msg = data as Record<string, unknown>;
  if (msg.source != null && msg.source !== FORGE_MSG_SOURCE) return null;
  const type = String(msg.type ?? "");
  if (!type) return null;
  return msg as unknown as ForgeInboundMessage;
}

export function postToParent(payload: Record<string, unknown>, targetOrigin = "*"): void {
  if (typeof window === "undefined" || window.parent === window) return;
  try {
    window.parent.postMessage({ source: FORGE_MSG_SOURCE, ...payload }, targetOrigin);
  } catch {
    /* ignore */
  }
}
