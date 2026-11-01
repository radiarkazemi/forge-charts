import {
  intervalSeconds,
  parseInterval,
  isMarketSessionOpen,
  type Bar,
  type BarRange,
  type Interval,
  type Quote,
  type SymbolInfo,
} from "@/domain";
import type { MarketDataProvider, Unsubscribe } from "@/application";
import { buildUrl, fetchJson } from "../http/fetch-json";
import { targetHistoryDepth } from "./cp-chart-history";

/**
 * Iran domestic gold from Faraz (native symbols):
 *   آبشده نقدی 1 (abshodeNaghdi), گرم ۱۸ (geramTalaHejdah), طلای ۲۴ (tala24Estjt),
 *   سکه امامی / نیم / ربع, انس
 *
 * History: VPS `/iran-gold/history`
 *   - Faraz customer `/trading-view/history` (max countback) when session set
 *   - Public chart-history fallback for 1D / 1W / 1M
 *   - Mongo `anil_gold.faraz_ohlc` + `tick_1s` + `ohlc_1m/1h/1d` (bootstrap + realtime append)
 * Realtime: VPS `/market-ticks` `iran:*` — Faraz live ticks appended onto saved history
 */

const HISTORY_BASE = "/iran-gold/history";
const QUOTE_BASE = "/iran-gold/quote";
const REQUEST_TIMEOUT_MS = 45_000;

export const IRAN_NATIVE_INTERVALS: readonly Interval[] = [
  "1S",
  "5S",
  "10S",
  "15S",
  "30S",
  "45S",
  "1",
  "2",
  "3",
  "5",
  "10",
  "15",
  "30",
  "45",
  "60",
  "120",
  "240",
  "1D",
  "1W",
  "1M",
];

type IranRoute = {
  ticker: string;
  channel: string;
  field: string;
};

const ROUTES: Readonly<Record<string, IranRoute>> = {
  ABSHODE: { ticker: "ABSHODE", channel: "iran:abshode", field: "mesghal_17" },
  MESGHAL17: { ticker: "MESGHAL17", channel: "iran:abshode", field: "mesghal_17" },
  G18: { ticker: "G18", channel: "iran:g18", field: "price_18k_per_gram" },
  G24: { ticker: "G24", channel: "iran:g24", field: "price_24k_per_gram" },
  SEKKE: { ticker: "SEKKE", channel: "iran:sekke", field: "coin_emami" },
  SEKKE_EMAMI: { ticker: "SEKKE_EMAMI", channel: "iran:sekke", field: "coin_emami" },
  NIM: { ticker: "NIM", channel: "iran:nim", field: "coin_half" },
  ROB: { ticker: "ROB", channel: "iran:rob", field: "coin_quarter" },
  ONS: { ticker: "ONS", channel: "iran:ons", field: "ounce_usd" },
};

function routeFor(symbol: SymbolInfo): IranRoute | null {
  const ex = symbol.exchange.toUpperCase();
  if (ex && ex !== "IRAN" && ex !== "TGJU" && ex !== "FARAZ") return null;
  return ROUTES[symbol.ticker.toUpperCase()] ?? null;
}

/** Asia/Tehran UTC+03:30 — Faraz 1h/4h bars use this session grid, not UTC. */
const IRAN_TZ_OFFSET_SEC = 3 * 3600 + 1800;

function alignTime(tsSec: number, step: number): number {
  if (!Number.isFinite(tsSec) || !Number.isFinite(step) || step <= 0) {
    return Number.isFinite(tsSec) ? Math.floor(tsSec) : Math.floor(Date.now() / 1000);
  }
  const ts = Math.floor(tsSec);
  const s = Math.floor(step);
  // Hour+ intraday: keep Faraz/Tehran bucket starts (…:30 UTC).
  if (s >= 3600 && s < 86_400) {
    const shifted = ts + IRAN_TZ_OFFSET_SEC;
    return shifted - (shifted % s) - IRAN_TZ_OFFSET_SEC;
  }
  return ts - (ts % s);
}

/** Faraz cash session 09:00–22:00 Tehran (end exclusive). */
function iranInCashSession(tsSec: number): boolean {
  const shifted = Math.floor(tsSec) + IRAN_TZ_OFFSET_SEC;
  const daySec = ((shifted % 86_400) + 86_400) % 86_400;
  const hhmm = Math.floor(daySec / 3600) * 100 + Math.floor((daySec % 3600) / 60);
  return hhmm >= 900 && hhmm < 2200;
}

