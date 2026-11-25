import { afterEach, describe, expect, it, vi } from "vitest";
import {
  alignToInterval,
  intervalSeconds,
  isMarketSessionOpen,
  normalizeBars,
  parseInterval,
  resampleBars,
  upsertBar,
  type Bar,
  type SymbolInfo,
} from "@/domain";
import { formingBarFromOhlc, priceAlongOhlcPath } from "@/domain/market/ohlc-path";
import { MarketDataService } from "@/application";
import type { MarketDataProvider } from "@/application";
import { presentCandleSeries } from "@/infrastructure/market-data/candle-series";
import { alignFxDailyBars, alignFxSessionDailyTime, mongoHistoryPlan, targetHistoryDepth } from "@/infrastructure/market-data/cp-chart-history";
import { fillSingleHourGaps } from "@/infrastructure/market-data/hour-gaps";
import {
  brokerGapWindows,
  fillInsideHoles,
  overlayBrokerCandles,
} from "@/infrastructure/market-data/germany-market-provider";
import {
  firstHistoryPage,
  historyFetchLimit,
  historyTimeoutMs,
  isLiveHistoryPage,
  isTfSwitching,
  markTfSwitch,
} from "@/infrastructure/market-data/history-page";
import { canonicalizeBar, collapseDailyBars, sessionDailyOpen } from "@/infrastructure/market-data/session-bars";
import { densifySessionBars, liveCarryBars, unionFillBars } from "@/infrastructure/market-data/session-fill";
import {
  liveSecondUpdate,
  presentSecondBars,
  synthesizeFromMinuteBars,
  synthesizeSecondsFromMinute,
} from "@/infrastructure/market-data/synthesize-seconds";
import { appendLive, packNewestWindow, prependOlder, slicePacked } from "@/infrastructure/market-data/tse-pack";
import { marketTicksChannelFor, tradingViewSymbolFor } from "@/infrastructure/market-data/tv-broker-symbols";
import { volumeDelta, type VolumeCursor } from "@/infrastructure/market-data/volume-delta";
import { canonicalInterval, intervalFromLabel } from "@/features/chart/tv-layers-header";
import { StaticSymbolRepository } from "@/infrastructure/symbols/static-symbol-repository";
import { TradingViewDatafeed } from "@/infrastructure/tradingview/datafeed";
import type { LibrarySymbolInfo, PeriodParams } from "@/infrastructure/tradingview/types";

afterEach(() => {
  vi.restoreAllMocks();
});

function bar(time: number, open: number, high: number, low: number, close: number, volume = 1): Bar {
  return { time, open, high, low, close, volume };
}

function assertOhlc(rows: readonly Bar[]): void {
  for (const row of rows) {
    expect(row.high).toBeGreaterThanOrEqual(row.low);
    expect(row.high).toBeGreaterThanOrEqual(Math.max(row.open, row.close));
    expect(row.low).toBeLessThanOrEqual(Math.min(row.open, row.close));
  }
}

const gold: SymbolInfo = {
  ticker: "XAUUSD",
  name: "Gold",
  exchange: "FOREXCOM",
  type: "forex",
  pricePrecision: 2,
  session: "1800-1700",
  timezone: "America/New_York",
};

const crypto: SymbolInfo = {
  ticker: "BTCUSDT",
  name: "Bitcoin",
  exchange: "BINANCE",
  type: "crypto",
  pricePrecision: 2,
  session: "24x7",
  timezone: "Etc/UTC",
};

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

