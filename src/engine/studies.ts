import type { Bar } from "./types";
import { sma, ema } from "./indicators";

export { sma, ema, bollinger, rsi, macd, heikinAshi, closesOf } from "./indicators";

export function wma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = Array(values.length).fill(null);
  const den = (period * (period + 1)) / 2;
  for (let i = period - 1; i < values.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) sum += values[i - j] * (period - j);
    out[i] = sum / den;
  }
  return out;
}

export function vwap(bars: Bar[]): (number | null)[] {
  const out: (number | null)[] = Array(bars.length).fill(null);
  let pv = 0;
  let vol = 0;
  for (let i = 0; i < bars.length; i++) {
    const tp = (bars[i].high + bars[i].low + bars[i].close) / 3;
    pv += tp * bars[i].volume;
    vol += bars[i].volume;
    out[i] = vol ? pv / vol : null;
  }
  return out;
}

export function atr(bars: Bar[], period = 14): (number | null)[] {
  const out: (number | null)[] = Array(bars.length).fill(null);
  const trs: number[] = [];
  for (let i = 0; i < bars.length; i++) {
    const prev = bars[i - 1]?.close ?? bars[i].open;
    trs.push(Math.max(bars[i].high - bars[i].low, Math.abs(bars[i].high - prev), Math.abs(bars[i].low - prev)));
  }
  const smoothed = ema(trs, period);
  for (let i = 0; i < bars.length; i++) out[i] = smoothed[i];
  return out;
}

export function stoch(bars: Bar[], kPeriod = 14, dPeriod = 3) {
  const k: (number | null)[] = Array(bars.length).fill(null);
  for (let i = kPeriod - 1; i < bars.length; i++) {
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = 0; j < kPeriod; j++) {
      hi = Math.max(hi, bars[i - j].high);
      lo = Math.min(lo, bars[i - j].low);
    }
    k[i] = hi === lo ? 50 : ((bars[i].close - lo) / (hi - lo)) * 100;
  }
  const compact = k.map((v) => v ?? 50);
  const d = sma(compact, dPeriod).map((v, i) => (k[i] == null ? null : v));
  return { k, d };
}
