import { createStore, type Store } from "@/application";
import { formingBarFromOhlc, type Bar } from "@/domain";
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
  /** Milliseconds for one full candle (matches chart timeframe). */
  readonly stepMs: number;
  /** 0–1 progress through the forming candle. */
  readonly formProgress: number;
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
  formProgress: 0,
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

/** Intra-bar tick interval — denser on short TFs so 1m candles visibly move. */
function tickIntervalMs(stepMs: number): number {
  if (stepMs <= 60_000) return 250;
  if (stepMs <= 5 * 60_000) return 500;
  if (stepMs <= 15 * 60_000) return 1_000;
  return 2_000;
}

/**
 * Historical “demo trading space”: cut the chart at a chosen date, keep prior
 * candles visible, then form each next bar live from its OHLC path
 * (O→L→H→C / O→H→L→C) over the real timeframe duration. Countdown advances
 * with a synthetic replay clock. No pause — deactivate to exit.
 */
export class DemoSpaceController {
  readonly state: Store<DemoSpaceControllerState> = createStore(INITIAL);

  private widget: IChartingLibraryWidget | null = null;
  private datafeed: TradingViewDatafeed | null = null;
  private demo: DemoTradingService | null = null;
  private buffer: Bar[] = [];
  private tickTimer = 0;
  private formStartedAtMs = 0;
  private formingTarget: Bar | null = null;

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
    this.patch({ loading: true, error: null, active: true, startTimeSec, formProgress: 0 });

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
    // Need at least one bar ahead to form.
    if (index >= buffer.length - 2) index = Math.max(0, buffer.length - 50);

    this.buffer = [...buffer];
    const closed = buffer[index]!;
    datafeed.setReplayBuffer(buffer);
    // History only through the last *closed* bar; forming bar comes via ticks.
    datafeed.setReplayCutoff(closed.time);
    datafeed.setReplayClock(closed.time);

    this.patch({
      active: true,
      loading: false,
      error: null,
      startTimeSec: closed.time,
      cursorIndex: index,
      bufferLength: buffer.length,
      symbol: bare,
      resolution,
      stepMs,
      formProgress: 0,
    });

    demo.activateSpace(bare, closed.time, closed.close);

    await this.fitVisibleHistory(closed.time, barSec, index);
    this.reloadSeries();
    await sleep(200);
    await this.fitVisibleHistory(closed.time, barSec, index);
    await sleep(500);
    await this.fitVisibleHistory(closed.time, barSec, index);

    // Force countdown visible on the price scale.
    try {
      widget.applyOverrides({ "mainSeriesProperties.showCountdown": true });
    } catch {
      /* ignore */
    }

    this.beginForming(index + 1, stepMs);
  }

  async deactivate(): Promise<void> {
    this.stopTimer();
    this.formingTarget = null;
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

  private beginForming(nextIndex: number, stepMs: number): void {
    const target = this.buffer[nextIndex];
    const datafeed = this.datafeed;
    if (!target || !datafeed) {
      this.stopTimer();
      this.patch({ error: "End of historical data — deactivate to return to live chart" });
      return;
    }
    this.formingTarget = target;
    this.formStartedAtMs = Date.now();
    this.patch({ formProgress: 0 });

    // Seed forming candle at open so countdown attaches to this period.
    const seed = formingBarFromOhlc(target, 0);
    datafeed.setReplayClock(target.time);
    datafeed.pushReplayBar(seed);
    this.demo?.updateSpaceCursor(target.time, seed.close);

    this.stopTimer();
    const interval = tickIntervalMs(stepMs);
    this.tickTimer = window.setInterval(() => {
      this.onFormTick(stepMs);
    }, interval);
  }

  private onFormTick(stepMs: number): void {
    const { active, cursorIndex, bufferLength, resolution } = this.state.get();
    if (!active) return;
    const target = this.formingTarget;
    const datafeed = this.datafeed;
    if (!target || !datafeed) return;

    const elapsed = Date.now() - this.formStartedAtMs;
    const progress = Math.min(1, elapsed / stepMs);
    const barSec = resolutionToSec(resolution);

    // Advance replay clock within [open, open+barSec) for TV countdown.
    const clockSec = target.time + Math.min(barSec - 1, Math.floor(progress * barSec));
    datafeed.setReplayClock(clockSec);

    if (progress >= 1) {
      // Close the candle fully, then start the next.
      datafeed.setReplayCutoff(target.time);
      datafeed.setReplayClock(target.time + barSec);
      datafeed.pushReplayBar({ ...target });
      this.demo?.updateSpaceCursor(target.time, target.close);
      const nextClosed = cursorIndex + 1;
      this.patch({ cursorIndex: nextClosed, formProgress: 1 });
      void this.scrollFollow(target.time, barSec);

      if (nextClosed >= bufferLength - 1) {
        this.stopTimer();
        this.formingTarget = null;
        this.patch({ error: "End of historical data — deactivate to return to live chart" });
        return;
      }
      this.beginForming(nextClosed + 1, stepMs);
      return;
    }

    const forming = formingBarFromOhlc(target, progress);
    datafeed.pushReplayBar(forming);
    this.demo?.updateSpaceCursor(target.time, forming.close);
    this.patch({ formProgress: progress });
  }

  private async scrollFollow(barTime: number, barSec: number): Promise<void> {
    try {
      const chart = this.widget?.activeChart();
      if (!chart) return;
      const range = chart.getVisibleRange();
      if (range && Number.isFinite(range.from) && Number.isFinite(range.to)) {
        const span = range.to - range.from;
        await chart.setVisibleRange({ from: barTime - span + barSec * 2, to: barTime + barSec * 2 });
      }
    } catch {
      /* ignore */
    }
  }

  private async fitVisibleHistory(endTimeSec: number, barSec: number, cursorIndex: number): Promise<void> {
    const widget = this.widget;
    if (!widget) return;
    try {
      const chart = widget.activeChart();
      const fromBar = this.buffer[Math.max(0, cursorIndex - 100)];
      const from = fromBar ? Number(fromBar.time) : endTimeSec - 100 * barSec;
      const to = endTimeSec + barSec * 2;
      await chart.setVisibleRange({ from, to });
    } catch {
      /* ignore */
    }
  }

  private stopTimer(): void {
    if (this.tickTimer) {
      window.clearInterval(this.tickTimer);
      this.tickTimer = 0;
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