describe("interval corners", () => {
  it("parses seconds, minutes, days, weeks, months, and falls back on garbage", () => {
    expect(parseInterval("1S")).toMatchObject({ unit: "seconds", seconds: 1 });
    expect(parseInterval("45S").seconds).toBe(45);
    expect(parseInterval("15").seconds).toBe(900);
    expect(parseInterval("240").seconds).toBe(14_400);
    expect(parseInterval("1D").unit).toBe("days");
    expect(parseInterval("2W").seconds).toBe(2 * 604_800);
    expect(parseInterval("3M").unit).toBe("months");
    expect(parseInterval("nope").seconds).toBe(intervalSeconds("15"));
    expect(alignToInterval(1_700_000_100, "5")).toBe(1_700_000_100);
  });

  it("keeps a lowercase minute label on minutes and a month suffix on months", () => {
    expect(canonicalInterval("1m")).toBe("1");
    expect(canonicalInterval("1M")).toBe("1M");
    expect(canonicalInterval("30s")).toBe("30S");
    expect(canonicalInterval("30")).toBe("30");
    expect(canonicalInterval("4h")).toBe("240");
    expect(intervalFromLabel("45 seconds")).toBe("45S");
    expect(intervalFromLabel("4 hours")).toBe("240");
    expect(intervalFromLabel("1 day")).toBe("1D");
    expect(intervalFromLabel("1 week")).toBe("1W");
    expect(intervalFromLabel("1 month")).toBe("1M");
    expect(intervalFromLabel("")).toBeNull();
  });

  it("maps chart intervals onto Mongo parents", () => {
    expect(mongoHistoryPlan("30S")).toBeNull();
    expect(mongoHistoryPlan("1")).toEqual({ timeframe: "1m", group: 1 });
    expect(mongoHistoryPlan("5")).toEqual({ timeframe: "1m", group: 5 });
    expect(mongoHistoryPlan("30")).toEqual({ timeframe: "1m", group: 30 });
    expect(mongoHistoryPlan("60")).toEqual({ timeframe: "1h", group: 1 });
    expect(mongoHistoryPlan("240")).toEqual({ timeframe: "1h", group: 4 });
    expect(mongoHistoryPlan("1D")).toEqual({ timeframe: "1d", group: 1 });
    expect(mongoHistoryPlan("1W")).toEqual({ timeframe: "1d", group: 7 });
    expect(mongoHistoryPlan("1M")).toEqual({ timeframe: "1d", group: 30 });
    expect(targetHistoryDepth("1S")).toBe(20_000);
    expect(targetHistoryDepth("1")).toBe(20_000);
    expect(targetHistoryDepth("5")).toBe(10_000);
    expect(targetHistoryDepth("15")).toBe(5_000);
  });

  it("sizes the first page and tells a fresh page from a scroll page", () => {
    expect(firstHistoryPage(1)).toBe(240);
    expect(firstHistoryPage(60)).toBe(500);
    expect(historyFetchLimit(10, 60)).toBe(10);
    expect(historyFetchLimit(300, 14_400)).toBe(1_200);
    expect(historyFetchLimit(9_000, 60)).toBe(5_000);
    expect(historyTimeoutMs(100)).toBe(2_500);
    expect(historyTimeoutMs(800)).toBe(5_000);
    expect(historyTimeoutMs(2_000)).toBe(14_000);
    const now = Math.floor(Date.now() / 1000);
    expect(isLiveHistoryPage({ to: now, countBack: 300 })).toBe(true);
    expect(isLiveHistoryPage({ to: now - 5 * 3_600, countBack: 300 })).toBe(false);
    expect(isLiveHistoryPage({ to: now, countBack: 4_000 })).toBe(false);
    markTfSwitch();
    expect(isTfSwitching()).toBe(true);
  });
});

describe("session clock", () => {
  it("closes gold on Saturday, before Sunday 18:00, Friday after 17:00, and the daily break", () => {
    const at = (iso: string) => Date.parse(iso);
    expect(isMarketSessionOpen(gold, at("2026-11-28T16:00:00Z"))).toBe(false);
    expect(isMarketSessionOpen(gold, at("2026-11-29T21:00:00Z"))).toBe(false);
    expect(isMarketSessionOpen(gold, at("2026-11-29T23:30:00Z"))).toBe(true);
    expect(isMarketSessionOpen(gold, at("2026-11-27T21:30:00Z"))).toBe(true);
    expect(isMarketSessionOpen(gold, at("2026-11-27T22:00:00Z"))).toBe(false);
    expect(isMarketSessionOpen(gold, at("2026-11-24T22:30:00Z"))).toBe(false);
    expect(isMarketSessionOpen(gold, at("2026-11-24T23:05:00Z"))).toBe(true);
    expect(isMarketSessionOpen(crypto, at("2026-11-28T16:00:00Z"))).toBe(true);
  });
});

