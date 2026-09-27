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
}

const INITIAL: DemoSpaceControllerState = {
  active: false,
  loading: false,
  error: null,
  startTimeSec: null,
  cursorIndex: -1,
  bufferLength: 0,
  symbol: "",
};

/**
 * Historical “demo trading space”: cut the chart at a chosen date, then
 * advance bars continuously (no pause). Deactivate returns to the live chart.
 */
export class DemoSpaceController {
  readonly state: Store<DemoSpaceControllerState> = createStore(INITIAL);

  private widget: IChartingLibraryWidget | null = null;
  private datafeed: TradingViewDatafeed | null = null;
  private demo: DemoTradingService | null = null;
  private buffer: Bar[] = [];
  private timer = 0;
  /** ~1 bar / second feeling; slightly faster on higher TFs feels ok. */
  private readonly stepMs = 800;

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

  /**
   * Start demo space at unix seconds (bar time). Fetches history, cuts series,
   * then auto-plays forward until buffer ends or user deactivates.
   */
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

    // Exit normal bar-replay if it was running.
    try {
      datafeed.endReplay();
    } catch {
      /* ignore */
    }

    let symbol = "XAUUSD";
    let resolution = "15";
    try {
      const chart = widget.activeChart();
      symbol = chart.symbol();
      resolution = String(chart.resolution());
    } catch {
      /* ignore */
    }
    const bare = symbol.includes(":") ? symbol.slice(symbol.lastIndexOf(":") + 1) : symbol;

    datafeed.beginReplay();
    let buffer = await datafeed.fetchReplayBuffer(bare, resolution, 8_000);
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
    // Keep some runway ahead if user picked near the end.
    if (index >= buffer.length - 2) index = Math.max(0, buffer.length - 50);

    this.buffer = [...buffer];
    const bar = buffer[index]!;
    datafeed.setReplayCutoff(bar.time);
    this.reloadSeries();

    this.patch({
      active: true,
      loading: false,
      error: null,
      startTimeSec: bar.time,
      cursorIndex: index,
      bufferLength: buffer.length,
      symbol: bare,
    });

    demo.activateSpace(bare, bar.time, bar.close);
    this.startTimer();
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

  private startTimer(): void {
    this.stopTimer();
    this.timer = window.setInterval(() => {
      void this.advanceOne();
    }, this.stepMs);
  }

  private stopTimer(): void {
    if (this.timer) {
      window.clearInterval(this.timer);
      this.timer = 0;
    }
  }

  private async advanceOne(): Promise<void> {
    const { cursorIndex, bufferLength, active } = this.state.get();
    if (!active) return;
    if (cursorIndex < 0 || cursorIndex >= bufferLength - 1) {
      // Reached end of buffer — keep last price, stop advancing (space stays active).
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