function mergeBarPreferRange(prev: Bar | undefined, next: Bar): Bar {
  if (!prev) return next;
  const prevRange = prev.high - prev.low;
  const nextRange = next.high - next.low;
  if (nextRange > prevRange || (nextRange === prevRange && (next.volume || 0) >= (prev.volume || 0))) {
    return {
      time: next.time,
      open: prev.open,
      high: Math.max(prev.high, next.high),
      low: Math.min(prev.low, next.low),
      close: next.close,
      volume: (prev.volume || 0) + (next.volume || 0),
    };
  }
  return {
    time: prev.time,
    open: prev.open,
    high: Math.max(prev.high, next.high),
    low: Math.min(prev.low, next.low),
    close: prev.close,
    volume: (prev.volume || 0) + (next.volume || 0),
  };
}

/** Count in-session parent holes larger than 1.5× step (fractal 1H charts). */
function countSessionHoles(bars: readonly Bar[], step: number): number {
  if (bars.length < 2 || step < 3600) return 0;
  let holes = 0;
  for (let i = 1; i < bars.length; i += 1) {
    const prev = bars[i - 1]!.time;
    const cur = bars[i]!.time;
    if (cur - prev <= step * 1.5) continue;
    let missing = 0;
    for (let t = prev + step; t < cur; t += step) {
      if (iranInCashSession(t)) missing += 1;
    }
    if (missing > 0) holes += 1;
  }
  return holes;
}