describe("candle shaping", () => {
  it("drops invalid bars, keeps the last duplicate, and merges a tick without wiping the wick", () => {
    const rows = normalizeBars([
      bar(60, 10, 11, 9, 10),
      bar(60, 10, 12, 8, 11),
      bar(120, 1, 1, 2, 1),
    ]);
    expect(rows).toEqual([bar(60, 10, 12, 8, 11)]);
    const merged = upsertBar(rows, bar(60, 99, 11, 11, 10.5));
    expect(merged[0]?.open).toBe(10);
    expect(merged[0]?.high).toBeGreaterThanOrEqual(12);
    expect(merged[0]?.close).toBe(10.5);
    expect(upsertBar(rows, bar(30, 1, 1, 1, 1))).toEqual(rows);
    expect(resampleBars([], 300)).toEqual([]);
  });

  it("snaps an off-grid print onto its candle and does not invent the missing minute", () => {
    const rows = fillSingleHourGaps([bar(125, 3, 4, 2, 3.5), bar(60, 1, 2, 1, 1.5), bar(61, 1.5, 5, 1, 4)], 60);
    expect(rows.map((row) => row.time)).toEqual([60, 120]);
    expect(rows[0]).toMatchObject({ open: 1, high: 5, low: 1, close: 4 });
    expect(rows[1]?.close).toBe(3.5);
  });

  it("fills a traded hole and leaves the New York break and Saturday empty", () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-11-24T21:30:00Z"));
    const open = Math.floor(Date.parse("2026-11-24T21:00:00Z") / 1000);
    const filled = densifySessionBars(gold, [bar(open, 10, 11, 9, 10.5), bar(open + 180, 10.5, 12, 10, 11)], 60);
    expect(filled.map((row) => row.time)).toEqual([open, open + 60, open + 120, open + 180]);
    expect(filled[1]?.close).toBe(10.5);

    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-11-28T16:00:00Z"));
    const sat = Math.floor(Date.parse("2026-11-28T15:00:00Z") / 1000);
    const weekend = densifySessionBars(gold, [bar(sat, 1, 2, 1, 1.5), bar(sat + 300, 2, 3, 1, 2)], 60);
    expect(weekend.map((row) => row.time)).toEqual([sat, sat + 300]);

    const carry = liveCarryBars(gold, bar(open, 10, 11, 9, 10), open + 180, 60);
    expect(carry.map((row) => row.time)).toEqual([open + 60, open + 120]);
    const breakStart = Math.floor(Date.parse("2026-11-24T21:50:00Z") / 1000);
    const acrossBreak = liveCarryBars(gold, bar(breakStart, 1, 1, 1, 1), breakStart + 30 * 60, 60);
    expect(acrossBreak.some((row) => row.time === breakStart + 20 * 60)).toBe(false);
  });

  it("drops the 17:00 New York bar and keeps the candles around it", () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-11-24T23:30:00Z"));
    const before = Math.floor(Date.parse("2026-11-24T21:00:00Z") / 1000);
    const pause = Math.floor(Date.parse("2026-11-24T22:30:00Z") / 1000);
    const after = Math.floor(Date.parse("2026-11-24T23:05:00Z") / 1000);
    const shown = presentCandleSeries(
      gold,
      "1",
      [bar(before, 10, 11, 9, 10), bar(pause, 10, 11, 9, 8), bar(after, 12, 13, 11, 12.5)],
      60,
    );
    expect(shown.some((row) => row.time === pause)).toBe(false);
    expect(shown[0]?.close).toBe(10);
    expect(shown[shown.length - 1]?.close).toBe(12.5);
    expect(shown.every((row) => row.time <= after)).toBe(true);
  });

  it("puts a broker candle only in a hole and keeps the stored price beside it", () => {
    const primary = [bar(0, 10, 11, 9, 10), bar(180, 12, 13, 11, 12)];
    const fill = [bar(60, 10, 10.2, 9.8, 10.1), bar(0, 99, 99, 99, 99)];
    const merged = fillInsideHoles(primary, fill, 60);
    expect(merged.map((row) => row.close)).toEqual([10, 10.1, 12]);
    expect(brokerGapWindows([bar(0, 10, 11, 9, 10), bar(60, 14, 15, 13, 14)], 60)).toEqual([[0, 120]]);
    expect(brokerGapWindows([bar(0, 10, 11, 9, 10), bar(20 * 3_600, 10, 11, 9, 10)], 60)).toEqual([]);
    const overlaid = overlayBrokerCandles(primary, [bar(0, 20, 22, 8, 21)], 0, 60);
    expect(overlaid[0]).toMatchObject({ open: 20, high: 22, low: 8, close: 21 });
    expect(overlaid[1]).toEqual(primary[1]);
    expect(unionFillBars(primary, [bar(60, 1, 1, 1, 1)], 60).map((row) => row.time)).toEqual([0, 60, 180]);
  });
});

