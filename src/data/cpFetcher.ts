import { parseInterval } from "./interval";
import type { Bar, Interval, SymbolInfo } from "../engine/types";

/** Proxied in Vite so the API key stays off the browser bundle. */
export const CP_BASE = "/crypto-api";

export type CpTimeframe = "1m" | "1h" | "1d";

export type CpLatest = {
  symbol: string;
  exchange: string;
  timeframe: string;
  bar_close_time: number;
  price: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  price_change?: number;
  value?: number;
};

export type CpHistoryCandle = {
  id: string;
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type CpHistoryResponse = {
  symbol: string;
  timeframe: string;
  count: number;
  total: number;
  results: CpHistoryCandle[];
};

export type CpPriceRow = CpLatest & { symbol: string };

const SYMBOL_MAP: Record<string, string> = {
  BTCUSD: "BTCUSDT",
  ETHUSD: "ETHUSDT",
  SOLUSD: "SOLUSDT",
  BNBUSDT: "BNBUSDT",
  XRPUSD: "XRPUSDT",
  XAUUSD: "XAUUSD",
  XAGUSD: "XAGUSD",
  EURUSD: "EURUSD",
  GBPUSD: "GBPUSD",
  USDJPY: "USDJPY",
  AUDUSD: "AUDUSD",
  USDCHF: "USDCHF",
  USOIL: "USOIL",
  "GC1!": "XAUUSD",
  "CL1!": "USOIL",
};

const CP_TIMEOUT_MS = 2500;
const HEALTH_TTL_MS = 60_000;

let healthCache: { ok: boolean; at: number } | null = null;

export function toCpSymbol(symbol: SymbolInfo | string): string | null {
  const ticker = typeof symbol === "string" ? symbol : symbol.ticker;
  const upper = ticker.toUpperCase();
  if (SYMBOL_MAP[upper]) return SYMBOL_MAP[upper];
  if (upper.endsWith("USDT") || upper.endsWith("USD")) return upper;
  if (typeof symbol !== "string") {
    if (symbol.type === "crypto") return upper.endsWith("USDT") ? upper : `${upper.replace(/USD$/, "")}USDT`;
    if (symbol.type === "fx" || symbol.type === "metal") return upper;
  }
  return null;
}

export function toCpTimeframe(interval: Interval): CpTimeframe {
  const sec = parseInterval(interval).seconds;
  if (sec <= 45 * 60) return "1m";
  if (sec <= 12 * 3600) return "1h";
  return "1d";
}

export function supportsCpFetcher(symbol: SymbolInfo): boolean {
  return toCpSymbol(symbol) != null;
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), ms);
  try {
    // Note: underlying fetch must accept signal — we pass it via cpFetch.
    void ctrl;
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        window.setTimeout(() => reject(new Error(`${label} timeout ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    window.clearTimeout(timer);
  }
}

async function cpFetch<T>(path: string, timeoutMs = CP_TIMEOUT_MS): Promise<T> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${CP_BASE}${path}`, { signal: ctrl.signal });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`cp_fetcher ${res.status}: ${body.slice(0, 120)}`);
    }
    return (await res.json()) as T;
  } finally {
    window.clearTimeout(timer);
  }
}

export async function cpIsHealthy(force = false): Promise<boolean> {
  const now = Date.now();
  if (!force && healthCache && now - healthCache.at < HEALTH_TTL_MS) return healthCache.ok;
  try {
    const data = await cpFetch<{ status: string; mongo?: boolean }>("/health/", 1500);
    const ok = data.status === "ok" && data.mongo !== false;
    healthCache = { ok, at: now };
    return ok;
  } catch {
    healthCache = { ok: false, at: now };
    return false;
  }
}

export function markCpUnhealthy(): void {
  healthCache = { ok: false, at: Date.now() };
}

export async function cpLatest(symbol: string, timeframe: CpTimeframe): Promise<CpLatest> {
  return cpFetch(`/prices/${encodeURIComponent(symbol)}/?timeframe=${timeframe}`);
}

export async function cpHistory(
  symbol: string,
  timeframe: CpTimeframe,
  limit = 500,
): Promise<CpHistoryResponse> {
  return cpFetch(
    `/prices/${encodeURIComponent(symbol)}/history/?timeframe=${timeframe}&limit=${Math.min(2000, Math.max(1, limit))}`,
  );
}

export async function cpPriceList(opts: {
  timeframe?: CpTimeframe;
  exchange?: "binance" | "forexcom";
  page?: number;
  pageSize?: number;
}): Promise<{ results?: CpPriceRow[]; count?: number } | CpPriceRow[]> {
  const timeframe = opts.timeframe ?? "1m";
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 50;
  const qs = new URLSearchParams({
    timeframe,
    page: String(page),
    page_size: String(pageSize),
  });
  if (opts.exchange) qs.set("exchange", opts.exchange);
  return cpFetch(`/prices/?${qs}`);
}

export function historyToBars(hist: CpHistoryResponse): Bar[] {
  return (hist.results ?? [])
    .map((c) => {
      const time = Math.floor(new Date(c.time).getTime() / 1000);
      return {
        time,
        open: +c.open,
        high: +c.high,
        low: +c.low,
        close: +c.close,
        volume: +c.volume || 0,
      };
    })
    .filter((b) => Number.isFinite(b.time) && Number.isFinite(b.open) && Number.isFinite(b.close))
    .sort((a, b) => a.time - b.time);
}

export function latestToBar(live: CpLatest, intervalSec = 60): Bar {
  const closeTime = +live.bar_close_time;
  const step = Math.max(1, intervalSec);
  const openTime = Number.isFinite(closeTime) ? Math.floor((closeTime - 1) / step) * step : closeTime;
  return {
    time: openTime,
    open: +live.open,
    high: +live.high,
    low: +live.low,
    close: +live.price,
    volume: +live.volume || 0,
  };
}

export { withTimeout };
