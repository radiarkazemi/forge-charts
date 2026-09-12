/** Local/demo datasets for right-rail widgets (GAP-50…59). */

export type ScreenerRow = {
  ticker: string;
  exchange: string;
  last: number;
  changePct: number;
  volume: number;
  atrPct: number;
  relVol: number;
  sector: string;
};

export type CalendarEvent = {
  id: string;
  day: string; // YYYY-MM-DD UTC
  time: string; // HH:MM UTC
  country: string;
  title: string;
  impact: "low" | "medium" | "high";
  actual?: string;
  forecast?: string;
  previous?: string;
};

export type NewsItem = {
  id: string;
  at: number;
  headline: string;
  source: string;
  symbols: string[];
  tag: "markets" | "macro" | "earnings" | "crypto" | "fx";
};

export type FundamentalPoint = { t: number; v: number };
export type FundamentalSeries = { id: string; label: string; unit: string; points: FundamentalPoint[] };

export type YieldPoint = { tenor: string; years: number; yield: number };
export type YieldCurve = { country: string; currency: string; points: YieldPoint[] };

export type OptionRow = {
  strike: number;
  callBid: number;
  callAsk: number;
  callIv: number;
  putBid: number;
  putAsk: number;
  putIv: number;
  callOi: number;
  putOi: number;
};

export type MacroCell = {
  id: string;
  region: string;
  metric: string;
  score: number;
  label: string;
};

export type HotlistRow = {
  ticker: string;
  exchange: string;
  changePct: number;
  volume: number;
  reason: string;
};

export type DomLevel = { price: number; bid: number; ask: number };

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function mulberry(seed: number): () => number {
  let a = seed || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildScreener(
  rows: Array<{ ticker: string; exchange: string; price?: number; change?: number }>,
): ScreenerRow[] {
  return rows.map((r) => {
    const rnd = mulberry(hash(`${r.exchange}:${r.ticker}`));
    const last = r.price ?? 100 + rnd() * 400;
    const changePct = r.change ?? (rnd() - 0.45) * 8;
    return {
      ticker: r.ticker,
      exchange: r.exchange,
      last,
      changePct,
      volume: Math.round(1e5 + rnd() * 5e6),
      atrPct: 0.4 + rnd() * 3.5,
      relVol: 0.5 + rnd() * 2.8,
      sector: ["Crypto", "FX", "Metals", "Energy", "Index"][Math.floor(rnd() * 5)]!,
    };
  });
}

export function buildCalendar(days = 7): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  const catalog = [
    { title: "CPI YoY", country: "US", impact: "high" as const, forecast: "2.9%", previous: "3.0%" },
    { title: "Core CPI", country: "US", impact: "high" as const, forecast: "3.1%", previous: "3.2%" },
    { title: "FOMC Rate Decision", country: "US", impact: "high" as const, forecast: "5.25%", previous: "5.25%" },
    { title: "NFP", country: "US", impact: "high" as const, forecast: "180K", previous: "216K" },
    { title: "Unemployment Rate", country: "US", impact: "medium" as const, forecast: "4.1%", previous: "4.1%" },
    { title: "ECB Press Conference", country: "EU", impact: "high" as const, forecast: "—", previous: "—" },
    { title: "GDP QoQ", country: "EU", impact: "medium" as const, forecast: "0.2%", previous: "0.1%" },
    { title: "BoE Rate Decision", country: "GB", impact: "high" as const, forecast: "5.00%", previous: "5.00%" },
    { title: "Retail Sales MoM", country: "US", impact: "medium" as const, forecast: "0.3%", previous: "0.1%" },
    { title: "PPI YoY", country: "US", impact: "medium" as const, forecast: "2.2%", previous: "2.4%" },
    { title: "JOLTS Job Openings", country: "US", impact: "medium" as const, forecast: "7.6M", previous: "7.7M" },
    { title: "Crude Oil Inventories", country: "US", impact: "low" as const, forecast: "-1.2M", previous: "-0.8M" },
  ];
  const now = new Date();
  for (let d = 0; d < days; d++) {
    const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + d));
    const key = day.toISOString().slice(0, 10);
    const n = 2 + (hash(key) % 3);
    for (let i = 0; i < n; i++) {
      const item = catalog[(hash(`${key}:${i}`) + i) % catalog.length]!;
      const hour = 8 + (hash(`${key}:h:${i}`) % 10);
      const minute = [0, 15, 30, 45][hash(`${key}:m:${i}`) % 4]!;
      out.push({
        id: `${key}-${i}`,
        day: key,
        time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
        country: item.country,
        title: item.title,
        impact: item.impact,
        forecast: item.forecast,
        previous: item.previous,
        actual: d === 0 && i === 0 ? item.forecast : undefined,
      });
    }
  }
  return out.sort((a, b) => (a.day + a.time).localeCompare(b.day + b.time));
}

