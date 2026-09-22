import {
  alignToInterval,
  intervalSeconds,
  type Bar,
  type BarRange,
  type Interval,
  type Quote,
  type SymbolInfo,
} from "@/domain";
import type { MarketDataProvider, Unsubscribe } from "@/application";

const NATIVE_INTERVALS: readonly Interval[] = ["1", "5", "15", "30", "60", "240", "1D", "1W", "1M"];
const MAX_HISTORY_YEARS = 15;
const TICK_MS = 1_000;

/** Reference price per ticker so demo charts look plausible. */
const BASE_PRICE: Readonly<Record<string, number>> = {
  AAPL: 227.4,
  MSFT: 428.6,
  NVDA: 131.8,
  TSLA: 248.6,
  AMZN: 197.2,
  GOOGL: 176.4,
  META: 582.1,
  SPY: 562.4,
  QQQ: 482.6,
  GLD: 225.3,
  IWM: 218.7,
  "ES1!": 5652,
  "NQ1!": 19885,
  "GC1!": 2648,
  "CL1!": 78.5,
  EURUSD: 1.0864,
  GBPUSD: 1.2731,
  USDJPY: 148.22,
  AUDUSD: 0.6621,
  USDCHF: 0.8842,
  BTCUSD: 97250,
  ETHUSD: 3420,
  SOLUSD: 178.4,
  BNBUSDT: 612,
  XRPUSD: 2.42,
  SPX: 5620,
  NDX: 20140,
  DJI: 41280,
  DAX: 19840,
  XAUUSD: 2645,
  XAGUSD: 31.2,
  USOIL: 78.4,
  US10Y: 4.162,
  US02Y: 4.281,
  DE10Y: 2.414,
  USINTR: 5.5,
  USCPI: 314.2,
  USUNEMP: 4.1,
  AAPL250117C250: 14.2,
  TSLA250117P200: 18.7,
  SPY250117C550: 9.4,
};

/* ── deterministic noise ───────────────────────────────────────────────── */

function hash32(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Uniform value in [-1, 1] for an integer lattice point. */
function lattice(seed: number, index: number): number {
  let x = (seed ^ Math.imul(index | 0, 0x9e3779b1)) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  return ((x ^ (x >>> 16)) >>> 0) / 0x7fffffff - 1;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Value noise over a continuous coordinate, in [-1, 1]. */
function valueNoise(seed: number, x: number): number {
  const i = Math.floor(x);
  const t = smoothstep(x - i);
  return lattice(seed, i) * (1 - t) + lattice(seed, i + 1) * t;
}

/** Fractal (multi-octave) noise: slow trend + medium swings + fast wiggles. */
function fractalNoise(seed: number, index: number): number {
  return (
    valueNoise(seed, index / 256) * 1.0 +
    valueNoise(seed ^ 0x51ed27, index / 48) * 0.45 +
    valueNoise(seed ^ 0xa2c1f3, index / 9) * 0.18
  );
}

/**
 * Deterministic demo data. Every bar is a pure function of
 * (ticker, interval, bar index) so paging backwards and forwards always yields
 * the same series — no path dependence, no stored state.
 */
export class SyntheticProvider implements MarketDataProvider {
  readonly id = "synthetic";
  readonly isSynthetic = true;

  supports(): boolean {
    return true;
  }

  nativeIntervals(): readonly Interval[] {
    return NATIVE_INTERVALS;
  }

  async fetchBars(symbol: SymbolInfo, interval: Interval, range: BarRange): Promise<Bar[]> {
    const step = intervalSeconds(interval);
    const now = Math.floor(Date.now() / 1000);
    const oldest = now - MAX_HISTORY_YEARS * 365 * 86_400;
    if (range.to <= oldest) return [];

    const lastTime = alignToInterval(Math.min(range.to - 1, now), interval);
    const count = Math.max(1, Math.min(range.countBack, 5_000));
    const bars: Bar[] = [];
    for (let k = count - 1; k >= 0; k--) {
      const time = lastTime - k * step;
      if (time < oldest) continue;
      bars.push(this.barAt(symbol, interval, time));
    }
    return bars;
  }

  subscribeBars(symbol: SymbolInfo, interval: Interval, onBar: (bar: Bar) => void): Unsubscribe {
    let current: Bar | null = null;
    const timer = setInterval(() => {
      const now = Math.floor(Date.now() / 1000);
      const barTime = alignToInterval(now, interval);
      if (!current || current.time !== barTime) {
        const fresh = this.barAt(symbol, interval, barTime);
        current = { ...fresh, high: fresh.open, low: fresh.open, close: fresh.open, volume: 0 };
      }
      const drift = (Math.random() - 0.5) * this.volatility(symbol) * current.open * 0.15;
      const close = Math.max(1e-6, current.close + drift);
      current = {
        ...current,
        close,
        high: Math.max(current.high, close),
        low: Math.min(current.low, close),
        volume: current.volume + Math.round(Math.random() * 40),
      };
      onBar(current);
    }, TICK_MS);
    return () => clearInterval(timer);
  }

  async fetchQuotes(symbols: readonly SymbolInfo[]): Promise<Quote[]> {
    const now = Math.floor(Date.now() / 1000);
    return symbols.map((symbol) => {
      const last = this.barAt(symbol, "1D", alignToInterval(now, "1D"));
      const prev = this.barAt(symbol, "1D", alignToInterval(now, "1D") - 86_400);
      return {
        ticker: symbol.ticker,
        price: last.close,
        changePercent: ((last.close - prev.close) / prev.close) * 100,
        updatedAt: now,
        synthetic: true,
      };
    });
  }

  /* ── internals ─────────────────────────────────────────────────────── */

  private volatility(symbol: SymbolInfo): number {
    switch (symbol.type) {
      case "forex":
        return 0.004;
      case "crypto":
        return 0.06;
      case "bond":
      case "economic":
        return 0.02;
      default:
        return 0.025;
    }
  }

  private closeAt(symbol: SymbolInfo, interval: Interval, index: number): number {
    const seed = hash32(`${symbol.ticker}:${interval}`);
    const base = BASE_PRICE[symbol.ticker] ?? 100;
    const amplitude = this.volatility(symbol) * 6;
    return base * Math.exp(fractalNoise(seed, index) * amplitude);
  }

  private barAt(symbol: SymbolInfo, interval: Interval, time: number): Bar {
    const step = intervalSeconds(interval);
    const index = Math.floor(time / step);
    const seed = hash32(`${symbol.ticker}:${interval}:wick`);
    const open = this.closeAt(symbol, interval, index - 1);
    const close = this.closeAt(symbol, interval, index);
    const spread = Math.abs(close - open) + Math.abs(lattice(seed, index)) * open * this.volatility(symbol) * 0.12;
    const high = Math.max(open, close) + spread * Math.abs(lattice(seed ^ 1, index)) * 0.6;
    const low = Math.min(open, close) - spread * Math.abs(lattice(seed ^ 2, index)) * 0.6;
    const volume = Math.round(800 + (lattice(seed ^ 3, index) + 1) * 4600 * (0.5 + spread / (open * 0.01 + 1e-9)));
    return { time, open, high, low: Math.max(1e-6, low), close, volume };
  }
}
