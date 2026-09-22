import type { Bar } from "./types";
import { sma, ema, rsi } from "./indicators";

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

/** Smoothed / RMA (Wilder-style SMMA). */
export function smma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = Array(values.length).fill(null);
  if (period < 1 || values.length < period) return out;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  out[period - 1] = sum / period;
  for (let i = period; i < values.length; i++) {
    out[i] = ((out[i - 1] as number) * (period - 1) + values[i]) / period;
  }
  return out;
}

export function vwma(values: number[], volumes: number[], period: number): (number | null)[] {
  const out: (number | null)[] = Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    let pv = 0;
    let vol = 0;
    for (let j = 0; j < period; j++) {
      pv += values[i - j] * volumes[i - j];
      vol += volumes[i - j];
    }
    out[i] = vol ? pv / vol : null;
  }
  return out;
}

export function hma(values: number[], period: number): (number | null)[] {
  const half = Math.max(1, Math.floor(period / 2));
  const sqrtP = Math.max(1, Math.floor(Math.sqrt(period)));
  const wmaHalf = wma(values, half);
  const wmaFull = wma(values, period);
  const raw = values.map((_, i) =>
    wmaHalf[i] != null && wmaFull[i] != null ? 2 * (wmaHalf[i] as number) - (wmaFull[i] as number) : NaN,
  );
  const filled = raw.map((v, i) => (Number.isFinite(v) ? v : values[i]));
  const smoothed = wma(filled, sqrtP);
  return smoothed.map((v, i) => (Number.isFinite(raw[i]) ? v : null));
}

/** Typical-price VWAP by default; optional `source` replaces TP (GAP-15). */
export function vwap(bars: Bar[], source?: number[]): (number | null)[] {
  const out: (number | null)[] = Array(bars.length).fill(null);
  let pv = 0;
  let vol = 0;
  for (let i = 0; i < bars.length; i++) {
    const tp = source?.[i] ?? (bars[i].high + bars[i].low + bars[i].close) / 3;
    pv += tp * bars[i].volume;
    vol += bars[i].volume;
    out[i] = vol ? pv / vol : null;
  }
  return out;
}

export function atr(bars: Bar[], period = 14, source?: number[]): (number | null)[] {
  const out: (number | null)[] = Array(bars.length).fill(null);
  const trs: number[] = [];
  for (let i = 0; i < bars.length; i++) {
    const prev = source?.[i - 1] ?? bars[i - 1]?.close ?? (source?.[i] ?? bars[i].open);
    trs.push(Math.max(bars[i].high - bars[i].low, Math.abs(bars[i].high - prev), Math.abs(bars[i].low - prev)));
  }
  const smoothed = ema(trs, period);
  for (let i = 0; i < bars.length; i++) out[i] = smoothed[i];
  return out;
}

export function stoch(bars: Bar[], kPeriod = 14, dPeriod = 3, source?: number[]) {
  const k: (number | null)[] = Array(bars.length).fill(null);
  for (let i = kPeriod - 1; i < bars.length; i++) {
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = 0; j < kPeriod; j++) {
      hi = Math.max(hi, bars[i - j].high);
      lo = Math.min(lo, bars[i - j].low);
    }
    const px = source?.[i] ?? bars[i].close;
    k[i] = hi === lo ? 50 : ((px - lo) / (hi - lo)) * 100;
  }
  const compact = k.map((v) => v ?? 50);
  const d = sma(compact, dPeriod).map((v, i) => (k[i] == null ? null : v));
  return { k, d };
}

