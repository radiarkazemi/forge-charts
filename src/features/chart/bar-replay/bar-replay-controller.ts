import { createStore, type Store } from "@/application";
import type { Bar } from "@/domain";
import type { TradingViewDatafeed } from "@/infrastructure/tradingview/datafeed";
import type { EntityId, IChartingLibraryWidget } from "@/infrastructure/tradingview";

export type BarReplaySpeed = 0.5 | 1 | 2 | 5 | 10;

export type BarReplayPhase = "idle" | "selecting" | "ready" | "playing";

export interface BarReplayState {
  readonly active: boolean;
  readonly phase: BarReplayPhase;
  readonly speed: BarReplaySpeed;
  readonly resolution: string;
  readonly cursorIndex: number;
  readonly startIndex: number;
  readonly bufferLength: number;
  readonly selecting: boolean;
}

const SPEED_MS: Record<BarReplaySpeed, number> = {
  0.5: 2_000,
  1: 1_000,
  2: 500,
  5: 200,
  10: 100,
};

const INITIAL: BarReplayState = {
  active: false,
  phase: "idle",
  speed: 1,
  resolution: "15",
  cursorIndex: -1,
  startIndex: -1,
  bufferLength: 0,
  selecting: false,
};

function formatResolution(res: string): string {
  if (/^\d+$/.test(res)) {
    const n = Number(res);
    if (n < 60) return `${n}m`;
    if (n % 60 === 0) return `${n / 60}h`;
    return `${n}m`;
  }
  return res;
}

/**
 * TradingView-style Bar Replay: select a bar, truncate future history,
 * then step / play forward through a prefetched buffer.
 */
export class BarReplayController {
  readonly state: Store<BarReplayState> = createStore(INITIAL);

  private widget: IChartingLibraryWidget | null = null;
  private datafeed: TradingViewDatafeed | null = null;
  private buffer: Bar[] = [];
  private playTimer = 0;
  private markerId: EntityId | null = null;
  private selectToken = 0;

  attach(widget: IChartingLibraryWidget, datafeed: TradingViewDatafeed): void {
    this.widget = widget;
    this.datafeed = datafeed;
  }

  detach(): void {
    this.stopPlayTimer();
    this.selectToken += 1;
    this.widget = null;
    this.datafeed = null;
    this.buffer = [];
    this.markerId = null;
    this.state.set(INITIAL);
  }

  resolutionLabel(): string {
    return formatResolution(this.state.get().resolution);
  }

  /** Open the bottom replay bar and enter Select bar mode. */
  async enter(): Promise<void> {
    const widget = this.widget;
    const datafeed = this.datafeed;
    if (!widget || !datafeed) return;

    this.stopPlayTimer();
    try {
      widget.activeChart().cancelSelectBar();
    } catch {
      /* ignore */
    }

    let resolution = "15";
    try {
      resolution = String(widget.activeChart().resolution());
    } catch {
      /* ignore */
    }

    datafeed.beginReplay();
    this.buffer = [];
    this.state.set({
      active: true,
      phase: "selecting",
      speed: this.state.get().speed,
      resolution,
      cursorIndex: -1,
      startIndex: -1,
      bufferLength: 0,
      selecting: true,
    });

    // Do NOT resetData here — it cancels requestSelectBar. Live ticks are muted
    // via datafeed.beginReplay(); cutoff + reload happen after the bar is picked.
    await this.selectBar();
  }

  /** Activate CL bar picker; on click, cut history at that bar. */
  async selectBar(): Promise<void> {
    const widget = this.widget;
    const datafeed = this.datafeed;
    if (!widget || !datafeed || !this.state.get().active) return;

    this.stopPlayTimer();
    const token = ++this.selectToken;
    this.patch({ phase: "selecting", selecting: true });

    try {
      widget.activeChart().cancelSelectBar();
    } catch {
      /* ignore */
    }

    let selectedTime: number;
    try {
      selectedTime = await widget.activeChart().requestSelectBar();
    } catch {
      if (token !== this.selectToken) return;
      // User cancelled — keep toolbar open if we already have a cursor.
      const hasCursor = this.state.get().cursorIndex >= 0;
      this.patch({
        phase: hasCursor ? "ready" : "selecting",
        selecting: false,
      });
      return;
    }

    if (token !== this.selectToken || !this.state.get().active) return;

    await this.applySelection(selectedTime);
  }

  cancelSelect(): void {
    this.selectToken += 1;
    try {
      this.widget?.activeChart().cancelSelectBar();
    } catch {
      /* ignore */
    }
    const hasCursor = this.state.get().cursorIndex >= 0;
    this.patch({
      phase: hasCursor ? "ready" : "selecting",
      selecting: false,
    });
  }

  setSpeed(speed: BarReplaySpeed): void {
    this.patch({ speed });
    if (this.state.get().phase === "playing") {
      this.stopPlayTimer();
      this.startPlayTimer();
    }
  }