export function buildNewsFeed(ticker: string): NewsItem[] {
  const now = Date.now();
  const base: Omit<NewsItem, "id">[] = [
    {
      at: now - 4 * 60_000,
      headline: `${ticker} holds range as liquidity thins into the close`,
      source: "Forge Wire",
      symbols: [ticker],
      tag: "markets",
    },
    {
      at: now - 22 * 60_000,
      headline: "Dollar index firm; FX desks watch US data slate",
      source: "FX Desk",
      symbols: ["DXY", ticker],
      tag: "fx",
    },
    {
      at: now - 55 * 60_000,
      headline: "Treasury yields steady after mixed auction demand",
      source: "Rates Daily",
      symbols: ["US10Y"],
      tag: "macro",
    },
    {
      at: now - 2 * 3600_000,
      headline: "Crypto basis narrows as perpetual funding cools",
      source: "Digital Flow",
      symbols: ["BTCUSDT", "ETHUSDT"],
      tag: "crypto",
    },
    {
      at: now - 5 * 3600_000,
      headline: `${ticker}: options skew steadies after overnight move`,
      source: "Derivatives Brief",
      symbols: [ticker],
      tag: "earnings",
    },
    {
      at: now - 9 * 3600_000,
      headline: "Central-bank speakers keep rate-path uncertainty elevated",
      source: "Macro Calendar",
      symbols: [],
      tag: "macro",
    },
  ];
  return base.map((n, i) => ({ ...n, id: `n-${i}-${n.at}` }));
}

export function buildFundamentals(ticker: string): FundamentalSeries[] {
  const rnd = mulberry(hash(ticker));
  const mk = (label: string, unit: string, base: number, drift: number): FundamentalSeries => {
    const points: FundamentalPoint[] = [];
    let v = base;
    const start = Date.UTC(2023, 0, 1);
    for (let i = 0; i < 12; i++) {
      v = Math.max(0.01, v * (1 + drift + (rnd() - 0.5) * 0.08));
      points.push({ t: start + i * 30 * 86400000, v });
    }
    return { id: label.toLowerCase().replace(/\s+/g, "-"), label, unit, points };
  };
  return [
    mk("Revenue", "USD", 40 + rnd() * 80, 0.03),
    mk("EPS", "USD", 1 + rnd() * 4, 0.02),
    mk("Operating margin", "%", 12 + rnd() * 18, 0.005),
  ];
}

export const YIELD_CURVES: YieldCurve[] = [
  {
    country: "United States",
    currency: "USD",
    points: [
      { tenor: "1M", years: 1 / 12, yield: 5.28 },
      { tenor: "3M", years: 0.25, yield: 5.21 },
      { tenor: "2Y", years: 2, yield: 4.21 },
      { tenor: "5Y", years: 5, yield: 4.08 },
      { tenor: "10Y", years: 10, yield: 4.05 },
      { tenor: "30Y", years: 30, yield: 4.28 },
    ],
  },
  {
    country: "Germany",
    currency: "EUR",
    points: [
      { tenor: "3M", years: 0.25, yield: 3.55 },
      { tenor: "2Y", years: 2, yield: 2.41 },
      { tenor: "5Y", years: 5, yield: 2.28 },
      { tenor: "10Y", years: 10, yield: 2.35 },
      { tenor: "30Y", years: 30, yield: 2.62 },
    ],
  },
  {
    country: "United Kingdom",
    currency: "GBP",
    points: [
      { tenor: "3M", years: 0.25, yield: 4.85 },
      { tenor: "2Y", years: 2, yield: 4.12 },
      { tenor: "5Y", years: 5, yield: 3.95 },
      { tenor: "10Y", years: 10, yield: 4.02 },
      { tenor: "30Y", years: 30, yield: 4.45 },
    ],
  },
];

