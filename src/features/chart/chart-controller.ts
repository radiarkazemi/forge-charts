import { createStore, type Store, type ThemeMode } from "@/application";
import type { Interval } from "@/domain";
import {
  chartOverrides,
  type CrossHairMovedEventParams,
  type EntityId,
  type IChartingLibraryWidget,
  type IChartWidgetApi,
  type ResolutionString,
} from "@/infrastructure/tradingview";
import {
  barsFromChartExport,
  computeOrcaDraws,
  paintOrcaOnChart,
  parseOrcaInputs,
} from "@/features/pine/orca-runtime";
import { resolvePineStudy } from "@/features/pine/pine-runner";

export interface ChartState {
  readonly symbol: string;
  readonly interval: Interval;
  readonly ready: boolean;
  readonly error: string | null;
}

export interface CrosshairValue {
  readonly title: string;
  readonly value: string;
}

export interface CrosshairSnapshot {
  readonly time: number;
  readonly price: number;
  readonly values: readonly CrosshairValue[];
}

export interface HorizontalLineOptions {
  readonly price: number;
  readonly text: string;
  readonly color: string;
}

export interface ChartSyncHooks {
  readonly onSymbolChanged?: (ticker: string) => void;
  readonly onIntervalChanged?: (interval: Interval) => void;
  readonly onVisibleRangeChanged?: (from: number, to: number) => void;
  readonly onCrosshairMoved?: (time: number) => void;
}

const MAIN_SERIES_ID = "_seriesId";

function stripExchange(symbol: string): string {
  const idx = symbol.lastIndexOf(":");
  return idx >= 0 ? symbol.slice(idx + 1) : symbol;
}

/**
 * Facade over `IChartingLibraryWidget` that exposes only what the rest of the
 * UI needs and mirrors chart state into observable stores. Components never
 * touch the widget directly, which keeps TradingView specifics contained.
 */
export class ChartController {
  readonly state: Store<ChartState>;
  readonly crosshair: Store<CrosshairSnapshot | null> = createStore<CrosshairSnapshot | null>(null);

  private widget: IChartingLibraryWidget | null = null;
  private desiredTheme: ThemeMode | null = null;
  private crosshairFrame = 0;
  private syncHooks: ChartSyncHooks = {};
  private orcaEntityIds: EntityId[] = [];
  private readonly drawingHandlers = new Set<(entityId: EntityId, eventType: string) => void>();
  private drawingBridge: ((entityId: EntityId, eventType: string) => void) | null = null;
  private readonly mouseDownHandlers = new Set<() => void>();
  private mouseDownBridge: (() => void) | null = null;

  constructor(symbol: string, interval: Interval) {
    this.state = createStore<ChartState>({ symbol, interval, ready: false, error: null });
  }

  setSyncHooks(hooks: ChartSyncHooks): void {
    this.syncHooks = hooks;
  }

  /** Call from `onChartReady`. */
  attach(widget: IChartingLibraryWidget): void {
    this.widget = widget;
    const chart = widget.activeChart();

    const forceCountdown = () => {
      try {
        widget.applyOverrides({ "mainSeriesProperties.showCountdown": true });
      } catch {
        /* chart tearing down */
      }
    };

    const syncSymbol = () => {
      const ext = chart.symbolExt();
      const ticker = stripExchange(ext?.ticker ?? ext?.name ?? chart.symbol());
      this.patch({ symbol: ticker });
      forceCountdown();
      this.syncHooks.onSymbolChanged?.(ticker);
    };
    chart.onSymbolChanged().subscribe(null, syncSymbol);
    chart.onIntervalChanged().subscribe(null, (interval) => {
      this.patch({ interval });
      forceCountdown();
      this.syncHooks.onIntervalChanged?.(interval);
    });
    chart.crossHairMoved().subscribe(null, (params) => {
      this.scheduleCrosshair(params);
      if (typeof params.time === "number" && Number.isFinite(params.time)) {
        this.syncHooks.onCrosshairMoved?.(params.time);
      }
    });

    try {
      chart.onVisibleRangeChanged().subscribe(null, (range) => {
        this.syncHooks.onVisibleRangeChanged?.(range.from, range.to);
      });
    } catch {
      /* older builds */
    }

    this.patch({ ready: true, error: null, symbol: stripExchange(chart.symbol()), interval: chart.resolution() });

    forceCountdown();
    try {
      chart.dataReady(() => forceCountdown());
    } catch {
      window.setTimeout(forceCountdown, 500);
    }
    window.setTimeout(forceCountdown, 500);
    window.setTimeout(forceCountdown, 1_200);
    window.setTimeout(forceCountdown, 3_000);

    if (this.desiredTheme && this.desiredTheme !== widget.getTheme()) void this.applyTheme(this.desiredTheme);

    // Bind drawing_event + mouse_down bridges (handlers may register before attach).
    this.bindDrawingBridge(widget);
    this.bindMouseDownBridge(widget);
  }

