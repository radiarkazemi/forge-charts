import { describe, expect, it, vi } from "vitest";
import { intervalSeconds, parseInterval, resampleBars, type Bar, type SymbolInfo } from "@/domain";
import { MarketDataService } from "@/application";
import type { MarketDataProvider } from "@/application";
import { densifySessionBars } from "@/infrastructure/market-data/session-fill";
import { firstHistoryPage, historyFetchLimit } from "@/infrastructure/market-data/history-page";
import {
  aggregateBars,
  liveSecondUpdate,
  presentSecondBars,
  synthesizeFromMinuteBars,
  synthesizeSecondsFromMinute,
} from "@/infrastructure/market-data/synthesize-seconds";
import { canonicalInterval, intervalFromLabel } from "@/features/chart/tv-layers-header";
import { StaticSymbolRepository } from "@/infrastructure/symbols/static-symbol-repository";
import { TradingViewDatafeed } from "@/infrastructure/tradingview/datafeed";
import type { LibrarySymbolInfo, PeriodParams } from "@/infrastructure/tradingview/types";

const SATURDAY = Date.parse("2026-11-28T16:00:30Z");

function bar(time: number, open: number, high: number, low: number, close: number, volume = 1): Bar {
  return { time, open, high, low, close, volume };
}

function assertOhlc(rows: readonly Bar[], step: number): void {
  const times = rows.map((row) => row.time);
  expect(times).toEqual([...times].sort((a, b) => a - b));
  expect(new Set(times).size).toBe(times.length);
  for (const row of rows) {
    expect(row.time % step).toBe(0);
    expect(row.high).toBeGreaterThanOrEqual(row.low);
    expect(row.high).toBeGreaterThanOrEqual(Math.max(row.open, row.close));
    expect(row.low).toBeLessThanOrEqual(Math.min(row.open, row.close));
  }
}

const gold: SymbolInfo = {
  ticker: "XAUUSD",
  name: "Gold Spot / U.S. Dollar",
  exchange: "FOREXCOM",
  type: "forex",
  pricePrecision: 2,
  session: "1800-1700",
  timezone: "America/New_York",
};

describe("interval parsing", () => {
  it("keeps 30 seconds distinct from 30 minutes and 1M as one month", () => {
    expect(parseInterval("30S").seconds).toBe(30);
    expect(parseInterval("30s").seconds).toBe(30);
    expect(parseInterval("30").seconds).toBe(1_800);
    expect(parseInterval("1").seconds).toBe(60);
    expect(parseInterval("1M").unit).toBe("months");
    expect(intervalSeconds("5")).toBe(300);
    expect(intervalSeconds("240")).toBe(14_400);
  });

  it("routes a 30-second menu label to seconds and a bare 30 to minutes", () => {
    expect(intervalFromLabel("30 seconds")).toBe("30S");
    expect(intervalFromLabel("30s")).toBe("30S");
    expect(intervalFromLabel("15 seconds")).toBe("15S");
    expect(canonicalInterval("30")).toBe("30");
    expect(canonicalInterval("30S")).toBe("30S");
    expect(canonicalInterval("30s")).toBe("30S");
    expect(intervalFromLabel("30 minutes")).toBe("30");
    expect(intervalFromLabel("1m")).toBe("1");
  });
});

describe("seconds history synthesized from 1m", () => {
  const parent = bar(1_700_000_040, 3460, 3470, 3450, 3466, 60);

  it("builds a 60-second path that starts at the open and ends at the close", () => {
    const seconds = synthesizeSecondsFromMinute(parent);
    expect(seconds).toHaveLength(60);
    expect(seconds[0]?.open).toBe(parent.open);
    expect(seconds[59]?.close).toBe(parent.close);
    expect(Math.max(...seconds.map((row) => row.high))).toBe(parent.high);
    expect(Math.min(...seconds.map((row) => row.low))).toBe(parent.low);
    assertOhlc(seconds, 1);
  });

  it("rolls each minute into two 30s candles whose last close is the 1m close", () => {
    const bars = synthesizeFromMinuteBars([parent], 30);
    expect(bars.map((row) => row.time)).toEqual([parent.time, parent.time + 30]);
    expect(bars[1]?.close).toBe(parent.close);
    assertOhlc(bars, 30);
  });

  it("drops seconds that have not happened and paints the live bucket at the 1m close", () => {
    const now = parent.time + 10;
    const shown = presentSecondBars([parent], 30, now);
    expect(shown.map((row) => row.time)).toEqual([parent.time]);
    expect(shown.every((row) => row.time <= now)).toBe(true);
    expect(shown[0]?.close).toBe(parent.close);
    assertOhlc(shown, 30);
  });

  it("keeps the finished 30s slice and moves only the open slice to the live close", () => {
    const now = parent.time + 40;
    const shown = presentSecondBars([parent], 30, now);
    const path = synthesizeFromMinuteBars([parent], 30);
    expect(shown).toHaveLength(2);
    expect(shown[0]).toEqual(path[0]);
    expect(shown[1]?.time).toBe(parent.time + 30);
    expect(shown[1]?.close).toBe(parent.close);
    assertOhlc(shown, 30);
  });

  it("updates the open seconds bucket to the parent close immediately", () => {
    const early = liveSecondUpdate(parent, 15, parent.time + 4, -1);
    expect(early).toHaveLength(1);
    expect(early[0]?.time).toBe(parent.time);
    expect(early[0]?.close).toBe(parent.close);
    const later = liveSecondUpdate(parent, 30, parent.time + 35, parent.time);
    expect(later[later.length - 1]?.close).toBe(parent.close);
    expect(later.every((row) => row.time <= parent.time + 35)).toBe(true);
  });

  it("aggregates OHLC without mixing buckets", () => {
    const rolled = aggregateBars(
      [bar(0, 10, 12, 9, 11, 1), bar(60, 11, 15, 8, 14, 2), bar(120, 14, 14, 13, 13, 3)],
      120,
    );
    expect(rolled).toEqual([
      bar(0, 10, 15, 8, 14, 3),
      bar(120, 14, 14, 13, 13, 3),
    ]);
  });
});