export function ichimoku(bars: Bar[], tenkan = 9, kijun = 26, senkou = 52, source?: number[]) {
  const mid = (period: number, i: number) => {
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = 0; j < period; j++) {
      hi = Math.max(hi, bars[i - j].high);
      lo = Math.min(lo, bars[i - j].low);
    }
    return (hi + lo) / 2;
  };
  const conversion: (number | null)[] = Array(bars.length).fill(null);
  const base: (number | null)[] = Array(bars.length).fill(null);
  const spanA: (number | null)[] = Array(bars.length).fill(null);
  const spanB: (number | null)[] = Array(bars.length).fill(null);
  const lagging: (number | null)[] = Array(bars.length).fill(null);
  for (let i = 0; i < bars.length; i++) {
    if (i >= tenkan - 1) conversion[i] = mid(tenkan, i);
    if (i >= kijun - 1) base[i] = mid(kijun, i);
    if (conversion[i] != null && base[i] != null) {
      const a = ((conversion[i] as number) + (base[i] as number)) / 2;
      const target = i + kijun;
      if (target < bars.length) spanA[target] = a;
    }
    if (i >= senkou - 1) {
      const b = mid(senkou, i);
      const target = i + kijun;
      if (target < bars.length) spanB[target] = b;
    }
    const lag = i - kijun;
    if (lag >= 0) lagging[lag] = source?.[i] ?? bars[i].close;
  }
  return { conversion, base, spanA, spanB, lagging };
}

export function supertrend(bars: Bar[], period = 10, mult = 3, source?: number[]) {
  const atrLine = atr(bars, period);
  const line: (number | null)[] = Array(bars.length).fill(null);
  const dir: (number | null)[] = Array(bars.length).fill(null);
  let upper = 0;
  let lower = 0;
  let trend = 1;
  for (let i = 0; i < bars.length; i++) {
    const a = atrLine[i];
    if (a == null) continue;
    const mid = (bars[i].high + bars[i].low) / 2;
    const bu = mid + mult * a;
    const bl = mid - mult * a;
    const px = source?.[i] ?? bars[i].close;
    const prevPx = source?.[i - 1] ?? bars[i - 1]?.close;
    if (i === 0 || atrLine[i - 1] == null) {
      upper = bu;
      lower = bl;
      trend = px >= mid ? 1 : -1;
    } else {
      lower = bl > lower || (prevPx != null && prevPx < lower) ? bl : lower;
      upper = bu < upper || (prevPx != null && prevPx > upper) ? bu : upper;
      if (trend === 1 && px < lower) trend = -1;
      else if (trend === -1 && px > upper) trend = 1;
    }
    line[i] = trend === 1 ? lower : upper;
    dir[i] = trend;
  }
  return { line, dir };
}

export function psar(bars: Bar[], step = 0.02, max = 0.2, source?: number[]): (number | null)[] {
  const out: (number | null)[] = Array(bars.length).fill(null);
  if (bars.length < 2) return out;
  const px0 = source?.[0] ?? bars[0].close;
  const px1 = source?.[1] ?? bars[1].close;
  let bull = px1 >= px0;
  let af = step;
  let ep = bull ? bars[0].high : bars[0].low;
  let sar = bull ? bars[0].low : bars[0].high;
  out[0] = sar;
  for (let i = 1; i < bars.length; i++) {
    const prevSar = sar;
    sar = prevSar + af * (ep - prevSar);
    if (bull) {
      sar = Math.min(sar, bars[i - 1].low, bars[i - 2]?.low ?? bars[i - 1].low);
      if (bars[i].low < sar) {
        bull = false;
        sar = ep;
        ep = bars[i].low;
        af = step;
      } else if (bars[i].high > ep) {
        ep = bars[i].high;
        af = Math.min(max, af + step);
      }
    } else {
      sar = Math.max(sar, bars[i - 1].high, bars[i - 2]?.high ?? bars[i - 1].high);
      if (bars[i].high > sar) {
        bull = true;
        sar = ep;
        ep = bars[i].high;
        af = step;
      } else if (bars[i].low < ep) {
        ep = bars[i].low;
        af = Math.min(max, af + step);
      }
    }
    out[i] = sar;
  }
  return out;
}

