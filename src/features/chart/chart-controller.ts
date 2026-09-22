import { createStore, type Store, type ThemeMode } from "@/application";
import type { Interval } from "@/domain";
import { chartOverrides, type CrossHairMovedEventParams, type EntityId, type IChartingLibraryWidget, type IChartWidgetApi, type ResolutionString } from "@/infrastructure/tradingview";

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

  constructor(symbol: string, interval: Interval) {
    this.state = createStore<ChartState>({ symbol, interval, ready: false, error: null });
  }

  /** Call from `onChartReady`. */
  attach(widget: IChartingLibraryWidget): void {
    this.widget = widget;
    const chart = widget.activeChart();

    const syncSymbol = () => {
      const ext = chart.symbolExt();
      this.patch({ symbol: stripExchange(ext?.ticker ?? ext?.name ?? chart.symbol()) });
    };
    chart.onSymbolChanged().subscribe(null, syncSymbol);
    chart.onIntervalChanged().subscribe(null, (interval) => this.patch({ interval }));
    chart.crossHairMoved().subscribe(null, (params) => this.scheduleCrosshair(params));

    this.patch({ ready: true, error: null, symbol: stripExchange(chart.symbol()), interval: chart.resolution() });

    // Force candle close countdown even if autosaved chart state turned it off.
    widget.applyOverrides({ "mainSeriesProperties.showCountdown": true });

    if (this.desiredTheme && this.desiredTheme !== widget.getTheme()) void this.applyTheme(this.desiredTheme);
  }

  detach(): void {
    cancelAnimationFrame(this.crosshairFrame);
    this.widget = null;
    this.patch({ ready: false });
  }

  fail(message: string): void {
    this.patch({ ready: false, error: message });
  }

  get isReady(): boolean {
    return this.widget !== null && this.state.get().ready;
  }

  setSymbol(ticker: string): void {
    const chart = this.activeChart();
    if (!chart) return;
    void chart.setSymbol(ticker);
  }

  setInterval(interval: Interval): void {
    this.activeChart()?.setResolution(interval as ResolutionString);
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
          overrides: { linecolor: color, textcolor: color, linestyle: 2, linewidth: 1, showLabel: true },
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