  private bindDrawingBridge(widget: IChartingLibraryWidget): void {
    if (this.drawingBridge) {
      try {
        widget.unsubscribe("drawing_event", this.drawingBridge);
      } catch {
        /* ignore */
      }
      this.drawingBridge = null;
    }
    const bridge = (entityId: EntityId, eventType: string) => {
      for (const handler of this.drawingHandlers) {
        try {
          handler(entityId, eventType);
        } catch {
          /* ignore */
        }
      }
    };
    try {
      widget.subscribe("drawing_event", bridge);
      this.drawingBridge = bridge;
    } catch {
      this.drawingBridge = null;
    }
  }

  private bindMouseDownBridge(widget: IChartingLibraryWidget): void {
    if (this.mouseDownBridge) {
      try {
        widget.unsubscribe("mouse_down", this.mouseDownBridge);
      } catch {
        /* ignore */
      }
      this.mouseDownBridge = null;
    }
    const bridge = () => {
      for (const handler of this.mouseDownHandlers) {
        try {
          handler();
        } catch {
          /* ignore */
        }
      }
    };
    try {
      widget.subscribe("mouse_down", bridge);
      this.mouseDownBridge = bridge;
    } catch {
      this.mouseDownBridge = null;
    }
  }

  detach(): void {
    cancelAnimationFrame(this.crosshairFrame);
    if (this.widget && this.drawingBridge) {
      try {
        this.widget.unsubscribe("drawing_event", this.drawingBridge);
      } catch {
        /* ignore */
      }
    }
    if (this.widget && this.mouseDownBridge) {
      try {
        this.widget.unsubscribe("mouse_down", this.mouseDownBridge);
      } catch {
        /* ignore */
      }
    }
    this.drawingBridge = null;
    this.mouseDownBridge = null;
    this.widget = null;
    this.patch({ ready: false });
  }

  fail(message: string): void {
    this.patch({ ready: false, error: message });
  }

  get isReady(): boolean {
    return this.widget !== null && this.state.get().ready;
  }

  /** Raw widget for features that need APIs not wrapped here (e.g. Bar Replay). */
  getWidget(): IChartingLibraryWidget | null {
    return this.widget;
  }

  setSymbol(ticker: string): void {
    const chart = this.activeChart();
    if (!chart) return;
    void chart.setSymbol(ticker);
  }

  setInterval(interval: Interval): void {
    this.activeChart()?.setResolution(interval as ResolutionString);
  }

  /**
   * Native Charting Library multi-chart layout (original header stays; charts
   * sit underneath). Layout ids match TV: s | 2h | 2v | 3h | …
   */
  setLayout(layout: string): void {
    try {
      const w = this.widget;
      if (!w) return;
      if (w.layout() === layout) return;
      w.setLayout(layout as never);
      // Autosave / content load can reset layout — re-assert shortly after.
      window.setTimeout(() => {
        try {
          if (this.widget && this.widget.layout() !== layout) {
            this.widget.setLayout(layout as never);
          }
        } catch {
          /* ignore */
        }
      }, 400);
      window.setTimeout(() => {
        try {
          if (this.widget && this.widget.layout() !== layout) {
            this.widget.setLayout(layout as never);
          }
        } catch {
          /* ignore */
        }
      }, 1500);
    } catch {
      /* layout not supported / widget not ready */
    }
  }