describe("session densify", () => {
  it("does not emit a candle after the current bucket", () => {
    vi.spyOn(Date, "now").mockReturnValue(SATURDAY);
    const now = Math.floor(SATURDAY / 1000);
    const step = 30;
    const wall = now - (now % step);
    const rows = densifySessionBars(
      gold,
      [bar(wall - 60, 10, 12, 9, 11), bar(wall + 90, 11, 20, 11, 19)],
      step,
    );
    expect(rows.every((row) => row.time <= wall)).toBe(true);
    expect(new Set(rows.map((row) => row.time)).size).toBe(rows.length);
    expect(rows[rows.length - 1]?.close).toBe(19);
    vi.restoreAllMocks();
  });
});

describe("history page size", () => {
  it("asks for enough 4h bars to fill the viewport and a short page for seconds", () => {
    expect(firstHistoryPage(30)).toBe(240);
    expect(firstHistoryPage(60)).toBe(500);
    expect(firstHistoryPage(300)).toBe(1_800);
    expect(firstHistoryPage(1_800)).toBe(800);
    expect(firstHistoryPage(14_400)).toBe(1_200);
    expect(historyFetchLimit(300, 14_400)).toBe(1_200);
  });
});

describe("timeframe cache", () => {
  it("does not let 30s history replace the real 1m or 30m candles", async () => {
    const start = 1_700_000_000;
    const minutes = Array.from({ length: 40 }, (_, i) =>
      bar(start + i * 60, 100 + i, 101 + i, 99 + i, 100.5 + i),
    );
    const seconds = minutes.flatMap((row) => [
      bar(row.time, 999, 999, 999, 999),
      bar(row.time + 30, 999, 999, 999, 999),
    ]);
    const halfHours = [bar(start, 100, 140, 99, 139.5, 40)];
    const calls: string[] = [];
    const provider: MarketDataProvider = {
      id: "fake",
      isSynthetic: false,
      supports: () => true,
      nativeIntervals: () => ["1", "30", "30S"],
      fetchBars: async (_symbol, interval) => {
        calls.push(interval);
        if (interval === "30S") return seconds;
        if (interval === "1") return minutes;
        if (interval === "30") return halfHours;
        return [];
      },
      subscribeBars: () => () => undefined,
    };
    const service = new MarketDataService([provider], { warn: () => undefined });
    const range = { from: start, to: start + 40 * 60, countBack: 40 };
    await service.fetchHistory(gold, "1", range);
    await service.fetchHistory(gold, "30S", { ...range, to: range.to + 30 });
    const again = await service.fetchHistory(gold, "1", { ...range, to: range.to + 40 });
    expect(again.bars.some((row) => row.close === 999)).toBe(false);
    expect(again.bars[again.bars.length - 1]?.close).toBe(minutes[minutes.length - 1]?.close);
    expect(calls.filter((interval) => interval === "1").length).toBeGreaterThanOrEqual(1);

    const half = await service.fetchHistory(gold, "30", { from: start, to: start + 3_600, countBack: 10 });
    expect(half.bars.some((row) => row.close === 999)).toBe(false);
    expect(half.bars[half.bars.length - 1]?.close).toBe(139.5);
  });
});

