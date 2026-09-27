import { createStore, type Store } from "@/application";
import type { Bar } from "@/domain";
import type { TradingViewDatafeed } from "@/infrastructure/tradingview/datafeed";
import type { IChartingLibraryWidget } from "@/infrastructure/tradingview";
import type { DemoTradingService } from "./demo-trading-service";

export interface DemoSpaceControllerState {
  readonly active: boolean;
  readonly loading: boolean;
  readonly error: string | null;
  readonly startTimeSec: number | null;
  readonly cursorIndex: number;
  readonly bufferLength: number;
  readonly symbol: string;
  readonly resolution: string;
  /** Milliseconds between closed bars (matches chart timeframe). */
  readonly stepMs: number;
}

const INITIAL: DemoSpaceControllerState = {
  active: false,
  loading: false,
  error: null,
  startTimeSec: null,
  cursorIndex: -1,
  bufferLength: 0,
  symbol: "",
  resolution: "5",
  stepMs: 5 * 60_000,
};

/** Chart resolution → real duration of one candle in ms (demo space = live pace). */
export function resolutionToStepMs(res: string): number {
  const r = res.trim().toUpperCase();
  if (/^\d+$/.test(r)) return Math.max(1_000, Number(r) * 60_000);
  if (r === "1S" || r === "S") return 1_000;
  if (r.endsWith("S") && /^\d+S$/.test(r)) return Math.max(1_000, Number(r.slice(0, -1)) * 1_000);
  if (r === "1D" || r === "D") return 24 * 60 * 60_000;
  if (r === "1W" || r === "W") return 7 * 24 * 60 * 60_000;
  if (r === "1M" || r === "M") return 30 * 24 * 60 * 60_000;
  if (r === "3M") return 90 * 24 * 60 * 60_000;
  if (r === "12M" || r === "1Y") return 365 * 24 * 60 * 60_000;
  return 60_000;
}

function resolutionToSec(res: string): number {
  return Math.max(1, Math.floor(resolutionToStepMs(res) / 1000));
}

/**
 * Historical “demo trading space”: cut the chart at a chosen date, keep all
 * prior candles visible, then advance one closed bar per real timeframe
 * duration (5m → every 5 minutes). No pause — deactivate to exit.
 */
export class DemoSpaceController {
  readonly state: Store<DemoSpaceControllerState> = createStore(INITIAL);

  private widget: IChartingLibraryWidget | null = null;
  private datafeed: TradingViewDatafeed | null = null;
  private demo: DemoTradingService | null = null;
  private buffer: Bar[] = [];
  private timer = 0;

  attach(
    widget: IChartingLibraryWidget,
    datafeed: TradingViewDatafeed,
    demo: DemoTradingService,
  ): void {
    this.widget = widget;
    this.datafeed = datafeed;
    this.demo = demo;
  }

  detach(): void {
    void this.deactivate();
    this.widget = null;
    this.datafeed = null;
    this.demo = null;
  }

  async activate(startTimeSec: number): Promise<void> {
    const widget = this.widget;
    const datafeed = this.datafeed;
    const demo = this.demo;
    if (!widget || !datafeed || !demo) {
      this.patch({ error: "Chart not ready" });
      return;
    }

    this.stopTimer();
    this.patch({ loading: true, error: null, active: true, startTimeSec });

    try {
      datafeed.endReplay();
    } catch {
      /* ignore */
    }

    let symbol = "XAUUSD";
    let resolution = "5";
    try {
      const chart = widget.activeChart();
      symbol = chart.symbol();
      resolution = String(chart.resolution());
    } catch {
      /* ignore */
    }
    const bare = symbol.includes(":") ? symbol.slice(symbol.lastIndexOf(":") + 1) : symbol;
    const stepMs = resolutionToStepMs(resolution);
    const barSec = resolutionToSec(resolution);

    datafeed.beginReplay();
    // Prefetch deep history so bars BEFORE the start date are available.
    let buffer = await datafeed.fetchReplayBuffer(bare, resolution, 12_000);
    if (buffer.length === 0) {
      try {
        const exported = await widget.activeChart().exportData({
          includeTime: true,
          includeSeries: true,
          includedStudies: [],
        });
        buffer = barsFromExport(exported);
      } catch {
        buffer = [];
      }
    }

    if (buffer.length === 0) {
      datafeed.endReplay();
      this.patch({
        active: false,
        loading: false,
        error: "No historical bars available for demo space",
      });
      return;
    }

    let index = nearestBarIndex(buffer, startTimeSec);
    if (index < 0) index = 0;
    if (index >= buffer.length - 2) index = Math.max(0, buffer.length - 50);

    // Need prior history on screen — if start is near buffer head, still OK.
    this.buffer = [...buffer];
    const bar = buffer[index]!;
    datafeed.setReplayCutoff(bar.time);

    this.patch({
      active: true,
      loading: false,
      error: null,
      startTimeSec: bar.time,
      cursorIndex: index,
      bufferLength: buffer.length,
      symbol: bare,
      resolution,
      stepMs,
    });

    demo.activateSpace(bare, bar.time, bar.close);

    // Frame historical window, reload, then re-frame after series settles.
    // getServerTime returns cutoff during replay so CL won't pad empty future.
    await this.fitVisibleHistory(bar.time, barSec, index);
    this.reloadSeries();
    await sleep(200);
    await this.fitVisibleHistory(bar.time, barSec, index);
    await sleep(600);
    await this.fitVisibleHistory(bar.time, barSec, index);

    this.startTimer(stepMs);
  }