  layout(): string | null {
    try {
      return this.widget?.layout() ?? null;
    } catch {
      return null;
    }
  }

  getVisibleRange(): { from: number; to: number } | null {
    try {
      const range = this.activeChart()?.getVisibleRange();
      if (!range || !Number.isFinite(range.from) || !Number.isFinite(range.to)) return null;
      return { from: range.from, to: range.to };
    } catch {
      return null;
    }
  }

  /** Visible price scale range for the main series (for on-chart trade chips). */
  getVisiblePriceRange(): { from: number; to: number } | null {
    try {
      const chart = this.activeChart() as
        | (IChartWidgetApi & {
            getPanes?: () => Array<{
              getMainSourcePriceScale?: () => { getVisiblePriceRange?: () => { from: number; to: number } | null } | null;
            }>;
            getPriceScaleById?: (id: string) => { getVisiblePriceRange?: () => { from: number; to: number } | null } | null;
          })
        | null;
      if (!chart) return null;
      const fromPane = chart.getPanes?.()?.[0]?.getMainSourcePriceScale?.()?.getVisiblePriceRange?.();
      if (fromPane && Number.isFinite(fromPane.from) && Number.isFinite(fromPane.to) && fromPane.to !== fromPane.from) {
        return { from: fromPane.from, to: fromPane.to };
      }
      const right = chart.getPriceScaleById?.("right")?.getVisiblePriceRange?.();
      if (right && Number.isFinite(right.from) && Number.isFinite(right.to) && right.to !== right.from) {
        return { from: right.from, to: right.to };
      }
      return null;
    } catch {
      return null;
    }
  }

  async setVisibleRange(from: number, to: number): Promise<void> {
    const chart = this.activeChart();
    if (!chart) return;
    try {
      await chart.setVisibleRange({ from, to });
    } catch {
      /* ignore */
    }
  }

  /** Ask the library iframe to reflow after CSS grid / visibility changes. */
  requestResize(): void {
    try {
      window.dispatchEvent(new Event("resize"));
    } catch {
      /* ignore */
    }
  }

  /** Switch theme now, or as soon as the widget becomes ready. */
  async changeTheme(mode: ThemeMode): Promise<void> {
    this.desiredTheme = mode;
    if (this.isReady && this.widget?.getTheme() !== mode) await this.applyTheme(mode);
  }

  async addHorizontalLine({ price, text, color }: HorizontalLineOptions): Promise<EntityId | null> {
    const chart = this.activeChart();
    if (!chart) return null;
    try {
      return await chart.createShape(
        { time: Math.floor(Date.now() / 1000), price },
        {
          shape: "horizontal_line",
          text,
          lock: true,
          disableSelection: true,
          disableSave: true,
          disableUndo: true,
          showInObjectsTree: false,
          overrides: {
            linecolor: color,
            textcolor: color,
            linestyle: 2,
            linewidth: 1,
            showLabel: true,
            showPrice: true,
            horzLabelsAlign: "right",
            vertLabelsAlign: "middle",
          },
        },
      );
    } catch {
      return null;
    }
  }

  removeEntity(id: EntityId): void {
    try {
      this.activeChart()?.removeEntity(id, { disableUndo: true });
    } catch {
      /* entity already gone */
    }
  }

  saveState(onSaved: (state: object) => void): void {
    this.widget?.save(onSaved);
  }