export function buildOptionsChain(spot: number): { expiry: string; spot: number; rows: OptionRow[]; demo: true } {
  const rnd = mulberry(hash(`opt:${spot.toFixed(2)}`));
  const step = spot > 500 ? 25 : spot > 50 ? 5 : spot > 5 ? 0.25 : 0.01;
  const atm = Math.round(spot / step) * step;
  const rows: OptionRow[] = [];
  for (let i = -5; i <= 5; i++) {
    const strike = Number((atm + i * step).toFixed(spot > 50 ? 2 : 4));
    const m = Math.abs(i) * 0.015;
    const callIv = 0.22 + m + rnd() * 0.03;
    const putIv = 0.24 + m + rnd() * 0.03;
    const intrinsicCall = Math.max(0, spot - strike);
    const intrinsicPut = Math.max(0, strike - spot);
    const callMid = intrinsicCall + spot * callIv * 0.04;
    const putMid = intrinsicPut + spot * putIv * 0.04;
    rows.push({
      strike,
      callBid: Math.max(0.01, callMid * 0.96),
      callAsk: callMid * 1.04,
      callIv: callIv * 100,
      putBid: Math.max(0.01, putMid * 0.96),
      putAsk: putMid * 1.04,
      putIv: putIv * 100,
      callOi: Math.round(200 + rnd() * 8000),
      putOi: Math.round(200 + rnd() * 8000),
    });
  }
  const exp = new Date();
  exp.setUTCDate(exp.getUTCDate() + ((5 - exp.getUTCDay() + 7) % 7 || 7));
  return { expiry: exp.toISOString().slice(0, 10), spot, rows, demo: true };
}

export function buildMacroHeatmap(): MacroCell[] {
  const regions = ["US", "EU", "UK", "JP", "CN", "EM"];
  const metrics = ["Growth", "Inflation", "Liquidity", "Risk"];
  const out: MacroCell[] = [];
  for (const region of regions) {
    for (const metric of metrics) {
      const rnd = mulberry(hash(`${region}:${metric}`));
      const score = Math.round(rnd() * 200 - 100);
      out.push({
        id: `${region}-${metric}`,
        region,
        metric,
        score,
        label: score > 35 ? "Strong" : score > 10 ? "Firm" : score > -10 ? "Neutral" : score > -35 ? "Soft" : "Weak",
      });
    }
  }
  return out;
}

export function buildHotlist(rows: ScreenerRow[]): HotlistRow[] {
  return [...rows]
    .sort((a, b) => Math.abs(b.changePct) * b.relVol - Math.abs(a.changePct) * a.relVol)
    .slice(0, 12)
    .map((r) => ({
      ticker: r.ticker,
      exchange: r.exchange,
      changePct: r.changePct,
      volume: r.volume,
      reason: Math.abs(r.changePct) > 3 ? "Momentum spike" : r.relVol > 1.8 ? "Unusual volume" : "Active session",
    }));
}

export function buildDom(spot: number, precision = 2): DomLevel[] {
  const rnd = mulberry(hash(`dom:${spot.toFixed(precision)}`));
  const tick = spot > 1000 ? 0.5 : spot > 100 ? 0.1 : spot > 10 ? 0.01 : 0.0001;
  const mid = Math.round(spot / tick) * tick;
  const levels: DomLevel[] = [];
  for (let i = 8; i >= 1; i--) {
    levels.push({
      price: Number((mid + i * tick).toFixed(precision)),
      bid: 0,
      ask: Math.round(2 + rnd() * 40),
    });
  }
  levels.push({
    price: Number(mid.toFixed(precision)),
    bid: Math.round(5 + rnd() * 25),
    ask: Math.round(5 + rnd() * 25),
  });
  for (let i = 1; i <= 8; i++) {
    levels.push({
      price: Number((mid - i * tick).toFixed(precision)),
      bid: Math.round(2 + rnd() * 40),
      ask: 0,
    });
  }
  return levels;
}

export function sparkPath(points: FundamentalPoint[], w: number, h: number, pad = 4): string {
  if (!points.length) return "";
  const xs = points.map((p) => p.t);
  const ys = points.map((p) => p.v);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const dx = Math.max(1e-9, maxX - minX);
  const dy = Math.max(1e-9, maxY - minY);
  return points
    .map((p, i) => {
      const x = pad + ((p.t - minX) / dx) * (w - pad * 2);
      const y = h - pad - ((p.v - minY) / dy) * (h - pad * 2);
      return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

export function yieldPath(points: YieldPoint[], w: number, h: number, pad = 16): string {
  if (!points.length) return "";
  const maxY = Math.max(...points.map((p) => p.years));
  const minV = Math.min(...points.map((p) => p.yield));
  const maxV = Math.max(...points.map((p) => p.yield));
  const dv = Math.max(0.05, maxV - minV);
  return points
    .map((p, i) => {
      const x = pad + (p.years / maxY) * (w - pad * 2);
      const y = h - pad - ((p.yield - minV) / dv) * (h - pad * 2);
      return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}