describe("daily session stamp", () => {
  it("moves an 18:00 New York gold daily onto the 17:00 session open", () => {
    const winter = Math.floor(Date.parse("2026-11-22T23:00:00Z") / 1000);
    const summer = Math.floor(Date.parse("2026-07-15T22:00:00Z") / 1000);
    const winterOpen = alignFxSessionDailyTime(winter);
    const summerOpen = alignFxSessionDailyTime(summer);
    expect(new Date(winterOpen * 1000).toLocaleString("en-US", { timeZone: "America/New_York", hour: "2-digit", hourCycle: "h23" })).toBe("17");
    expect(new Date(summerOpen * 1000).toLocaleString("en-US", { timeZone: "America/New_York", hour: "2-digit", hourCycle: "h23" })).toBe("17");
    expect(alignFxSessionDailyTime(winterOpen)).toBe(winterOpen);
    const collapsed = alignFxDailyBars([
      bar(winter, 1, 3, 1, 2),
      bar(winterOpen, 1, 4, 0.5, 2.5),
    ]);
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0]?.time).toBe(winterOpen);
    expect(collapseDailyBars(gold, "1D", [bar(winter, 1, 3, 1, 2), bar(winterOpen, 1, 4, 0.5, 2.5)])).toHaveLength(1);
    expect(canonicalizeBar(gold, "1", bar(winter, 1, 2, 1, 1.5)).time).toBe(winter);
    expect(sessionDailyOpen(gold, winter)).toBe(winterOpen);
  });
});