  async deactivate(): Promise<void> {
    this.stopTimer();
    const datafeed = this.datafeed;
    const widget = this.widget;
    this.demo?.deactivateSpace();
    this.buffer = [];
    if (datafeed) {
      try {
        datafeed.endReplay();
      } catch {
        /* ignore */
      }
    }
    if (widget) {
      try {
        widget.resetCache();
        widget.activeChart().resetData();
      } catch {
        /* ignore */
      }
    }
    this.state.set(INITIAL);
  }

  private async fitVisibleHistory(endTimeSec: number, barSec: number, cursorIndex: number): Promise<void> {
    const widget = this.widget;
    if (!widget) return;
    try {
      const chart = widget.activeChart();
      const available = Math.max(1, cursorIndex + 1);
      const barsOnScreen = Math.min(120, Math.max(60, Math.min(available, 120)));
      const from = endTimeSec - barsOnScreen * barSec;
      const to = endTimeSec + barSec * 2;
      await chart.setVisibleRange({ from, to });
    } catch {
      /* ignore */
    }
  }

  private startTimer(stepMs: number): void {
    this.stopTimer();
    this.timer = window.setInterval(() => {
      void this.advanceOne();
    }, stepMs);
  }

  private stopTimer(): void {
    if (this.timer) {
      window.clearInterval(this.timer);
      this.timer = 0;
    }
  }

  private async advanceOne(): Promise<void> {
    const { cursorIndex, bufferLength, active, resolution } = this.state.get();
    if (!active) return;
    if (cursorIndex < 0 || cursorIndex >= bufferLength - 1) {
      this.stopTimer();
      this.patch({ error: "End of historical data — deactivate to return to live chart" });
      return;
    }
    const next = cursorIndex + 1;
    const bar = this.buffer[next];
    const datafeed = this.datafeed;
    if (!bar || !datafeed) return;

    datafeed.setReplayCutoff(bar.time);
    datafeed.pushReplayBar(bar);
    this.patch({ cursorIndex: next });
    this.demo?.updateSpaceCursor(bar.time, bar.close);

    // Keep the latest bar near the right edge as time advances.
    try {
      const chart = this.widget?.activeChart();
      if (chart) {
        const barSec = resolutionToSec(resolution);
        const range = chart.getVisibleRange();
        if (range && Number.isFinite(range.from) && Number.isFinite(range.to)) {
          const span = range.to - range.from;
          await chart.setVisibleRange({ from: bar.time - span + barSec * 2, to: bar.time + barSec * 2 });
        }
      }
    } catch {
      /* ignore */
    }
  }

  private reloadSeries(): void {
    const widget = this.widget;
    if (!widget) return;
    try {
      widget.resetCache();
      widget.activeChart().resetData();
    } catch {
      /* ignore */
    }
  }

  private patch(partial: Partial<DemoSpaceControllerState>): void {
    this.state.update((s) => ({ ...s, ...partial }));
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function nearestBarIndex(bars: readonly Bar[], timeSec: number): number {
  if (bars.length === 0) return -1;
  let best = 0;
  let bestDist = Math.abs(Number(bars[0]!.time) - timeSec);
  for (let i = 1; i < bars.length; i += 1) {
    const d = Math.abs(Number(bars[i]!.time) - timeSec);
    if (d < bestDist) {
      best = i;
      bestDist = d;
    }
  }
  return best;
}

function barsFromExport(exported: {
  readonly data: ReadonlyArray<ArrayLike<number>>;
  readonly schema: ReadonlyArray<{ readonly type?: string; readonly plotTitle?: string }>;
}): Bar[] {
  const schema = exported.schema;
  const timeIdx = schema.findIndex((s) => s.type === "time");
  const find = (name: string) =>
    schema.findIndex((s) => (s.plotTitle ?? "").toLowerCase() === name);
  const o = find("open");
  const h = find("high");
  const l = find("low");
  const c = find("close");
  if (timeIdx < 0 || o < 0 || h < 0 || l < 0 || c < 0) return [];
  const out: Bar[] = [];
  for (const row of exported.data) {
    const t = Number(row[timeIdx]);
    if (!Number.isFinite(t) || t <= 0) continue;
    const timeSec = t > 1e12 ? Math.floor(t / 1000) : Math.floor(t);
    out.push({
      time: timeSec,
      open: Number(row[o]),
      high: Number(row[h]),
      low: Number(row[l]),
      close: Number(row[c]),
      volume: 0,
    });
  }
  return out;
}