describe("chart history and the live candle", () => {
  const librarySymbol = {
    ticker: "FOREXCOM:XAUUSD",
    name: "XAUUSD",
    exchange: "FOREXCOM",
    type: "forex",
    session: "1800-1700",
    timezone: "America/New_York",
    minmov: 1,
    pricescale: 100,
    has_intraday: true,
    has_seconds: true,
    description: "Gold",
    format: "price",
  } as LibrarySymbolInfo;

  function feed(history: Bar[], live: { push: (bar: Bar) => void }) {
    const provider: MarketDataProvider = {
      id: "fake",
      isSynthetic: false,
      supports: () => true,
      nativeIntervals: () => ["1", "30S"],
      fetchBars: async () => history,
      subscribeBars: (_symbol, _interval, onBar) => {
        live.push = onBar;
        return () => undefined;
      },
    };
    return new TradingViewDatafeed(
      new MarketDataService([provider], { warn: () => undefined }),
      new StaticSymbolRepository(),
    );
  }

  function load(datafeed: TradingViewDatafeed, resolution: string, to: number): Promise<Bar[]> {
    const params = { from: 0, to, countBack: 50, firstDataRequest: true } as PeriodParams;
    return new Promise((resolve, reject) => {
      datafeed.getBars(
        librarySymbol,
        resolution as never,
        params,
        (bars) => resolve(bars as unknown as Bar[]),
        (reason) => reject(new Error(reason)),
      );
    });
  }

  it("does not return a candle past the current bucket", async () => {
    vi.spyOn(Date, "now").mockReturnValue(SATURDAY);
    const now = Math.floor(SATURDAY / 1000);
    const wall = now - (now % 30);
    const live = { push: (_bar: Bar) => undefined };
    const datafeed = feed([bar(wall - 60, 10, 11, 9, 10.5), bar(wall + 120, 50, 80, 40, 70)], live);
    const bars = await load(datafeed, "30S", wall + 300);
    expect(bars.length).toBeGreaterThan(0);
    expect(bars.every((row) => row.time / 1000 <= wall)).toBe(true);
    vi.restoreAllMocks();
  });

  it("walks a 30s gap so the left chart can accept the live price", async () => {
    vi.spyOn(Date, "now").mockReturnValue(SATURDAY);
    const now = Math.floor(SATURDAY / 1000);
    const wall = now - (now % 30);
    const live = { push: (_bar: Bar) => undefined };
    const datafeed = feed(
      [bar(wall - 120, 10, 11, 9, 10), bar(wall - 90, 10, 11, 9, 10.2), bar(wall - 60, 10.2, 11, 10, 10.4)],
      live,
    );
    await load(datafeed, "30S", wall + 120);
    const ticks: Bar[] = [];
    datafeed.subscribeBars(librarySymbol, "30S" as never, (bar) => ticks.push(bar as unknown as Bar), "pane-left");
    live.push(bar(wall, 10.4, 12, 10.4, 11.5));
    const times = ticks.map((row) => row.time / 1000);
    expect(times).toContain(wall - 30);
    expect(times[times.length - 1]).toBe(wall);
    expect(ticks[ticks.length - 1]?.close).toBe(11.5);
    for (let i = 1; i < times.length; i += 1) {
      expect(times[i]! - times[i - 1]!).toBeLessThanOrEqual(30);
    }
    vi.restoreAllMocks();
  });

  it("lets the first history page replace a tick that arrived too early", async () => {
    vi.spyOn(Date, "now").mockReturnValue(SATURDAY);
    const now = Math.floor(SATURDAY / 1000);
    const wall = now - (now % 30);
    const live = { push: (_bar: Bar) => undefined };
    const datafeed = feed([bar(wall - 90, 10, 11, 9, 10), bar(wall - 60, 10, 11, 9, 10.4)], live);
    const early: Bar[] = [];
    datafeed.subscribeBars(librarySymbol, "30S" as never, (bar) => early.push(bar as unknown as Bar), "early");
    live.push(bar(wall, 10, 11, 9, 11));
    expect(early[early.length - 1]?.time).toBe(wall * 1000);
    await load(datafeed, "30S", wall + 120);
    const before = early.length;
    live.push(bar(wall, 10, 12, 9, 11.25));
    const ticks = early.slice(before);
    expect(ticks.map((row) => row.time / 1000)).toContain(wall - 30);
    expect(ticks[ticks.length - 1]?.close).toBe(11.25);
    vi.restoreAllMocks();
  });

  it("paints a late quote on the open candle instead of an older one", async () => {
    vi.spyOn(Date, "now").mockReturnValue(SATURDAY);
    const now = Math.floor(SATURDAY / 1000);
    const wall = now - (now % 60);
    const live = { push: (_bar: Bar) => undefined };
    const datafeed = feed([bar(wall, 3460, 3462, 3458, 3461)], live);
    await load(datafeed, "1", wall + 120);
    const ticks: Bar[] = [];
    datafeed.subscribeBars(librarySymbol, "1" as never, (bar) => ticks.push(bar as unknown as Bar), "one-minute");
    live.push(bar(wall - 60, 3450, 3455, 3440, 3452));
    expect(ticks).toHaveLength(1);
    expect(ticks[0]?.time).toBe(wall * 1000);
    expect(ticks[0]?.close).toBe(3452);
    expect(ticks[0]?.open).toBe(3460);
    expect(ticks[0]?.high).toBeGreaterThanOrEqual(3462);
    expect(ticks[0]?.low).toBeLessThanOrEqual(3452);
    vi.restoreAllMocks();
  });
});