export function donchian(bars: Bar[], period = 20) {
  const upper: (number | null)[] = Array(bars.length).fill(null);
  const lower: (number | null)[] = Array(bars.length).fill(null);
  const mid: (number | null)[] = Array(bars.length).fill(null);
  for (let i = period - 1; i < bars.length; i++) {
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = 0; j < period; j++) {
      hi = Math.max(hi, bars[i - j].high);
      lo = Math.min(lo, bars[i - j].low);
    }
    upper[i] = hi;
    lower[i] = lo;
    mid[i] = (hi + lo) / 2;
  }
  return { upper, mid, lower };
}

export function keltner(bars: Bar[], period = 20, mult = 1.5, source: number[]) {
  const mid = ema(source, period);
  const a = atr(bars, period);
  const upper: (number | null)[] = Array(bars.length).fill(null);
  const lower: (number | null)[] = Array(bars.length).fill(null);
  for (let i = 0; i < bars.length; i++) {
    if (mid[i] == null || a[i] == null) continue;
    upper[i] = (mid[i] as number) + mult * (a[i] as number);
    lower[i] = (mid[i] as number) - mult * (a[i] as number);
  }
  return { upper, mid, lower };
}

export function pivots(bars: Bar[]) {
  const p: (number | null)[] = Array(bars.length).fill(null);
  const r1: (number | null)[] = Array(bars.length).fill(null);
  const s1: (number | null)[] = Array(bars.length).fill(null);
  const r2: (number | null)[] = Array(bars.length).fill(null);
  const s2: (number | null)[] = Array(bars.length).fill(null);
  let day = -1;
  let dayHi = -Infinity;
  let dayLo = Infinity;
  let dayClose = 0;
  let curP = 0;
  let curR1 = 0;
  let curS1 = 0;
  let curR2 = 0;
  let curS2 = 0;
  let ready = false;
  for (let i = 0; i < bars.length; i++) {
    const d = Math.floor(bars[i].time / 86400);
    if (d !== day) {
      if (day >= 0) {
        curP = (dayHi + dayLo + dayClose) / 3;
        curR1 = 2 * curP - dayLo;
        curS1 = 2 * curP - dayHi;
        curR2 = curP + (dayHi - dayLo);
        curS2 = curP - (dayHi - dayLo);
        ready = true;
      }
      day = d;
      dayHi = bars[i].high;
      dayLo = bars[i].low;
      dayClose = bars[i].close;
    } else {
      dayHi = Math.max(dayHi, bars[i].high);
      dayLo = Math.min(dayLo, bars[i].low);
      dayClose = bars[i].close;
    }
    if (ready) {
      p[i] = curP;
      r1[i] = curR1;
      s1[i] = curS1;
      r2[i] = curR2;
      s2[i] = curS2;
    }
  }
  return { p, r1, s1, r2, s2 };
}

export function obv(bars: Bar[], source?: number[]): (number | null)[] {
  const out: (number | null)[] = Array(bars.length).fill(null);
  let v = 0;
  for (let i = 0; i < bars.length; i++) {
    if (i === 0) {
      out[i] = 0;
      continue;
    }
    const cur = source?.[i] ?? bars[i].close;
    const prev = source?.[i - 1] ?? bars[i - 1].close;
    if (cur > prev) v += bars[i].volume;
    else if (cur < prev) v -= bars[i].volume;
    out[i] = v;
  }
  return out;
}

export function cmf(bars: Bar[], period = 20, source?: number[]): (number | null)[] {
  const out: (number | null)[] = Array(bars.length).fill(null);
  const mfv = bars.map((b, i) => {
    const range = b.high - b.low;
    const px = source?.[i] ?? b.close;
    const mfm = range === 0 ? 0 : (px - b.low - (b.high - px)) / range;
    return mfm * b.volume;
  });
  for (let i = period - 1; i < bars.length; i++) {
    let sumMfv = 0;
    let sumVol = 0;
    for (let j = 0; j < period; j++) {
      sumMfv += mfv[i - j];
      sumVol += bars[i - j].volume;
    }
    out[i] = sumVol ? sumMfv / sumVol : null;
  }
  return out;
}

