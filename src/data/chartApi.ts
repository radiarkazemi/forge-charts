import type { Bar, Interval, SymbolInfo } from "../engine/types";
import { parseInterval } from "./interval";
import { toCpSymbol } from "./cpFetcher";

type HistoryTf = { tf: "1m" | "1h" | "1d"; group: number };

function historyTf(interval: Interval): HistoryTf {
  const sec = parseInterval(interval).seconds;
  if (sec <= 60) return { tf: "1m", group: 1 };
  if (sec <= 300) return { tf: "1m", group: Math.max(1, Math.round(sec / 60)) };
  if (sec <= 1800) return { tf: "1m", group: Math.max(1, Math.round(sec / 60)) };
  if (sec <= 3600) return { tf: "1h", group: 1 };
  if (sec <= 14400) return { tf: "1h", group: Math.max(1, Math.round(sec / 3600)) };
  if (sec <= 86400) return { tf: "1d", group: 1 };
  if (sec <= 604800) return { tf: "1d", group: 7 };
  return { tf: "1d", group: 30 };
}

function compactToBars(rows: unknown[]): Bar[] {
  const bars: Bar[] = [];
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 5) continue;
    const time = Number(row[0]);
    const open = Number(row[1]);
    const high = Number(row[2]);
    const low = Number(row[3]);
    const close = Number(row[4]);
    const volume = Number(row[5]) || 0;
    if (!Number.isFinite(time) || !Number.isFinite(open) || !Number.isFinite(close)) continue;
    bars.push({
      time: time > 1e12 ? Math.floor(time / 1000) : time,
      open,
      high: Number.isFinite(high) ? high : Math.max(open, close),
      low: Number.isFinite(low) ? low : Math.min(open, close),
      close,
      volume,
    });
  }
  return bars;
}

export function isForexcomSymbol(symbol: SymbolInfo): boolean {
  if (symbol.exchange.toUpperCase() === "FOREXCOM") return true;
  return symbol.type === "fx" || symbol.type === "metal";
}

export async function fetchChartApiHistory(symbol: SymbolInfo, interval: Interval): Promise<Bar[]> {
  const { tf, group } = historyTf(interval);
  const ticker = (toCpSymbol(symbol) || symbol.ticker).toLowerCase();
  const url = `/crypto-chart/history?symbol=${encodeURIComponent(ticker)}&timeframe=${tf}&limit=400&group=${group}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`forexcom ${res.status}`);
  const json = (await res.json()) as { bars?: unknown[] };
  const bars = compactToBars(json.bars ?? []);
  if (!bars.length) throw new Error("forexcom empty");
  return bars;
}

export async function fetchChartApiQuotes(): Promise<Record<string, { price: number; change: number }>> {
  const out: Record<string, { price: number; change: number }> = {};
  const res = await fetch("/crypto-api/prices/?timeframe=1m&exchange=forexcom&page_size=80");
  if (!res.ok) return out;
  const json = (await res.json()) as { results?: Array<{ symbol?: string; price?: number; price_change?: number }> };
  for (const row of json.results ?? []) {
    const ticker = String(row.symbol || "").toUpperCase();
    const price = Number(row.price);
    if (!ticker || !Number.isFinite(price)) continue;
    out[ticker] = { price, change: Number(row.price_change) || 0 };
  }
  return out;
}

export function subscribeChartApi(
  symbol: SymbolInfo,
  interval: Interval,
  onBar: (bar: Bar) => void,
): () => void {
  const { tf } = historyTf(interval);
  const ticker = (toCpSymbol(symbol) || symbol.ticker).toLowerCase();
  let ws: WebSocket | null = null;
  let closed = false;
  let poll = 0;

  const pull = async () => {
    try {
      const res = await fetch(`/crypto-api/prices/${encodeURIComponent(ticker)}/?timeframe=${tf}`);
      if (!res.ok) return;
      const json = (await res.json()) as {
        bar_close_time?: number;
        price?: number;
        open?: number;
        high?: number;
        low?: number;
        volume?: number;
      };
      const time = Number(json.bar_close_time);
      const close = Number(json.price);
      if (!Number.isFinite(time) || !Number.isFinite(close)) return;
      const open = Number(json.open);
      onBar({
        time,
        open: Number.isFinite(open) ? open : close,
        high: Number(json.high) || Math.max(open || close, close),
        low: Number(json.low) || Math.min(open || close, close),
        close,
        volume: Number(json.volume) || 0,
      });
    } catch {
      /* ignore */
    }
  };

  try {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    ws = new WebSocket(`${proto}//${window.location.host}/crypto-ws`);
    ws.onopen = () => {
      ws?.send(JSON.stringify({ op: "subscribe", exchange: "FOREXCOM", symbol: symbol.ticker, interval: tf }));
    };
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(String(ev.data)) as Record<string, unknown>;
        const src = (data.bar && typeof data.bar === "object" ? data.bar : data) as Record<string, unknown>;
        const time = Number(src.t ?? src.time);
        const close = Number(src.c ?? src.close ?? src.price);
        if (!Number.isFinite(time) || !Number.isFinite(close)) return;
        const open = Number(src.o ?? src.open);
        onBar({
          time: time > 1e12 ? Math.floor(time / 1000) : time,
          open: Number.isFinite(open) ? open : close,
          high: Number(src.h ?? src.high) || Math.max(open || close, close),
          low: Number(src.l ?? src.low) || Math.min(open || close, close),
          close,
          volume: Number(src.v ?? src.volume) || 0,
        });
      } catch {
        /* ignore */
      }
    };
  } catch {
    /* poll only */
  }
  void pull();
  poll = window.setInterval(() => void pull(), 2000);

  return () => {
    closed = true;
    window.clearInterval(poll);
    try {
      if (!closed) ws?.send(JSON.stringify({ op: "unsubscribe" }));
    } catch {
      /* */
    }
    ws?.close();
  };
}