describe("FOREXCOM gold history on the dev host", () => {
  const host = "https://91.107.171.162/crypto-chart/history";

  async function load(interval: string, limit: number): Promise<Bar[]> {
    const previous = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    try {
      const response = await fetch(`${host}?symbol=xauusd&interval=${encodeURIComponent(interval)}&limit=${limit}`);
      if (!response.ok) throw new Error(`${interval} history HTTP ${response.status}`);
      const body = (await response.json()) as { bars?: number[][] };
      return (body.bars ?? []).map(([time, open, high, low, close, volume]) => ({
        time: Number(time),
        open: Number(open),
        high: Number(high),
        low: Number(low),
        close: Number(close),
        volume: Number(volume ?? 0),
      }));
    } finally {
      if (previous === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      else process.env.NODE_TLS_REJECT_UNAUTHORIZED = previous;
    }
  }

  function problems(rows: readonly Bar[], step: number, label: string): string[] {
    const issues: string[] = [];
    if (rows.length < 10) issues.push(`${label}: only ${rows.length} bars`);
    const now = Math.floor(Date.now() / 1000);
    let previous = 0;
    for (const row of rows) {
      if (!(row.high >= row.low && row.high >= row.open && row.high >= row.close && row.low <= row.open && row.low <= row.close)) {
        issues.push(`${label}: broken OHLC at ${row.time} o${row.open} h${row.high} l${row.low} c${row.close}`);
      }
      if (row.close < 500 || row.close > 20_000) issues.push(`${label}: gold close ${row.close} at ${row.time}`);
      if (row.time % step !== 0) issues.push(`${label}: ${row.time} is off the ${step}s grid`);
      if (previous && row.time <= previous) issues.push(`${label}: time went backwards at ${row.time}`);
      if (row.time > now + step) issues.push(`${label}: future bar ${row.time}`);
      previous = row.time;
    }
    const last = rows[rows.length - 1];
    if (last && now - last.time > step * 3) {
      issues.push(`${label}: last bar is ${now - last.time}s behind the clock`);
    }
    return issues;
  }

  it("serves a fresh, ordered, OHLC-valid gold series for 1m, 5m, 30m, 1h and 4h", async () => {
    vi.restoreAllMocks();
    const [one, five, thirty, hour, four] = await Promise.all([
      load("1", 180),
      load("5", 80),
      load("30", 48),
      load("60", 48),
      load("240", 40),
    ]);
    const issues = [
      ...problems(one, 60, "1m"),
      ...problems(five, 300, "5m"),
      ...problems(thirty, 1_800, "30m"),
      ...problems(hour, 3_600, "1h"),
      ...problems(four, 14_400, "4h"),
    ];
    const complete = (rows: readonly Bar[], step: number) => rows.filter((row) => row.time + step <= (one[one.length - 1]?.time ?? 0) + 60);
    for (const [rows, step, label] of [
      [five, 300, "5m"],
      [thirty, 1_800, "30m"],
      [hour, 3_600, "1h"],
      [four, 14_400, "4h"],
    ] as const) {
      const closed = complete(rows, step);
      const bucket = closed[closed.length - 1];
      if (!bucket) continue;
      const inside = one.filter((row) => row.time >= bucket.time && row.time < bucket.time + step);
      const lastMinute = inside[inside.length - 1];
      if (lastMinute && Math.abs(lastMinute.close - bucket.close) > 0.05) {
        issues.push(`${label} close ${bucket.close} disagrees with 1m close ${lastMinute.close} at ${bucket.time}`);
      }
    }
    let previous = one[0]?.time ?? 0;
    for (const row of one.slice(1)) {
      const gap = row.time - previous;
      if (gap > 180) issues.push(`1m hole of ${gap}s before ${row.time}`);
      previous = row.time;
    }
    expect(issues).toEqual([]);
  });
});

describe("resample", () => {
  it("rolls five 1m candles into one 5m candle", () => {
    const start = 1_700_000_100;
    const minutes = [0, 1, 2, 3, 4].map((i) => bar(start + i * 60, 10 + i, 20, 5, 12 + i, 1));
    const rolled = resampleBars(minutes, 300);
    expect(rolled).toEqual([bar(start, 10, 20, 5, 16, 5)]);
  });
});