export function cci(bars: Bar[], period = 20, source?: number[]): (number | null)[] {
  const tp = source ?? bars.map((b) => (b.high + b.low + b.close) / 3);
  const out: (number | null)[] = Array(bars.length).fill(null);
  const avg = sma(tp, period);
  for (let i = period - 1; i < bars.length; i++) {
    let mad = 0;
    for (let j = 0; j < period; j++) mad += Math.abs(tp[i - j] - (avg[i] as number));
    mad /= period;
    out[i] = mad === 0 ? 0 : (tp[i] - (avg[i] as number)) / (0.015 * mad);
  }
  return out;
}

export function willr(bars: Bar[], period = 14, source?: number[]): (number | null)[] {
  const out: (number | null)[] = Array(bars.length).fill(null);
  for (let i = period - 1; i < bars.length; i++) {
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = 0; j < period; j++) {
      hi = Math.max(hi, bars[i - j].high);
      lo = Math.min(lo, bars[i - j].low);
    }
    const px = source?.[i] ?? bars[i].close;
    out[i] = hi === lo ? -50 : ((hi - px) / (hi - lo)) * -100;
  }
  return out;
}

export function stochRsi(closes: number[], period = 14, kPeriod = 3, dPeriod = 3) {
  const r = rsi(closes, period);
  const k: (number | null)[] = Array(closes.length).fill(null);
  for (let i = 0; i < closes.length; i++) {
    if (r[i] == null || i < period * 2 - 2) continue;
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = 0; j < period; j++) {
      const v = r[i - j];
      if (v == null) continue;
      hi = Math.max(hi, v);
      lo = Math.min(lo, v);
    }
    k[i] = hi === lo ? 50 : (((r[i] as number) - lo) / (hi - lo)) * 100;
  }
  const compact = k.map((v) => v ?? 50);
  const kSmooth = sma(compact, kPeriod).map((v, i) => (k[i] == null ? null : v));
  const dCompact = kSmooth.map((v) => v ?? 50);
  const d = sma(dCompact, dPeriod).map((v, i) => (kSmooth[i] == null ? null : v));
  return { k: kSmooth, d };
}

export function adx(bars: Bar[], period = 14) {
  const plusDI: (number | null)[] = Array(bars.length).fill(null);
  const minusDI: (number | null)[] = Array(bars.length).fill(null);
  const adxLine: (number | null)[] = Array(bars.length).fill(null);
  const tr: number[] = [];
  const plusDM: number[] = [];
  const minusDM: number[] = [];
  for (let i = 0; i < bars.length; i++) {
    if (i === 0) {
      tr.push(bars[i].high - bars[i].low);
      plusDM.push(0);
      minusDM.push(0);
      continue;
    }
    const up = bars[i].high - bars[i - 1].high;
    const down = bars[i - 1].low - bars[i].low;
    plusDM.push(up > down && up > 0 ? up : 0);
    minusDM.push(down > up && down > 0 ? down : 0);
    const prev = bars[i - 1].close;
    tr.push(Math.max(bars[i].high - bars[i].low, Math.abs(bars[i].high - prev), Math.abs(bars[i].low - prev)));
  }
  const wilder = (arr: number[]) => {
    const out: (number | null)[] = Array(arr.length).fill(null);
    let sum = 0;
    for (let i = 0; i < arr.length; i++) {
      if (i < period) {
        sum += arr[i];
        if (i === period - 1) out[i] = sum;
      } else {
        out[i] = (out[i - 1] as number) - (out[i - 1] as number) / period + arr[i];
      }
    }
    return out;
  };
  const str = wilder(tr);
  const sp = wilder(plusDM);
  const sm = wilder(minusDM);
  const dx: (number | null)[] = Array(bars.length).fill(null);
  for (let i = 0; i < bars.length; i++) {
    if (str[i] == null || sp[i] == null || sm[i] == null || (str[i] as number) === 0) continue;
    const pdi = (100 * (sp[i] as number)) / (str[i] as number);
    const mdi = (100 * (sm[i] as number)) / (str[i] as number);
    plusDI[i] = pdi;
    minusDI[i] = mdi;
    const den = pdi + mdi;
    dx[i] = den === 0 ? 0 : (100 * Math.abs(pdi - mdi)) / den;
  }
  let adxSum = 0;
  let adxCount = 0;
  let prevAdx: number | null = null;
  for (let i = 0; i < bars.length; i++) {
    if (dx[i] == null) continue;
    if (adxCount < period) {
      adxSum += dx[i] as number;
      adxCount++;
      if (adxCount === period) {
        prevAdx = adxSum / period;
        adxLine[i] = prevAdx;
      }
    } else {
      prevAdx = ((prevAdx as number) * (period - 1) + (dx[i] as number)) / period;
      adxLine[i] = prevAdx;
    }
  }
  return { adx: adxLine, plusDI, minusDI };
}