describe("seconds from the 1-minute candle", () => {
  const bull = bar(1_700_000_040, 100, 110, 90, 106, 60);
  const bear = bar(1_700_000_100, 106, 112, 95, 98, 60);

  it("covers both directions and snaps an off-grid minute", () => {
    for (const parent of [bull, bear]) {
      const seconds = synthesizeSecondsFromMinute(parent);
      expect(seconds).toHaveLength(60);
      expect(seconds[0]?.open).toBe(parent.open);
      expect(seconds[59]?.close).toBe(parent.close);
      expect(Math.max(...seconds.map((row) => row.high))).toBe(parent.high);
      expect(Math.min(...seconds.map((row) => row.low))).toBe(parent.low);
      assertOhlc(seconds);
    }
    const shifted = synthesizeFromMinuteBars([bar(bull.time + 7, bull.open, bull.high, bull.low, bull.close, 60)], 30);
    expect(shifted[0]?.time).toBe(bull.time);
    assertOhlc(shifted);
  });

  it("builds 5s, 15s, 30s and 45s without a future second", () => {
    for (const step of [5, 15, 30, 45]) {
      const rows = presentSecondBars([bull], step, bull.time + 12);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((row) => row.time <= bull.time + 12 && row.time % step === 0)).toBe(true);
      expect(rows[rows.length - 1]?.close).toBe(bull.close);
      assertOhlc(rows);
    }
    const rolled = liveSecondUpdate(bear, 15, bear.time + 16, bear.time);
    expect(rolled[0]?.time).toBe(bear.time);
    expect(rolled[rolled.length - 1]?.time).toBe(bear.time + 15);
    expect(rolled[rolled.length - 1]?.close).toBe(bear.close);
    assertOhlc(rolled);
  });

  it("stays inside the parent wick along the replay path", () => {
    for (const t of [0, 0.14, 0.32, 0.5, 0.68, 0.86, 1]) {
      const px = priceAlongOhlcPath(bull, t);
      expect(px).toBeGreaterThanOrEqual(bull.low);
      expect(px).toBeLessThanOrEqual(bull.high);
    }
    expect(Math.abs(priceAlongOhlcPath(bull, 0) - bull.open)).toBeLessThan(bull.high - bull.low);
    expect(priceAlongOhlcPath(bull, 1)).toBeCloseTo(bull.close, 5);
    const formed = formingBarFromOhlc(bull, 1);
    expect(formed).toMatchObject({ open: bull.open, high: bull.high, low: bull.low, close: bull.close });
    const partial = formingBarFromOhlc(bull, 0.4);
    assertOhlc([partial]);
    expect(partial.high).toBeLessThanOrEqual(bull.high);
    expect(partial.low).toBeGreaterThanOrEqual(bull.low);
  });
});

describe("Tehran packing and volume", () => {
  it("closes a missing minute without moving bars already on the chart", () => {
    const first = packNewestWindow([bar(1_000, 1, 2, 1, 1.5), bar(1_180, 2, 3, 1, 2)], 60);
    expect(first.packed.map((row) => row.time)).toEqual([1_120, 1_180]);
    expect(first.real.map((row) => row.time)).toEqual([1_000, 1_180]);
    const withOlder = prependOlder(first, [bar(800, 1, 1, 1, 1), bar(1_180, 9, 9, 9, 9)]);
    expect(withOlder.packed.slice(1).map((row) => row.time)).toEqual([1_120, 1_180]);
    const live = appendLive(withOlder, bar(1_180, 2, 4, 1, 3));
    expect(live.packed.time).toBe(1_180);
    expect(live.packed.close).toBe(3);
    const opened = appendLive(live.series, bar(1_300, 3, 3, 3, 3.2));
    expect(opened.packed.time).toBe(1_240);
    expect(slicePacked(opened.series, 1_240, 2, false).map((row) => row.time)).toEqual([1_120, 1_180]);
    expect(slicePacked(opened.series, 0, 2, true)).toHaveLength(2);
  });

  it("turns a session total into the print inside this candle", () => {
    const cursor: VolumeCursor = { last: null };
    expect(volumeDelta(cursor, 1_000)).toBe(0);
    expect(volumeDelta(cursor, 1_040)).toBe(40);
    expect(volumeDelta(cursor, 1_040)).toBe(0);
    expect(volumeDelta(cursor, 10)).toBe(0);
    const trades: VolumeCursor = { last: 5 };
    expect(volumeDelta(trades, 4)).toBe(4);
    expect(volumeDelta({ last: 5 }, 0)).toBe(0);
  });
});