  /** Ensure a Volume study exists (opt-in only — not used at startup). */
  ensureVolumeStudy(): void {
    try {
      const chart = this.activeChart() as
        | (IChartWidgetApi & {
            getAllStudies?: () => Array<{ name?: string; id?: string }>;
            createStudy?: (
              name: string,
              forceOverlay?: boolean,
              lock?: boolean,
              inputs?: unknown,
            ) => Promise<unknown>;
          })
        | null;
      if (!chart?.createStudy) return;
      const studies = chart.getAllStudies?.() ?? [];
      const hasVolume = studies.some(
        (s) => /volume/i.test(s.name ?? "") || /volume/i.test(String(s.id ?? "")),
      );
      if (hasVolume) return;
      void chart.createStudy("Volume", false, false);
    } catch {
      /* study API unavailable */
    }
  }

  /** Remove the default Volume pane so it does not load at startup. */
  removeVolumeStudy(): void {
    try {
      const chart = this.activeChart() as
        | (IChartWidgetApi & {
            getAllStudies?: () => Array<{ name?: string; id?: EntityId | string }>;
          })
        | null;
      if (!chart?.getAllStudies) return;
      for (const study of chart.getAllStudies()) {
        const name = (study.name ?? "").trim();
        // Only the plain Volume study — leave Volume Profile / VRVP alone.
        if (!/^volume$/i.test(name) || study.id == null) continue;
        this.removeEntity(study.id as EntityId);
      }
    } catch {
      /* study API unavailable */
    }
  }