/** Synthetic volume-at-price buckets from OHLC (no L2). */
export function volumeAtPrice(bars: Bar[], bins = 24): { price: number; buy: number; sell: number; total: number }[] {
  if (!bars.length) return [];
  let hi = -Infinity;
  let lo = Infinity;
  for (const b of bars) {
    hi = Math.max(hi, b.high);
    lo = Math.min(lo, b.low);
  }
  if (!Number.isFinite(hi) || !Number.isFinite(lo) || hi <= lo) return [];
  const step = (hi - lo) / bins;
  const rows = Array.from({ length: bins }, (_, i) => ({
    price: lo + (i + 0.5) * step,
    buy: 0,
    sell: 0,
    total: 0,
  }));
  for (const b of bars) {
    const up = b.close >= b.open;
    const range = Math.max(b.high - b.low, step * 0.25);
    for (let i = 0; i < bins; i++) {
      const p0 = lo + i * step;
      const p1 = p0 + step;
      const overlap = Math.max(0, Math.min(b.high, p1) - Math.max(b.low, p0));
      if (overlap <= 0) continue;
      const share = (overlap / range) * b.volume;
      if (up) rows[i].buy += share;
      else rows[i].sell += share;
      rows[i].total += share;
    }
  }
  return rows;
}

/** TPO letters + POC / value area from bar time×price occupancy. */
export function buildTpo(bars: Bar[], bins = 24, letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
  if (!bars.length) return { letters: [] as string[][], pocBin: 0, vaLow: 0, vaHigh: bins - 1, prices: [] as number[] };
  let hi = -Infinity;
  let lo = Infinity;
  for (const b of bars) {
    hi = Math.max(hi, b.high);
    lo = Math.min(lo, b.low);
  }
  const step = (hi - lo) / bins || 1;
  const grid: string[][] = Array.from({ length: bins }, () => []);
  const prices = Array.from({ length: bins }, (_, i) => lo + (i + 0.5) * step);
  bars.forEach((b, bi) => {
    const letter = letters[bi % letters.length];
    for (let i = 0; i < bins; i++) {
      const p0 = lo + i * step;
      const p1 = p0 + step;
      if (b.high >= p0 && b.low <= p1) grid[i].push(letter);
    }
  });
  let pocBin = 0;
  let pocCount = -1;
  grid.forEach((row, i) => {
    if (row.length > pocCount) {
      pocCount = row.length;
      pocBin = i;
    }
  });
  const total = grid.reduce((a, r) => a + r.length, 0);
  const target = total * 0.7;
  let covered = grid[pocBin]?.length ?? 0;
  let loBin = pocBin;
  let hiBin = pocBin;
  while (covered < target && (loBin > 0 || hiBin < bins - 1)) {
    const nextLo = loBin > 0 ? grid[loBin - 1].length : -1;
    const nextHi = hiBin < bins - 1 ? grid[hiBin + 1].length : -1;
    if (nextHi >= nextLo) {
      hiBin++;
      covered += grid[hiBin].length;
    } else {
      loBin--;
      covered += grid[loBin].length;
    }
  }
  return { letters: grid, pocBin, vaLow: loBin, vaHigh: hiBin, prices };
}