describe("symbol routing", () => {
  it("keeps FOREXCOM gold on the Germany book and routes other brokers to TradingView", () => {
    expect(tradingViewSymbolFor(gold)).toBeNull();
    expect(
      tradingViewSymbolFor({ ...gold, ticker: "EURUSD" }),
    ).toBe("FOREXCOM:EURUSD");
    expect(
      marketTicksChannelFor({ ...gold, ticker: "EURUSD" }),
    ).toBe("forex:eurusd:FOREXCOM");
    expect(
      tradingViewSymbolFor({ ...gold, exchange: "IG", ticker: "NAS100", type: "index" }),
    ).toBe("IG:NASDAQ");
    expect(
      tradingViewSymbolFor({ ...gold, exchange: "FXCM", ticker: "EURUSD" }),
    ).toBe("FOREXCOM:EURUSD");
  });
});

describe("provider chain and the chart", () => {
  it("does not paint synthetic candles when a real gold feed answered empty", async () => {
    const calls: string[] = [];
    const real: MarketDataProvider = {
      id: "real",
      isSynthetic: false,
      supports: () => true,
      nativeIntervals: () => ["1"],
      fetchBars: async () => {
        calls.push("real");
        return [];
      },
      subscribeBars: () => () => undefined,
    };
    const synthetic: MarketDataProvider = {
      id: "synthetic",
      isSynthetic: true,
      supports: () => true,
      nativeIntervals: () => ["1"],
      fetchBars: async () => {
        calls.push("synthetic");
        return [bar(60, 1, 1, 1, 1)];
      },
      subscribeBars: () => () => undefined,
    };
    const service = new MarketDataService([real, synthetic], { warn: () => undefined });
    const result = await service.fetchHistory(gold, "1", { from: 0, to: 120, countBack: 10 });
    expect(result.bars).toEqual([]);
    expect(result.isSynthetic).toBe(false);
    expect(calls).toEqual(["real"]);
  });

  it("rolls a cached 1-minute series into 5 minutes and keeps a second symbol separate", async () => {
    const start = 1_700_000_100;
    const minutes = Array.from({ length: 120 }, (_, i) => bar(start + i * 60, i, i + 2, i - 1, i + 1, 1));
    let fetches = 0;
    const provider: MarketDataProvider = {
      id: "fake",
      isSynthetic: false,
      supports: () => true,
      nativeIntervals: () => ["1", "5"],
      fetchBars: async (symbol, interval) => {
        fetches += 1;
        if (symbol.ticker === "BTCUSDT") return [bar(start, 9, 9, 9, 9)];
        if (interval === "1") return minutes;
        return [bar(start, 123, 123, 123, 123)];
      },
      subscribeBars: () => () => undefined,
    };
    const service = new MarketDataService([provider], { warn: () => undefined });
    await service.fetchHistory(gold, "1", { from: start, to: start + 12_000, countBack: 120 });
    const five = await service.fetchHistory(gold, "5", { from: start, to: start + 12_000, countBack: 30 });
    expect(five.providerId).toBe("tf-cache");
    expect(five.bars[five.bars.length - 1]?.close).toBe(120);
    expect(five.bars.some((row) => row.close === 123)).toBe(false);
    const other = await service.fetchHistory(crypto, "1", { from: start, to: start + 120, countBack: 5 });
    expect(other.bars[0]?.close).toBe(9);
    expect(fetches).toBeGreaterThanOrEqual(2);
  });

  function feed(history: Bar[], onSubscribe: (cb: (bar: Bar) => void) => void) {
    const listeners: Array<(bar: Bar) => void> = [];
    const provider: MarketDataProvider = {
      id: "fake",
      isSynthetic: false,
      supports: () => true,
      nativeIntervals: () => ["1", "5", "30S"],
      fetchBars: async () => history,
      subscribeBars: (_symbol, _interval, onBar) => {
        listeners.push(onBar);
        onSubscribe((bar) => {
          for (const listener of listeners) listener(bar);
        });
        return () => {
          const index = listeners.indexOf(onBar);
          if (index >= 0) listeners.splice(index, 1);
        };
      },
    };
    return new TradingViewDatafeed(
      new MarketDataService([provider], { warn: () => undefined }),
      new StaticSymbolRepository(),
    );
  }

  function load(datafeed: TradingViewDatafeed, resolution: string, to: number, first = true): Promise<Bar[]> {
    return new Promise((resolve, reject) => {
      datafeed.getBars(
        librarySymbol,
        resolution as never,
        { from: 0, to, countBack: 20, firstDataRequest: first } as PeriodParams,
        (bars) => resolve(bars as unknown as Bar[]),
        (reason) => reject(new Error(reason)),
      );
    });
  }

  it("returns no data for an empty page and rejects an unknown symbol", async () => {
    const datafeed = feed([], () => undefined);
    const empty = await load(datafeed, "1", 1_700_000_000);
    expect(empty).toEqual([]);
    await expect(
      load(
        new TradingViewDatafeed(
          new MarketDataService(
            [
              {
                id: "fake",
                isSynthetic: false,
                supports: () => true,
                nativeIntervals: () => ["1"],
                fetchBars: async () => [],
                subscribeBars: () => () => undefined,
              },
            ],
            { warn: () => undefined },
          ),
          new StaticSymbolRepository(),
        ),
        "1",
        100,
      ),
    ).resolves.toEqual([]);
    const missing = new TradingViewDatafeed(
      new MarketDataService(
        [
          {
            id: "fake",
            isSynthetic: false,
            supports: () => true,
            nativeIntervals: () => ["1"],
            fetchBars: async () => [],
            subscribeBars: () => () => undefined,
          },
        ],
        { warn: () => undefined },
      ),
      new StaticSymbolRepository(),
    );
    await new Promise<void>((resolve) => {
      missing.getBars(
        { ...librarySymbol, ticker: "NOPE:ZZZ", name: "ZZZ", exchange: "NOPE" },
        "1" as never,
        { from: 0, to: 100, countBack: 10, firstDataRequest: true } as PeriodParams,
        () => resolve(),
        (reason) => {
          expect(reason).toMatch(/Unknown symbol/);
          resolve();
        },
      );
    });
  });

  it("walks a 5-minute gap one step at a time and updates every pane", async () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-11-28T16:10:00Z"));
    const wall = Math.floor(Date.parse("2026-11-28T16:10:00Z") / 1000);
    const step = 300;
    let push: (bar: Bar) => void = () => undefined;
    const datafeed = feed([bar(wall - step * 3, 10, 11, 9, 10), bar(wall - step * 2, 10, 11, 9, 10.4)], (cb) => {
      push = cb;
    });
    await load(datafeed, "5", wall + step);
    const left: Bar[] = [];
    const right: Bar[] = [];
    datafeed.subscribeBars(librarySymbol, "5" as never, (row) => left.push(row as unknown as Bar), "left");
    datafeed.subscribeBars(librarySymbol, "5" as never, (row) => right.push(row as unknown as Bar), "right");
    push(bar(wall, 10.4, 12, 10, 11.7));
    expect(left.map((row) => row.time / 1000)).toEqual([wall - step, wall]);
    expect(right.map((row) => row.close)).toEqual(left.map((row) => row.close));
    expect(left[1]?.close).toBe(11.7);
  });

  it("does not let a 30-minute tail block the 30-second chart", async () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-11-28T16:00:30Z"));
    const now = Math.floor(Date.parse("2026-11-28T16:00:30Z") / 1000);
    const minuteWall = now - (now % 60);
    const secondWall = now - (now % 30);
    let push: (bar: Bar) => void = () => undefined;
    const datafeed = feed([bar(minuteWall, 20, 21, 19, 20.5)], (cb) => {
      push = cb;
    });
    await load(datafeed, "30", minuteWall + 120);
    await load(datafeed, "30S", secondWall + 120);
    const ticks: Bar[] = [];
    datafeed.subscribeBars(librarySymbol, "30S" as never, (row) => ticks.push(row as unknown as Bar), "seconds");
    push(bar(secondWall, 20.5, 22, 20, 21.4));
    expect(ticks[ticks.length - 1]?.time).toBe(secondWall * 1000);
    expect(ticks[ticks.length - 1]?.close).toBe(21.4);
  });
});

