import { createStore, type Store } from "@/application";
import {
  formingBarFromOhlc,
  formingBarFromSubBars,
  intervalSeconds,
  type Bar,
} from "@/domain";
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
  /** 0–1 progress through the forming candle. */
  readonly formProgress: number;
}

const INITIAL: BarReplayState = {
  active: false,
  phase: "idle",
  speed: 1,
  resolution: "15",
  cursorIndex: -1,
  startIndex: -1,
  bufferLength: 0,
  selecting: false,
  formProgress: 0,
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

/** Real wall duration of one candle for this resolution (ms). */
function resolutionToStepMs(res: string): number {
  try {
    return Math.max(1_000, intervalSeconds(res) * 1_000);
  } catch {
    return 60_000;
  }
}

function resolutionToSec(res: string): number {
  return Math.max(1, Math.floor(resolutionToStepMs(res) / 1000));
}

/** Tick cadence while a candle is forming (denser on short TFs). */
function tickIntervalMs(stepMs: number, speed: BarReplaySpeed): number {
  const effective = stepMs / Math.max(0.25, speed);
  if (effective <= 2_000) return 50;
  if (effective <= 15_000) return 100;
  if (effective <= 60_000) return 200;
  if (effective <= 5 * 60_000) return 400;
  return 1_000;
}

/** Prefer a denser TF for true intra-bar path when available. */
function microResolutionFor(res: string): string | null {
  const sec = resolutionToSec(res);
  if (sec <= 1) return null;
  // Sub-minute → 1S ticks; 1–15m → 1m; higher → 5m.
  if (sec < 60) return "1S";
  if (sec <= 60) return "1S";
  if (sec <= 900) return "1";
  if (sec <= 3600) return "5";
  return "15";
}

/**
 * TradingView-style Bar Replay: select a bar, truncate future history,
 * then form each next candle over real timeframe duration (scaled by speed).
 * Uses true lower-TF data for the path when available; otherwise simulates
 * a natural O→H→L→C path from the closed bar’s OHLC.
 */
export class BarReplayController {
  readonly state: Store<BarReplayState> = createStore(INITIAL);

  private widget: IChartingLibraryWidget | null = null;
  private datafeed: TradingViewDatafeed | null = null;
  private buffer: Bar[] = [];
  /** Lower-TF bars for true intra-candle paths (optional). */
  private microBuffer: Bar[] = [];
  private playTimer = 0;
  private markerId: EntityId | null = null;
  private selectToken = 0;
  private formStartedAtMs = 0;
  private formProgressAtStart = 0;
  private formingTarget: Bar | null = null;
  private formingSubs: Bar[] = [];

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
    this.microBuffer = [];
    this.formingTarget = null;
    this.formingSubs = [];
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
    this.formingTarget = null;
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

    let ticker = "";
    try {
      ticker = String(widget.activeChart().symbol() || "");
    } catch {
      /* ignore */
    }
    datafeed.beginReplay({ ticker: ticker || undefined, resolution });
    this.buffer = [];
    this.microBuffer = [];
    this.state.set({
      active: true,
      phase: "selecting",
      speed: this.state.get().speed,
      resolution,
      cursorIndex: -1,
      startIndex: -1,
      bufferLength: 0,
      selecting: true,
      formProgress: 0,
    });

    try {
      widget.applyOverrides({ "mainSeriesProperties.showCountdown": true });
    } catch {
      /* ignore */
    }

    void this.selectBar();
  }

  async selectBar(): Promise<void> {
    const widget = this.widget;
    const datafeed = this.datafeed;
    if (!widget || !datafeed || !this.state.get().active) return;

    this.stopPlayTimer();
    this.formingTarget = null;
    const token = ++this.selectToken;
    this.patch({ phase: "selecting", selecting: true, formProgress: 0 });

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
    const playing = this.state.get().phase === "playing" || this.playTimer !== 0;
    // Preserve mid-candle progress across speed changes.
    if (playing && this.formingTarget) {
      const stepMs = resolutionToStepMs(this.state.get().resolution);
      const prevSpeed = this.state.get().speed;
      const elapsed = Date.now() - this.formStartedAtMs;
      const progress = Math.min(
        1,
        this.formProgressAtStart + elapsed / (stepMs / Math.max(0.25, prevSpeed)),
      );
      this.formProgressAtStart = progress;
      this.formStartedAtMs = Date.now();
      this.patch({ speed, formProgress: progress });
    } else {
      this.patch({ speed });
    }
    if (playing) {
      this.stopPlayTimer();
      this.startPlayTimer();
    }
  }

  /**
   * Chart interval changed during replay — rebuild buffer at the new TF and
   * keep forming candles at that TF’s real duration.
   */
  async onResolutionChanged(resolution: string): Promise<void> {
    if (!this.state.get().active || this.state.get().cursorIndex < 0) return;
    const next = String(resolution || "").trim();
    if (!next || next === this.state.get().resolution) return;

    const wasPlaying = this.state.get().phase === "playing" || this.playTimer !== 0;
    this.stopPlayTimer();
    this.formingTarget = null;

    const cursorTime = this.buffer[this.state.get().cursorIndex]?.time;
    await this.rebuildBufferAt(next, cursorTime);
    if (wasPlaying && this.state.get().cursorIndex >= 0) {
      this.patch({ phase: "playing" });
      this.beginFormingNext();
      this.startPlayTimer();
    }
  }

  async play(): Promise<void> {
    if (!this.state.get().active || this.state.get().cursorIndex < 0) return;
    if (this.state.get().phase === "playing" || this.playTimer !== 0) {
      this.pause();
      return;
    }
    this.patch({ phase: "playing" });
    if (!this.formingTarget) {
      this.beginFormingNext();
    } else {
      // Resume mid-candle from saved progress.
      this.formStartedAtMs = Date.now();
      this.formProgressAtStart = this.state.get().formProgress;
    }
    this.startPlayTimer();
  }

  pause(): void {
    if (this.formingTarget && this.playTimer !== 0) {
      const stepMs = resolutionToStepMs(this.state.get().resolution);
      const speed = this.state.get().speed;
      const elapsed = Date.now() - this.formStartedAtMs;
      const progress = Math.min(
        1,
        this.formProgressAtStart + elapsed / (stepMs / Math.max(0.25, speed)),
      );
      this.patch({ formProgress: progress });
      this.formProgressAtStart = progress;
    }
    this.stopPlayTimer();
    if (this.state.get().active && this.state.get().cursorIndex >= 0) {
      this.patch({ phase: "ready" });
    }
  }

  /** Complete the forming candle immediately (or step one closed bar). */
  async stepForward(): Promise<void> {
    if (!this.state.get().active) return;
    this.pause();
    if (this.formingTarget) {
      await this.commitFormingBar();
      return;
    }
    await this.advanceClosedOne();
  }

  async jumpToStart(): Promise<void> {
    const { startIndex, active } = this.state.get();
    if (!active || startIndex < 0) return;
    this.pause();
    this.formingTarget = null;
    this.formingSubs = [];
    this.patch({ formProgress: 0 });
    await this.seekToIndex(startIndex, { pushTick: false, reload: true });
  }

  async jumpToRealtime(): Promise<void> {
    await this.exit();
  }

  async exit(): Promise<void> {
    this.stopPlayTimer();
    this.selectToken += 1;
    this.formingTarget = null;
    this.formingSubs = [];
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
    this.microBuffer = [];
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
    const resolution = String(chart.resolution());
    const ok = await this.rebuildBufferAt(resolution, selectedTimeSec, {
      resetStart: true,
      selecting: false,
    });
    if (!ok) {
      this.patch({ phase: "selecting", selecting: false });
    }
  }

  private async rebuildBufferAt(
    resolution: string,
    anchorTimeSec: number | undefined,
    opts: { resetStart?: boolean; selecting?: boolean } = {},
  ): Promise<boolean> {
    const widget = this.widget;
    const datafeed = this.datafeed;
    if (!widget || !datafeed) return false;

    const chart = widget.activeChart();
    const symbol = chart.symbol();

    const stepSec = resolutionToSec(resolution);
    // Seconds / sub-minute need a deep buffer — short pages look like 2–3 candles
    // then a jump when play advances across sparse holes.
    const parentNeed = stepSec < 60 ? 20_000 : 8_000;
    const microNeed = stepSec < 60 ? 50_000 : 20_000;

    let buffer = await datafeed.fetchReplayBuffer(symbol, resolution, parentNeed);
    if (buffer.length === 0) {
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

    // Prefer a denser TF for true intra-bar paths; also use it to synthesize
    // the chart TF when native history is missing or gappy.
    const microRes = microResolutionFor(resolution);
    let micro: Bar[] = [];
    if (microRes) {
      try {
        const fetched = await datafeed.fetchReplayBuffer(symbol, microRes, microNeed);
        micro = [...fetched];
      } catch {
        micro = [];
      }
    }

    buffer = densifyReplayBuffer(buffer, micro, stepSec);

    if (buffer.length === 0) return false;

    const prev = this.state.get();
    const anchor =
      anchorTimeSec != null && Number.isFinite(anchorTimeSec)
        ? Number(anchorTimeSec)
        : Number(this.buffer[Math.max(0, prev.cursorIndex)]?.time ?? buffer[0]!.time);
    let index = nearestBarIndex(buffer, anchor);
    if (index < 0) index = 0;

    let startIndex = index;
    if (!opts.resetStart && prev.startIndex >= 0 && this.buffer[prev.startIndex]) {
      const startTime = Number(this.buffer[prev.startIndex]!.time);
      startIndex = nearestBarIndex(buffer, startTime);
      if (startIndex < 0) startIndex = index;
    }

    this.buffer = [...buffer];
    this.microBuffer = micro;
    this.formingTarget = null;
    this.formingSubs = [];
    this.patch({
      resolution,
      cursorIndex: index,
      startIndex,
      bufferLength: buffer.length,
      phase: this.playTimer !== 0 || prev.phase === "playing" ? "playing" : "ready",
      selecting: opts.selecting ?? false,
      formProgress: 0,
    });

    datafeed.setReplayBuffer(buffer, resolution);
    datafeed.setReplayCutoff(buffer[index]!.time);
    datafeed.setReplayClock(buffer[index]!.time);
    try {
      const ticker = String(widget.activeChart().symbol() || "");
      datafeed.setReplayPushTarget(ticker || null, resolution);
    } catch {
      datafeed.setReplayPushTarget(null, resolution);
    }
    await this.removeMarker();
    await this.drawMarker(buffer[index]!.time);
    this.reloadSeries();
    return true;
  }

  /** Start forming the bar after the current closed cursor. */
  private beginFormingNext(): void {
    const { cursorIndex, bufferLength, resolution } = this.state.get();
    if (cursorIndex < 0 || cursorIndex >= bufferLength - 1) {
      this.pause();
      return;
    }
    const target = this.buffer[cursorIndex + 1];
    if (!target) {
      this.pause();
      return;
    }
    this.formingTarget = target;
    this.formStartedAtMs = Date.now();
    this.formProgressAtStart = 0;
    this.formingSubs = subsForBar(this.microBuffer, target, resolutionToSec(resolution));
    this.patch({ formProgress: 0 });
    this.pushForming(0.02);
  }

  private pushForming(progress: number): void {
    const datafeed = this.datafeed;
    const target = this.formingTarget;
    if (!datafeed || !target) return;
    const barSec = resolutionToSec(this.state.get().resolution);
    const forming =
      this.formingSubs.length > 0
        ? formingBarFromSubBars(target, this.formingSubs, progress, barSec)
        : formingBarFromOhlc(target, progress);
    const clockSec = target.time + Math.min(barSec - 1, Math.floor(progress * barSec));
    datafeed.setReplayClock(Math.max(target.time + 1, clockSec));
    datafeed.pushReplayBar(forming);
  }

  private async commitFormingBar(): Promise<void> {
    const datafeed = this.datafeed;
    const target = this.formingTarget;
    if (!datafeed || !target) return;
    const barSec = resolutionToSec(this.state.get().resolution);
    const nextIndex = this.state.get().cursorIndex + 1;
    datafeed.setReplayCutoff(target.time);
    datafeed.setReplayClock(target.time + barSec);
    datafeed.pushReplayBar({ ...target });
    this.formingTarget = null;
    this.formingSubs = [];
    this.patch({
      cursorIndex: nextIndex,
      formProgress: 0,
      phase: this.playTimer !== 0 ? "playing" : "ready",
    });
    await this.removeMarker();
    await this.drawMarker(target.time);
  }

  private async advanceClosedOne(): Promise<boolean> {
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

    this.formingTarget = null;
    this.formingSubs = [];
    datafeed.setReplayCutoff(bar.time);
    datafeed.setReplayClock(bar.time);
    const keepPlaying = this.playTimer !== 0 || this.state.get().phase === "playing";
    this.patch({
      cursorIndex: index,
      phase: keepPlaying ? "playing" : "ready",
      formProgress: 0,
    });
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

  private onFormTick(): void {
    if (this.state.get().phase !== "playing" && this.playTimer === 0) return;
    const target = this.formingTarget;
    if (!target) {
      this.beginFormingNext();
      return;
    }

    const stepMs = resolutionToStepMs(this.state.get().resolution);
    const speed = this.state.get().speed;
    const elapsed = Date.now() - this.formStartedAtMs;
    const progress = Math.min(
      1,
      this.formProgressAtStart + elapsed / (stepMs / Math.max(0.25, speed)),
    );
    this.patch({ formProgress: progress, phase: "playing" });

    if (progress >= 1) {
      void this.commitFormingBar().then(() => {
        if (this.state.get().cursorIndex >= this.state.get().bufferLength - 1) {
          this.pause();
          return;
        }
        if (this.playTimer !== 0) {
          this.beginFormingNext();
        }
      });
      return;
    }

    this.pushForming(progress);
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
      await this.removeMarker();
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
    const stepMs = resolutionToStepMs(this.state.get().resolution);
    const ms = tickIntervalMs(stepMs, this.state.get().speed);
    this.playTimer = window.setInterval(() => {
      this.onFormTick();
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

function subsForBar(micro: readonly Bar[], parent: Bar, barSec: number): Bar[] {
  if (!micro.length || barSec <= 0) return [];
  const end = parent.time + barSec;
  return micro.filter((b) => {
    const t = Number(b.time);
    return t >= parent.time && t < end;
  });
}

/** Aggregate lower-TF closes into OHLC for a coarser step (seconds). */
function aggregateBars(micro: readonly Bar[], stepSec: number): Bar[] {
  if (!micro.length || stepSec <= 0) return [];
  type Acc = { time: number; open: number; high: number; low: number; close: number; volume: number };
  const buckets = new Map<number, Acc>();
  for (const b of micro) {
    const t0 = Number(b.time) - (Number(b.time) % stepSec);
    const existing = buckets.get(t0);
    if (!existing) {
      buckets.set(t0, {
        time: t0,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
        volume: b.volume || 0,
      });
    } else {
      buckets.set(t0, {
        time: t0,
        open: existing.open,
        high: Math.max(existing.high, b.high),
        low: Math.min(existing.low, b.low),
        close: b.close,
        volume: existing.volume + (b.volume || 0),
      });
    }
  }
  return [...buckets.values()]
    .sort((a, b) => a.time - b.time)
    .map((b) => ({ ...b }));
}

function hasReplayHoles(bars: readonly Bar[], stepSec: number): boolean {
  if (bars.length < 2 || stepSec <= 0) return false;
  const limit = stepSec * 1.5;
  for (let i = 1; i < bars.length; i += 1) {
    if (Number(bars[i]!.time) - Number(bars[i - 1]!.time) > limit) return true;
  }
  return false;
}

function mergeBarsPreferPrimary(primary: readonly Bar[], fill: readonly Bar[]): Bar[] {
  const byTime = new Map<number, Bar>();
  for (const b of fill) byTime.set(Number(b.time), b);
  for (const b of primary) byTime.set(Number(b.time), b);
  return [...byTime.values()].sort((a, b) => Number(a.time) - Number(b.time));
}

/**
 * Fill short holes so play advances one bar at a time instead of “dodging”
 * across multi-minute gaps. Caps fill length so weekend gaps on higher TFs
 * do not explode memory.
 */
function fillShortReplayGaps(bars: readonly Bar[], stepSec: number): Bar[] {
  if (bars.length < 2 || stepSec <= 0) return [...bars];
  // 30S/10S need denser gap fill — 180 steps (~90m) left long holes that looked “cut off”.
  const maxFill = stepSec <= 30 ? 1_200 : stepSec < 60 ? 480 : stepSec <= 300 ? 60 : 12;
  const out: Bar[] = [bars[0]!];
  for (let i = 1; i < bars.length; i += 1) {
    const prev = out[out.length - 1]!;
    const cur = bars[i]!;
    const gap = Number(cur.time) - Number(prev.time);
    if (gap > stepSec * 1.5) {
      let t = Number(prev.time) + stepSec;
      let n = 0;
      while (t < Number(cur.time) - stepSec * 0.25 && n < maxFill) {
        out.push({
          time: t,
          open: prev.close,
          high: prev.close,
          low: prev.close,
          close: prev.close,
          volume: 0,
        });
        t += stepSec;
        n += 1;
      }
    }
    out.push(cur);
  }
  return out;
}

/** Densify sparse replay series from micro bars, then bridge remaining short holes. */
function densifyReplayBuffer(buffer: readonly Bar[], micro: readonly Bar[], stepSec: number): Bar[] {
  let next = [...buffer];
  if (micro.length > 0 && (next.length < 10 || hasReplayHoles(next, stepSec) || stepSec < 60)) {
    const fromMicro = aggregateBars(micro, stepSec);
    if (fromMicro.length > 0) {
      next = next.length === 0 ? fromMicro : mergeBarsPreferPrimary(next, fromMicro);
    }
  }
  if (hasReplayHoles(next, stepSec)) {
    next = fillShortReplayGaps(next, stepSec);
  }
  return next;
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