  /**
   * Run a Pine draft:
   * - Orca → JS structure/DR engine + chart drawings
   * - SMA/EMA/RSI/MACD → Charting Library studies
   * - else → compile-style error (never silent SMA)
   */
  async runPineDraft(code: string): Promise<{ ok: boolean; message: string }> {
    const resolved = resolvePineStudy(code);
    if (!resolved.ok) {
      return { ok: false, message: resolved.message };
    }
    if (resolved.kind === "orca") {
      return this.runOrcaDraft(code, resolved.label);
    }
    const req = resolved.study;
    try {
      const chart = this.activeChart();
      if (!chart) {
        return { ok: false, message: "Chart not ready — wait for candles, then Add to chart again" };
      }
      const id = await chart.createStudy(
        req.studyName,
        req.forceOverlay,
        false,
        req.inputs,
        req.overrides ?? {},
      );
      if (id == null) {
        return { ok: false, message: `Could not add ${req.label} — study API returned null` };
      }
      return { ok: true, message: `Added ${req.label} to chart` };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Failed to add study",
      };
    }
  }

  private async runOrcaDraft(code: string, label: string): Promise<{ ok: boolean; message: string }> {
    const chart = this.activeChart();
    if (!chart) {
      return { ok: false, message: "Chart not ready — wait for candles, then Add to chart again" };
    }
    try {
      const exported = await chart.exportData({
        includeTime: true,
        includeSeries: true,
        includedStudies: [],
      });
      const bars = barsFromChartExport(exported);
      if (bars.length < 20) {
        return { ok: false, message: "Not enough bars to run Orca — scroll/load more history" };
      }
      const inputs = parseOrcaInputs(code);
      const cmds = computeOrcaDraws(bars, inputs);
      for (const id of this.orcaEntityIds) {
        this.removeEntity(id);
      }
      this.orcaEntityIds = [];
      const ids = await paintOrcaOnChart(chart, cmds);
      this.orcaEntityIds = ids;
      return {
        ok: true,
        message: `Added ${label} — ${ids.length} drawings (${bars.length} bars)`,
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Orca runtime failed",
      };
    }
  }

  /** Currently selected drawing tool / cursor on this widget. */
  selectedLineTool(): string | null {
    try {
      return this.widget?.selectedLineTool() ?? null;
    } catch {
      return null;
    }
  }

  /** Select a drawing tool (same as left toolbar click). */
  async selectLineTool(tool: string): Promise<void> {
    try {
      await this.widget?.selectLineTool(tool as never);
    } catch {
      /* ignore */
    }
  }

  /** Subscribe to left-toolbar tool changes. */
  onSelectedLineToolChanged(handler: () => void): () => void {
    const w = this.widget;
    if (!w) return () => undefined;
    try {
      w.subscribe("onSelectedLineToolChanged", handler);
      return () => {
        try {
          w.unsubscribe("onSelectedLineToolChanged", handler);
        } catch {
          /* ignore */
        }
      };
    } catch {
      return () => undefined;
    }
  }

  /** Subscribe to drawing create / move / remove / property changes. */
  onDrawingEvent(handler: (entityId: EntityId, eventType: string) => void): () => void {
    this.drawingHandlers.add(handler);
    if (this.widget && !this.drawingBridge) {
      this.bindDrawingBridge(this.widget);
    }
    return () => {
      this.drawingHandlers.delete(handler);
    };
  }

  /** Clicks inside the chart iframe (for active-pane selection). */
  onMouseDown(handler: () => void): () => void {
    this.mouseDownHandlers.add(handler);
    if (this.widget && !this.mouseDownBridge) {
      this.bindMouseDownBridge(this.widget);
    }
    return () => {
      this.mouseDownHandlers.delete(handler);
    };
  }

  /** Open the library Object Tree (layers) for drawings / studies. */
  openObjectTree(): void {
    try {
      this.activeChart()?.executeActionById("paneObjectTree");
    } catch {
      /* chart not ready */
    }
  }

  /** Open the Indicators dialog on this chart. */
  openIndicators(): void {
    try {
      this.activeChart()?.executeActionById("insertIndicator");
    } catch {
      /* chart not ready */
    }
  }

  /** Open symbol search dialog. */
  openSymbolSearch(): void {
    try {
      this.activeChart()?.executeActionById("symbolSearch");
    } catch {
      /* chart not ready */
    }
  }

  /** Toggle the left drawing toolbar (mobile Draw button). */
  toggleDrawingToolbar(): void {
    try {
      this.activeChart()?.executeActionById("drawingToolbarAction");
    } catch {
      /* chart not ready */
    }
  }

  /** Ensure left drawing toolbar starts collapsed (phones). */
  ensureDrawingToolbarCollapsed(): void {
    try {
      const chart = this.activeChart() as
        | (IChartWidgetApi & {
            getCheckableActionState?: (id: string) => boolean;
          })
        | null;
      if (!chart?.getCheckableActionState) return;
      if (chart.getCheckableActionState("drawingToolbarAction")) {
        chart.executeActionById("drawingToolbarAction");
      }
    } catch {
      /* chart not ready */
    }
  }

  undo(): void {
    try {
      this.activeChart()?.executeActionById("undo");
    } catch {
      /* chart not ready */
    }
  }

  redo(): void {
    try {
      this.activeChart()?.executeActionById("redo");
    } catch {
      /* chart not ready */
    }
  }

  openChartProperties(): void {
    try {
      this.activeChart()?.executeActionById("chartProperties");
    } catch {
      /* chart not ready */
    }
  }

  takeScreenshot(): void {
    try {
      void this.widget?.takeScreenshot();
    } catch {
      /* chart not ready */
    }
  }

  /* ── internals ─────────────────────────────────────────────────────── */

  private async applyTheme(mode: ThemeMode): Promise<void> {
    if (!this.widget) return;
    await this.widget.changeTheme(mode);
    this.widget.applyOverrides(chartOverrides(mode) ?? {});
  }

  private activeChart(): IChartWidgetApi | null {
    return this.isReady ? (this.widget?.activeChart() ?? null) : null;
  }

  private patch(partial: Partial<ChartState>): void {
    this.state.update((current) => ({ ...current, ...partial }));
  }

  private scheduleCrosshair(params: CrossHairMovedEventParams): void {
    cancelAnimationFrame(this.crosshairFrame);
    this.crosshairFrame = requestAnimationFrame(() => {
      const series = params.entityValues?.[MAIN_SERIES_ID as EntityId];
      this.crosshair.set({
        time: params.time,
        price: params.price,
        values: series?.values.map(({ title, value }) => ({ title, value })) ?? [],
      });
    });
  }
}