  async play(): Promise<void> {
    if (!this.state.get().active || this.state.get().cursorIndex < 0) return;
    if (this.state.get().phase === "playing") {
      this.pause();
      return;
    }
    this.patch({ phase: "playing" });
    this.startPlayTimer();
  }

  pause(): void {
    this.stopPlayTimer();
    if (this.state.get().active && this.state.get().cursorIndex >= 0) {
      this.patch({ phase: "ready" });
    }
  }

  async stepForward(): Promise<void> {
    if (!this.state.get().active) return;
    this.pause();
    await this.advanceOne();
  }

  /** Jump back to the originally selected start bar. */
  async jumpToStart(): Promise<void> {
    const { startIndex, active } = this.state.get();
    if (!active || startIndex < 0) return;
    this.pause();
    await this.seekToIndex(startIndex, { pushTick: false, reload: true });
  }

  /** Exit replay and restore live data. */
  async jumpToRealtime(): Promise<void> {
    await this.exit();
  }

  async exit(): Promise<void> {
    this.stopPlayTimer();
    this.selectToken += 1;
    try {
      this.widget?.activeChart().cancelSelectBar();
    } catch {
      /* ignore */
    }

    await this.removeMarker();

    const datafeed = this.datafeed;
    const widget = this.widget;
    datafeed?.endReplay();
    this.buffer = [];
    this.state.set({ ...INITIAL, speed: this.state.get().speed });

    if (widget) {
      try {
        widget.resetCache();
        widget.activeChart().resetData();
      } catch {
        /* ignore */
      }
    }
  }

  /* ── internals ─────────────────────────────────────────────────────── */

  private async applySelection(selectedTimeSec: number): Promise<void> {
    const widget = this.widget;
    const datafeed = this.datafeed;
    if (!widget || !datafeed) return;

    const chart = widget.activeChart();
    const symbol = chart.symbol();
    const resolution = String(chart.resolution());

    // Prefetch full buffer BEFORE applying cutoff so we can step into “future”.
    let buffer = await datafeed.fetchReplayBuffer(symbol, resolution, 8_000);
    if (buffer.length === 0) {
      // Fallback: export whatever the chart currently has.
      try {
        const exported = await chart.exportData({
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
      this.patch({ phase: "selecting", selecting: false });
      return;
    }

    let index = nearestBarIndex(buffer, selectedTimeSec);
    if (index < 0) index = 0;

    this.buffer = [...buffer];
    this.patch({
      resolution,
      cursorIndex: index,
      startIndex: index,
      bufferLength: buffer.length,
      phase: "ready",
      selecting: false,
    });

    datafeed.setReplayCutoff(buffer[index]!.time);
    await this.removeMarker();
    await this.drawMarker(buffer[index]!.time);
    this.reloadSeries();
  }

  private async advanceOne(): Promise<boolean> {
    const { cursorIndex, bufferLength } = this.state.get();
    if (cursorIndex < 0 || cursorIndex >= bufferLength - 1) {
      this.pause();
      return false;
    }
    const next = cursorIndex + 1;
    await this.seekToIndex(next, { pushTick: true, reload: false });
    return true;
  }

  private async seekToIndex(
    index: number,
    opts: { pushTick: boolean; reload: boolean },
  ): Promise<void> {
    const datafeed = this.datafeed;
    const bar = this.buffer[index];
    if (!datafeed || !bar) return;

    datafeed.setReplayCutoff(bar.time);
    this.patch({ cursorIndex: index, phase: "ready" });
    await this.removeMarker();
    await this.drawMarker(bar.time);

    if (opts.reload) {
      this.reloadSeries();
      return;
    }
    if (opts.pushTick) {
      datafeed.pushReplayBar(bar);
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

  private async drawMarker(timeSec: number): Promise<void> {
    const chart = this.widget?.activeChart();
    if (!chart) return;
    try {
      this.markerId = await chart.createShape(
        { time: timeSec },
        {
          shape: "vertical_line",
          lock: true,
          disableSelection: true,
          disableSave: true,
          disableUndo: true,
          overrides: {
            linecolor: "#9598a1",
            linestyle: 2,
            linewidth: 1,
            showLabel: false,
          },
        },
      );
    } catch {
      this.markerId = null;
    }
  }

  private async removeMarker(): Promise<void> {
    const chart = this.widget?.activeChart();
    const id = this.markerId;
    this.markerId = null;
    if (!chart || !id) return;
    try {
      chart.removeEntity(id);
    } catch {
      /* ignore */
    }
  }

  private startPlayTimer(): void {
    this.stopPlayTimer();
    const ms = SPEED_MS[this.state.get().speed] ?? 1_000;
    this.playTimer = window.setInterval(() => {
      void this.advanceOne().then((ok) => {
        if (!ok) this.pause();
      });
    }, ms);
  }

  private stopPlayTimer(): void {
    if (this.playTimer) {
      window.clearInterval(this.playTimer);
      this.playTimer = 0;
    }
  }

  private patch(partial: Partial<BarReplayState>): void {
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