/** Aggregate 1m bars into hour+ buckets and fill missing cash-session parents. */
function densifyHourBarsFromMinutes(
  parents: readonly Bar[],
  minutes: readonly Bar[],
  step: number,
): Bar[] {
  if (step < 3600 || step >= 86_400 || minutes.length === 0) return [...parents];
  const byTime = new Map<number, Bar>();
  for (const b of parents) {
    if (!iranInCashSession(b.time) && step >= 3600) continue;
    byTime.set(b.time, b);
  }
  const fromM1 = new Map<number, Bar>();
  for (const m of minutes) {
    if (!iranInCashSession(m.time)) continue;
    const t0 = alignTime(m.time, step);
    if (!iranInCashSession(t0)) continue;
    const next: Bar = {
      time: t0,
      open: m.open,
      high: m.high,
      low: m.low,
      close: m.close,
      volume: m.volume || 0,
    };
    const prev = fromM1.get(t0);
    if (!prev) {
      fromM1.set(t0, next);
      continue;
    }
    fromM1.set(t0, {
      time: t0,
      open: prev.open,
      high: Math.max(prev.high, next.high),
      low: Math.min(prev.low, next.low),
      close: next.close,
      volume: (prev.volume || 0) + (next.volume || 0),
    });
  }
  for (const [t, bar] of fromM1) {
    const existing = byTime.get(t);
    if (!existing) {
      byTime.set(t, bar);
      continue;
    }
    // Prefer the bar with more range / volume when both exist.
    byTime.set(t, mergeBarPreferRange(existing, bar));
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

/**
 * Carry-forward short in-session holes (≤ maxGapSteps) so 1H is continuous
 * like Faraz. Overnight (22→09) stays empty for SESSION_IRAN_GOLD collapse.
 */
function fillIranSessionGaps(bars: readonly Bar[], step: number, maxGapSteps = 8): Bar[] {
  if (bars.length < 2 || step < 3600 || step >= 86_400) return [...bars];
  const out: Bar[] = [];
  for (let i = 0; i < bars.length; i += 1) {
    const cur = bars[i]!;
    if (out.length === 0) {
      out.push(cur);
      continue;
    }
    const prev = out[out.length - 1]!;
    if (cur.time - prev.time > step) {
      let missing = 0;
      for (let t = prev.time + step; t < cur.time; t += step) {
        if (iranInCashSession(t)) missing += 1;
      }
      if (missing > 0 && missing <= maxGapSteps) {
        const px = prev.close;
        for (let t = prev.time + step; t < cur.time; t += step) {
          if (!iranInCashSession(t)) continue;
          out.push({ time: t, open: px, high: px, low: px, close: px, volume: 0 });
        }
      }
    }
    out.push(cur);
  }
  return out;
}

function iranTehranDayStart(tsSec: number): number {
  const shifted = Math.floor(tsSec) + IRAN_TZ_OFFSET_SEC;
  const day0 = shifted - (((shifted % 86_400) + 86_400) % 86_400);
  return day0 - IRAN_TZ_OFFSET_SEC;
}

function ohlcPathPoints(o: number, h: number, l: number, c: number, n: number): number[] {
  const count = Math.max(2, Math.floor(n));
  const anchors = [o, h, l, c];
  const seg = [Math.floor(count / 3), Math.floor(count / 3), 0];
  seg[2] = count - seg[0]! - seg[1]!;
  if (seg[2]! < 1) {
    seg[2] = 1;
    if (seg[0]! > 1) seg[0]! -= 1;
  }
  const pts: number[] = [];
  for (let i = 0; i < 3; i += 1) {
    const a = anchors[i]!;
    const b = anchors[i + 1]!;
    const length = seg[i]!;
    for (let k = 0; k < length; k += 1) {
      const frac = i < 2 ? k / Math.max(1, length) : length > 1 ? k / (length - 1) : 1;
      pts.push(a + (b - a) * frac);
    }
  }
  pts[0] = o;
  pts[pts.length - 1] = c;
  return pts.slice(0, count);
}

/** Expand Faraz daily OHLC into cash-session hour bars (fills multi-day holes). */
function densifyHourBarsFromDaily(
  parents: readonly Bar[],
  dailies: readonly Bar[],
  step: number,
): Bar[] {
  if (step < 3600 || step >= 86_400 || dailies.length === 0) return [...parents];
  const byTime = new Map<number, Bar>();
  for (const b of parents) {
    if (iranInCashSession(b.time)) byTime.set(b.time, b);
  }
  const missingDays = new Set<number>();
  const times = [...byTime.keys()].sort((a, b) => a - b);
  for (let i = 1; i < times.length; i += 1) {
    const prev = times[i - 1]!;
    const cur = times[i]!;
    if (cur - prev <= step * 1.5) continue;
    for (let t = prev + step; t < cur; t += step) {
      if (iranInCashSession(t)) missingDays.add(iranTehranDayStart(t));
    }
  }
  // Also cover leading/trailing scarcity inside the parent span.
  if (times.length >= 2) {
    for (let t = times[0]!; t <= times[times.length - 1]!; t += step) {
      if (!byTime.has(t) && iranInCashSession(t)) missingDays.add(iranTehranDayStart(t));
    }
  }
  if (missingDays.size === 0) return [...byTime.values()].sort((a, b) => a.time - b.time);

  for (const day of dailies) {
    const dayStart = iranTehranDayStart(day.time + 12 * 3600);
    if (!missingDays.has(dayStart)) continue;
    const session: number[] = [];
    for (let t = alignTime(dayStart + 9 * 3600, step); t < dayStart + 22 * 3600; t += step) {
      if (iranInCashSession(t)) session.push(t);
    }
    if (session.length === 0) continue;
    const path = ohlcPathPoints(day.open, day.high, day.low, day.close, session.length + 1);
    for (let i = 0; i < session.length; i += 1) {
      const t0 = session[i]!;
      if (byTime.has(t0)) continue;
      const px0 = path[i]!;
      const px1 = path[i + 1]!;
      let hi = Math.max(px0, px1);
      let lo = Math.min(px0, px1);
      hi = Math.min(Math.max(hi, day.open, day.close), day.high);
      lo = Math.max(Math.min(lo, day.open, day.close), day.low);
      byTime.set(t0, {
        time: t0,
        open: toman(px0),
        high: toman(hi),
        low: toman(lo),
        close: toman(px1),
        volume: (day.volume || 0) / session.length,
      });
    }
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

function applyTick(current: Bar | null, price: number, tsSec: number, step: number): Bar {
  const wallBucket = alignTime(Math.floor(Date.now() / 1000), step);
  let t = alignTime(tsSec, step);
  if (t > wallBucket) t = wallBucket;
  if (!current || current.time < t) {
    return { time: t, open: price, high: price, low: price, close: price, volume: 1 };
  }
  if (current.time > t) return current;
  return {
    time: t,
    open: current.open,
    high: Math.max(current.high, price),
    low: Math.min(current.low, price),
    close: price,
    volume: current.volume + 1,
  };
}

function parsePackedBar(row: unknown): Bar | null {
  if (!Array.isArray(row) || row.length < 5) return null;
  const nums = row.map(Number);
  let time = nums[0]!;
  if (time > 1e12) time = Math.floor(time / 1000);
  const open = nums[1]!;
  const high = nums[2]!;
  const low = nums[3]!;
  const close = nums[4]!;
  const volume = nums[5] ?? 0;
  if (![time, open, high, low, close].every(Number.isFinite)) return null;
  return { time, open, high, low, close, volume: Number.isFinite(volume) ? volume : 0 };
}

/** Iran gold is whole toman — strip fractional clamp artifacts from older servers. */
function toman(px: number): number {
  if (!Number.isFinite(px) || px <= 0) return px;
  return px >= 1_000 ? Math.round(px) : px;
}

/**
 * Trust server OHLC. Only drop non-positive prints and round toman; do not
 * invent gapfill or crush real Faraz wicks on the client.
 */
function sanitizeIranBars(bars: readonly Bar[]): Bar[] {
  if (bars.length === 0) return [];
  return bars
    .filter((b) => b.close > 0 && b.open > 0)
    .map((b) => {
      const open = toman(b.open);
      const close = toman(b.close);
      const high = Math.max(open, close, toman(b.high));
      const low = Math.min(open, close, toman(b.low));
      return { ...b, open, high, low, close };
    });
}

interface HistoryResponse {
  bars?: unknown[];
  detail?: string;
  count?: number;
  source?: string;
}

interface QuoteResponse {
  source?: string;
  ts?: number;
  prices?: Record<string, number>;
  channels?: Record<string, number>;
}

function openMarketTicksSocket(
  channel: string,
  onTick: (price: number, tsSec: number) => void,
): Unsubscribe {
  let closed = false;
  let socket: WebSocket | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const connect = () => {
    if (closed || typeof window === "undefined") return;
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${proto}//${window.location.host}/market-ticks`;
    try {
      socket = new WebSocket(url);
    } catch {
      return;
    }
    socket.onopen = () => {
      socket?.send(JSON.stringify({ op: "subscribe", channel }));
    };
    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(String(event.data)) as Record<string, unknown>;
        if (String(msg.type ?? "") !== "tick") return;
        if (msg.channel != null && String(msg.channel) !== channel) return;
        const price = Number(msg.price);
        if (!Number.isFinite(price) || price <= 0) return;
        const ts = msg.ts ? Number(msg.ts) : Math.floor(Date.now() / 1000);
        onTick(price, ts);
      } catch {
        /* ignore */
      }
    };
    socket.onclose = () => {
      socket = null;
      if (!closed) {
        retryTimer = setTimeout(() => {
          retryTimer = null;
          connect();
        }, 600);
      }
    };
  };

  connect();
  return () => {
    closed = true;
    if (retryTimer) clearTimeout(retryTimer);
    try {
      socket?.close();
    } catch {
      /* ignore */
    }
  };
}

export class IranGoldProvider implements MarketDataProvider {
  readonly id = "iran-gold";
  readonly isSynthetic = false;

  supports(symbol: SymbolInfo, interval: Interval): boolean {
    if (routeFor(symbol) === null) return false;
    const { unit, count } = parseInterval(interval);
    if (unit === "seconds") return count >= 1 && count <= 45;
    if (unit === "minutes") return count >= 1 && count <= 720;
    if (unit === "days" || unit === "weeks" || unit === "months") return count >= 1;
    return false;
  }

  nativeIntervals(_symbol?: SymbolInfo): readonly Interval[] {
    return IRAN_NATIVE_INTERVALS;
  }

  async fetchBars(symbol: SymbolInfo, interval: Interval, range: BarRange): Promise<Bar[]> {
    const route = routeFor(symbol);
    if (!route) throw new Error(`iran-gold: unsupported ${symbol.ticker}`);
    const step = intervalSeconds(interval);
    // Same depth targets as cp_fetcher chart history (1m=20k, 5m=10k, else 5k).
    const target = targetHistoryDepth(interval);
    const limit = Math.min(target, Math.max(range.countBack + 100, 2_000));
    const json = await fetchJson<HistoryResponse>(
      buildUrl(HISTORY_BASE, {
        symbol: route.ticker,
        interval,
        limit,
        before: range.to > 0 ? range.to : undefined,
      }),
      { timeoutMs: REQUEST_TIMEOUT_MS },
    );
    if (json.detail) throw new Error(json.detail);
    const before = range.to > 0 ? range.to : Number.POSITIVE_INFINITY;
    const bars = (json.bars ?? [])
      .map(parsePackedBar)
      .filter((b): b is Bar => b !== null)
      .filter((b) => b.time < before)
      .sort((a, b) => a.time - b.time);
    if (!bars.length) return [];
    // Prefer the bar with real range when two stamps collapse onto one bucket —
    // never let a flat overwrite a ranged candle (killed 15S scroll-back).
    const byTime = new Map<number, Bar>();
    for (const b of bars) {
      const t = alignTime(b.time, step);
      // Drop pre/post cash-session hour stamps (07:00/08:00 flats looked fractal).
      if (step >= 3600 && step < 86_400 && !iranInCashSession(t)) continue;
      const next = { ...b, time: t };
      byTime.set(t, mergeBarPreferRange(byTime.get(t), next));
    }
    let merged = [...byTime.values()].sort((a, b) => a.time - b.time);

    // G18/ABSHODE 1H (and 2H/4H) often arrive sparse from Faraz — rebuild missing
    // cash-session hours from dense 1m history so the chart is continuous.
    if (step >= 3600 && step < 86_400 && countSessionHoles(merged, step) > 0) {
      try {
        const m1Limit = Math.min(
          20_000,
          Math.max(limit * Math.ceil(step / 60) + 500, 3_000),
        );
        const m1Json = await fetchJson<HistoryResponse>(
          buildUrl(HISTORY_BASE, {
            symbol: route.ticker,
            interval: "1",
            limit: m1Limit,
            before: range.to > 0 ? range.to : undefined,
          }),
          { timeoutMs: REQUEST_TIMEOUT_MS },
        );
        const minutes = (m1Json.bars ?? [])
          .map(parsePackedBar)
          .filter((b): b is Bar => b !== null)
          .filter((b) => b.time < before)
          .sort((a, b) => a.time - b.time);
        if (minutes.length > 0) {
          merged = densifyHourBarsFromMinutes(merged, minutes, step);
        }
      } catch {
        /* keep sparse parents */
      }
      // Multi-day holes (Faraz 1H auth dead): expand public/Mongo daily into session hours.
      if (countSessionHoles(merged, step) > 0) {
        try {
          const dJson = await fetchJson<HistoryResponse>(
            buildUrl(HISTORY_BASE, {
              symbol: route.ticker,
              interval: "1D",
              limit: Math.min(400, Math.max(120, Math.ceil(limit / 6))),
              before: range.to > 0 ? range.to : undefined,
            }),
            { timeoutMs: REQUEST_TIMEOUT_MS },
          );
          const dailies = (dJson.bars ?? [])
            .map(parsePackedBar)
            .filter((b): b is Bar => b !== null)
            .filter((b) => b.time < before)
            .sort((a, b) => a.time - b.time);
          if (dailies.length > 0) {
            merged = densifyHourBarsFromDaily(merged, dailies, step);
          }
        } catch {
          /* keep prior densify */
        }
      }
      // Remaining short cash-session holes → carry-forward (not multi-day outages).
      merged = fillIranSessionGaps(merged, step, 8);
    }

    const clean = sanitizeIranBars(merged);
    return clean.slice(-Math.max(range.countBack, 1));
  }

  subscribeBars(symbol: SymbolInfo, interval: Interval, onBar: (bar: Bar) => void): Unsubscribe {
    const route = routeFor(symbol);
    if (!route) return () => {};
    const step = intervalSeconds(interval);
    const disposers: Unsubscribe[] = [];
    let current: Bar | null = null;
    let lastEmittedClose = Number.NaN;
    let lastEmittedTime = -1;
    let lastTickMs = 0;
    let readyForTicks = false;
    const pending: Array<{ price: number; tsSec: number }> = [];

    const emit = (bar: Bar) => {
      current = bar;
      if (bar.time === lastEmittedTime && bar.close === lastEmittedClose) return;
      lastEmittedTime = bar.time;
      lastEmittedClose = bar.close;
      onBar(bar);
    };

    const onTick = (price: number, tsSec: number) => {
      if (!isMarketSessionOpen(symbol)) return;
      const nowSec = Math.floor(Date.now() / 1000);
      let ts = tsSec;
      if (ts > nowSec + 1) ts = nowSec;
      const maxAgeSec = Math.max(45, step * 3);
      if (nowSec - ts > maxAgeSec) return;
      lastTickMs = Date.now();
      if (!readyForTicks) {
        pending.push({ price, tsSec: ts });
        if (pending.length > 50) pending.shift();
        return;
      }
      // Sparse Faraz polls: short bridge only (do not invent long flat series).
      const next = applyTick(current, price, ts, step);
      if (current && next.time > current.time + step) {
        const bridgePx = current.close;
        const maxBridge = step * (step <= 60 ? 8 : 4);
        if (next.time - current.time <= maxBridge) {
          for (let t = current.time + step; t < next.time; t += step) {
            emit({
              time: t,
              open: bridgePx,
              high: bridgePx,
              low: bridgePx,
              close: bridgePx,
              volume: 0,
            });
          }
        }
      }
      // Leave live wicks alone — history sanitize already crushes absurd spikes.
      emit(next);
    };

    // Seed forming bar from deep history (Faraz D/W/M or Mongo), like cp_fetcher.
    void (async () => {
      try {
        const seed = await this.fetchBars(symbol, interval, {
          from: Math.floor(Date.now() / 1000) - step * 8,
          to: Math.floor(Date.now() / 1000) + 1,
          countBack: 5,
        });
        const last = seed[seed.length - 1];
        if (last) {
          const wallBucket = alignTime(Math.floor(Date.now() / 1000), step);
          const t = alignTime(last.time, step);
          if (t < wallBucket) {
            emit({
              time: wallBucket,
              open: last.close,
              high: last.close,
              low: last.close,
              close: last.close,
              volume: 0,
            });
          } else {
            emit({ ...last, time: Math.min(t, wallBucket) });
          }
        }
      } catch {
        /* ticks will create */
      } finally {
        readyForTicks = true;
        for (const tick of pending.splice(0)) {
          emit(applyTick(current, tick.price, tick.tsSec, step));
        }
      }
    })();

    // Seconds charts: do NOT invent empty dojis on a wall-clock timer — that caused
    // duplicate / missing 10S candles when Faraz polls ~1s. New buckets open only
    // from real ticks (WS + HTTP heartbeat); skipped buckets are bridged in onTick.

    // Primary realtime path — same `/market-ticks` WS used by cp_fetcher crypto/FX.
    disposers.push(openMarketTicksSocket(route.channel, onTick));

    // HTTP quote heartbeat if WS is quiet (proxy gaps) — mirrors cp live poll fallback.
    if (typeof window !== "undefined") {
      const poll = window.setInterval(() => {
        if (Date.now() - lastTickMs < 1_200) return;
        void fetchJson<QuoteResponse>(QUOTE_BASE, { timeoutMs: 2_000 })
          .then((q) => {
            const price = Number(q.prices?.[route.field] ?? q.channels?.[route.channel] ?? 0);
            if (price > 0) onTick(price, q.ts ? Number(q.ts) : Math.floor(Date.now() / 1000));
          })
          .catch(() => undefined);
      }, 1_000);
      disposers.push(() => clearInterval(poll));
    }

    return () => {
      for (const d of disposers) d();
    };
  }

  async fetchQuotes(symbols: readonly SymbolInfo[]): Promise<Quote[]> {
    const wanted = symbols.filter((s) => routeFor(s) !== null);
    if (!wanted.length) return [];
    try {
      const q = await fetchJson<QuoteResponse>(QUOTE_BASE, { timeoutMs: 3_000 });
      const now = q.ts && Number.isFinite(Number(q.ts)) ? Number(q.ts) : Math.floor(Date.now() / 1000);
      const out: Quote[] = [];
      for (const symbol of wanted) {
        const route = routeFor(symbol)!;
        const price = Number(q.prices?.[route.field] ?? q.channels?.[route.channel] ?? 0);
        if (!(price > 0)) continue;
        out.push({
          ticker: symbol.ticker,
          price,
          changePercent: 0,
          updatedAt: now,
          synthetic: false,
        });
      }
      return out;
    } catch {
      return [];
    }
  }
}