describe("live FOREXCOM history", () => {
  async function load(symbol: string, interval: string, limit: number, before?: number): Promise<Bar[]> {
    const previous = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    try {
      const url = new URL("https://91.107.171.162/crypto-chart/history");
      url.searchParams.set("symbol", symbol);
      url.searchParams.set("interval", interval);
      url.searchParams.set("limit", String(limit));
      if (before) url.searchParams.set("before", String(before));
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${symbol} ${interval} HTTP ${response.status}`);
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

  it("serves fresh gold, euro and bitcoin pages that agree across timeframes", async () => {
    const issues: string[] = [];
    const now = Math.floor(Date.now() / 1000);
    for (const symbol of ["xauusd", "eurusd", "btcusdt"]) {
      const one = await load(symbol, "1", 240);
      if (one.length < 100) issues.push(`${symbol} 1m short ${one.length}`);
      let previous = 0;
      for (const row of one) {
        if (!(row.high >= row.low && row.high >= Math.max(row.open, row.close) && row.low <= Math.min(row.open, row.close))) {
          issues.push(`${symbol} bad OHLC ${row.time}`);
        }
        if (row.time % 60 !== 0) issues.push(`${symbol} off grid ${row.time}`);
        if (row.time > now + 60) issues.push(`${symbol} future ${row.time}`);
        if (previous && row.time - previous > 180 && row.time - previous < 36 * 3_600) issues.push(`${symbol} hole ${row.time - previous}s`);
        previous = row.time;
      }
      const last = one[one.length - 1];
      if (last && now - last.time > 180) issues.push(`${symbol} stale ${now - last.time}s`);
      const byTime = new Map(one.map((row) => [row.time, row]));
      for (const [interval, step] of [
        ["5", 300],
        ["15", 900],
        ["60", 3_600],
      ] as const) {
        const rows = await load(symbol, interval, 30);
        const closed = rows.filter((row) => row.time + step <= (last?.time ?? 0) + 60);
        const bucket = closed[closed.length - 1];
        if (!bucket) continue;
        const inside = [...byTime.values()].filter((row) => row.time >= bucket.time && row.time < bucket.time + step);
        if (inside.length < step / 60 - 1) continue;
        const minuteClose = inside[inside.length - 1]!.close;
        if (Math.abs(minuteClose - bucket.close) > 0.05) {
          issues.push(`${symbol} ${interval} close ${bucket.close} vs 1m ${minuteClose}`);
        }
      }
    }
    const page = await load("xauusd", "1", 120);
    const older = await load("xauusd", "1", 120, page[0]?.time);
    if (!older.length || !page.length) issues.push("paging empty");
    else if (older[older.length - 1]!.time >= page[0]!.time) issues.push("paging overlap");
    else if (page[0]!.time - older[older.length - 1]!.time > 180) {
      issues.push(`paging gap ${page[0]!.time - older[older.length - 1]!.time}s`);
    }
    const daily = await load("xauusd", "1D", 30);
    const snapped = alignFxDailyBars(daily);
    expect(new Set(snapped.map((row) => row.time)).size).toBe(snapped.length);
    for (const row of snapped) {
      const hour = new Date(row.time * 1000).toLocaleString("en-US", {
        timeZone: "America/New_York",
        hour: "2-digit",
        hourCycle: "h23",
      });
      if (hour !== "17") issues.push(`daily session ${hour} at ${row.time}`);
    }
    const unknown = await load("not-a-symbol", "1", 5);
    expect(unknown).toEqual([]);
    expect(issues).toEqual([]);
  }, 60_000);
});
