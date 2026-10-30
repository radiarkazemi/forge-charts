import type { Bar, Interval, SymbolInfo } from "../engine/types";
import { INTERVAL_SEC } from "./feed";
import { fxcmTickChannel } from "./fxcm";
import { mergeFormingBar, normalizeOhlc } from "./ohlc";

/** Same-origin market-ticks WS (nginx → forge-market-ticks). */
export function marketTicksWsUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/market-ticks`;
}

function tickChannelFor(symbol: SymbolInfo): string | null {
  const t = symbol.ticker.toLowerCase();
  if (symbol.exchange === "BINANCE") return `crypto:${t}`;
  if (symbol.exchange === "FXCM") return fxcmTickChannel(symbol.ticker);
  if (symbol.exchange === "FOREXCOM") return `forex:${t}`;
  return null;
}

/**
 * Live second / sub-minute bars from market-ticks prices.
 * Aggregates ticks into the active TF bucket and merges wicks correctly.
 */
export function subscribeMarketTicksBars(
  symbol: SymbolInfo,
  interval: Interval,
  onBar: (bar: Bar) => void,
): () => void {
  const channel = tickChannelFor(symbol);
  const step = INTERVAL_SEC[interval];
  if (!channel || step <= 0) return () => {};

  let ws: WebSocket | null = null;
  let closed = false;
  let retry = 0;
  let timer = 0;
  let forming: Bar | null = null;

  const pushTick = (price: number, ts: number, volume = 0) => {
    if (!Number.isFinite(price) || !Number.isFinite(ts) || ts <= 0) return;
    const time = Math.floor(ts / step) * step;
    const next = normalizeOhlc({
      time,
      open: forming && forming.time === time ? forming.open : price,
      high: price,
      low: price,
      close: price,
      volume,
    });
    forming = forming && forming.time === time ? mergeFormingBar(forming, next) : next;
    onBar(forming);
  };

  const connect = () => {
    if (closed) return;
    try {
      ws = new WebSocket(marketTicksWsUrl());
    } catch {
      return;
    }
    ws.onopen = () => {
      retry = 0;
      ws?.send(JSON.stringify({ op: "subscribe", channel }));
    };
    ws.onmessage = (ev) => {
      if (closed) return;
      try {
        const msg = JSON.parse(String(ev.data)) as Record<string, unknown>;
        if (String(msg.type) !== "tick") return;
        const price = Number(msg.price);
        const ts = Number(msg.ts);
        const volume = Number(msg.volume) || 0;
        pushTick(price, ts, volume);
      } catch {
        /* ignore */
      }
    };
    ws.onclose = () => {
      if (closed) return;
      const wait = Math.min(10_000, 400 * 2 ** retry++);
      timer = window.setTimeout(connect, wait);
    };
    ws.onerror = () => ws?.close();
  };

  connect();
  return () => {
    closed = true;
    window.clearTimeout(timer);
    try {
      ws?.send(JSON.stringify({ op: "unsubscribe", channel }));
    } catch {
      /* ignore */
    }
    ws?.close();
  };
}

export function isSecondsInterval(interval: Interval): boolean {
  return INTERVAL_SEC[interval] < 60;
}
