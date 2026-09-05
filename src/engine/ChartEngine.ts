import { intervalSeconds } from "../data/interval";
import { chartStyleMatchesTheme, defaultChartStyle } from "../chartStyle";
import { hitHandle, hitTestDrawing, isDrawingTool, isOpenEnded, neededPoints, paintDrawing, defaultFibStyleForKind } from "./drawings";
import { bollinger, ema, heikinAshi, macd, rsi, sma } from "./indicators";
import { clamp, formatPrice, formatTime, formatVolume, niceTicks, uid, snapAngle45 } from "./math";
import { atr, stoch, vwap, wma } from "./studies";
import { AXIS_FONT, CHART_FONT, CHART_FONT_BOLD, palettes } from "./theme";
import type {
  Bar,
  ChartPoint,
  ChartStyle,
  ChartType,
  Drawing,
  DrawingContextMenu,
  DrawingVisibility,
  EngineSnapshot,
  IndicatorInstance,
  Interval,
  LegendLine,
  MagnetMode,
  RangePreset,
  ChartSource,
  SymbolInfo,
  Theme,
  Tool,
} from "./types";
import { DEFAULT_DRAWING_VISIBILITY } from "./types";

const PRICE_AXIS = 78;
const TIME_AXIS = 28;
const COLORS = ["#2962ff", "#ff6d00", "#26a69a", "#ab47bc", "#42a5f5", "#ec407a", "#ffca28"];
const RANGE_SEC: Record<RangePreset, number> = {
  "1D": 86400,
  "5D": 86400 * 5,
  "1M": 86400 * 30,
  "3M": 86400 * 90,
  "6M": 86400 * 180,
  YTD: 86400 * 220,
  "1Y": 86400 * 365,
  "5Y": 86400 * 365 * 5,
  ALL: 1e12,
};

type Rect = { x: number; y: number; w: number; h: number };
type Listener = () => void;
type HistoryState = {
  drawings: Drawing[];
  indicators: IndicatorInstance[];
  chartType: ChartType;
};

function cloneDrawings(rows: Drawing[]): Drawing[] {
  return rows.map((d) => ({
    ...d,
    points: d.points.map((p) => ({ ...p })),
    visibility: d.visibility ? { ...d.visibility } : undefined,
    fib: d.fib
      ? {
          ...d.fib,
          levels: d.fib.levels.map((l) => ({ ...l })),
        }
      : undefined,
  }));
}

function visibilityBucket(interval: Interval): keyof DrawingVisibility {
  if (/^\d+S$/i.test(interval)) return "seconds";
  if (/^\d+W$/i.test(interval)) return "weekly";
  if (/^\d+M$/i.test(interval)) return "monthly";
  if (/^\d+D$/i.test(interval)) return "daily";
  if (/^\d+R$/i.test(interval)) return "daily";
  const n = Number(interval);
  if (Number.isFinite(n)) {
    if (n >= 60) return "hours";
    return "minutes";
  }
  return "daily";
}

function drawingShownOnInterval(d: Drawing, interval: Interval): boolean {
  if (d.visible === false) return false;
  const vis = d.visibility ?? DEFAULT_DRAWING_VISIBILITY;
  return vis[visibilityBucket(interval)] !== false;
}

function cloneIndicators(rows: IndicatorInstance[]): IndicatorInstance[] {
  return rows.map((i) => ({ ...i, params: [...i.params] }));
}

export class ChartEngine {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private ro: ResizeObserver;
  private bars: Bar[] = [];
  private fullBars: Bar[] = [];
  private compareBars: Bar[] | null = null;
  private compareTicker: string | null = null;
  private viewCount = 160;
  private viewEnd = 0;
  private symbol: SymbolInfo;
  private interval: Interval = "60";
  private chartType: ChartType = "candle";
  private tool: Tool = "crosshair";
  private glyph = "★";
  private theme: Theme = "dark";
  private chartStyle: ChartStyle = defaultChartStyle("dark");
  private canvasSettings: import("./types").CanvasSettings = {
    showOhlc: true,
    showVolumeLegend: true,
    showBarChange: true,
    showWatermark: true,
    showCountdown: true,
    showHighLow: true,
    showPrevDayClose: true,
    showNavButtons: true,
    showTrackerBox: true,
    showLastPriceLine: true,
    bgColor: "",
    gridColor: "",
    crosshairColor: "",
    crosshairStyle: "dashed",
    crosshairWidth: 1,
    gridMode: "both",
    watermarkOpacity: 0.07,
  };
  private logScale = false;
  private percentScale = false;
  private magnet: MagnetMode = "weak";
  private showGrid = true;
  private hover: Bar | null = null;
  private mouse: { x: number; y: number } | null = null;
  private indicators: IndicatorInstance[] = [
    { id: uid("ind"), kind: "vol", pane: "volume", params: [], visible: true, color: "#787b86" },
    { id: uid("ind"), kind: "sma", pane: "main", params: [20], visible: true, color: "#2962ff" },
    { id: uid("ind"), kind: "ema", pane: "main", params: [50], visible: true, color: "#ff6d00" },
  ];
  private drawings: Drawing[] = [];
  private draft: Drawing | null = null;
  private selectedId: string | null = null;
  private selectedIndicatorId: string | null = null;
  private drawingPropsId: string | null = null;
  private drawingMenu: DrawingContextMenu | null = null;
  private dragging: "pan" | "drawing" | "zoom" | "brush" | "priceAxis" | "timeAxis" | "pinch" | null = null;
  private dragHandle: number | null = null;
  private dragFrom: ChartPoint | null = null;
  private dragDirty = false;
  private dragLastX = 0;
  private dragLastY = 0;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinchStartDist = 0;
  private pinchStartCount = 0;
  private pinchAnchor = 0;
  private gestureMoved = false;
  private lastTapAt = 0;
  private lastTapX = 0;
  private lastTapY = 0;
  private priceSpan: number | null = null;
  private priceMid: number | null = null;
  private demoTrail: Array<{ x: number; y: number; t: number }> = [];
  private replay = false;
  private replaySelecting = false;
  private replayPlaying = false;
  private replaySpeed = 1;
  private replayStartIndex: number | null = null;
  private replayHoverIndex: number | null = null;
  private stayMode = false;
  private hideDrawings = false;
  private hideIndicators = false;
  private snapIndicators = false;
  private lockDrawings = false;
  private fitMode = true;
  private rangePreset: RangePreset = "1M";
  private undoStack: HistoryState[] = [];
  private redoStack: HistoryState[] = [];
  private listeners = new Set<Listener>();
  private raf = 0;
  private countdownTimer = 0;
  private snapshot: EngineSnapshot;

  constructor(container: HTMLElement, symbol: SymbolInfo) {
    this.container = container;
    this.symbol = symbol;
    this.canvas = document.createElement("canvas");
    this.canvas.className = "forge-canvas";
    this.canvas.tabIndex = 0;
    this.canvas.style.touchAction = "none";
    container.appendChild(this.canvas);
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D is not available");
    this.ctx = ctx;
    this.bind();
    this.snapshot = this.buildSnapshot();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();
    this.countdownTimer = window.setInterval(() => {
      if (!this.canvasSettings.showCountdown) return;
      const next = this.countdown();
      if (next !== this.snapshot.countdown) {
        this.emit();
        this.draw();
      }
    }, 1000);
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): EngineSnapshot => this.snapshot;

  /** View metrics for diagnostics / embed hosts. */
  getViewMetrics(): { viewCount: number; viewEnd: number; fitMode: boolean; bars: number; tool: Tool } {
    return {
      viewCount: this.viewCount,
      viewEnd: this.viewEnd,
      fitMode: this.fitMode,
      bars: this.bars.length,
      tool: this.tool,
    };
  }

  private buildSnapshot(): EngineSnapshot {
    return {
      symbol: this.symbol,
      interval: this.interval,
      chartType: this.chartType,
      tool: this.tool,
      theme: this.theme,
      logScale: this.logScale,
      percentScale: this.percentScale,
      magnet: this.magnet,
      showGrid: this.showGrid,
      hover: this.hover,
      last: this.bars.at(-1) ?? null,
      indicators: this.indicators,
      drawings: this.drawings,
      selectedId: this.selectedId,
      selectedIndicatorId: this.selectedIndicatorId,
      drawingPropsId: this.drawingPropsId,
      drawingMenu: this.drawingMenu,
      replay: this.replay,
      replaySelecting: this.replaySelecting,
      replayPlaying: this.replayPlaying,
      replaySpeed: this.replaySpeed,
      replayStartIndex: this.replayStartIndex,
      stayMode: this.stayMode,
      hideDrawings: this.hideDrawings,
      hideIndicators: this.hideIndicators,
      snapIndicators: this.snapIndicators,
      lockDrawings: this.lockDrawings,
      fitMode: this.fitMode,
      countdown: this.countdown(),
      legend: this.legendLines(),
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
      compare: this.compareTicker,
      rangePreset: this.rangePreset,
      autoScale: this.priceSpan == null,
      chartStyle: this.chartStyle,
      canvas: { ...this.canvasSettings },
    };
  }

  setBars(bars: Bar[]): void {
    this.fullBars = bars;
    if (this.replay && this.replayStartIndex != null) {
      this.bars = bars.slice(0, Math.min(bars.length, Math.max(this.bars.length, this.replayStartIndex + 1)));
    } else if (this.replay) {
      this.bars = bars.slice(0, Math.max(30, Math.floor(bars.length * 0.7)));
    } else {
      this.bars = bars;
    }
    this.applyMobileDefaultView();
    this.snapToLatest();
    this.hover = this.bars.at(-1) ?? null;
    this.emit();
    this.draw();
  }

  private applyMobileDefaultView(): void {
    if (!this.fitMode) return;
    const w = this.container.clientWidth;
    if (w <= 0 || w >= 520) return;
    const target = Math.round((w - this.priceAxisWidth()) / 3.4);
    this.viewCount = this.clampViewCount(clamp(target, 48, 120));
  }

  setSymbol(symbol: SymbolInfo, bars: Bar[]): void {
    this.symbol = symbol;
    this.drawings = [];
    this.draft = null;
    this.selectedId = null;
    this.selectedIndicatorId = null;
    this.drawingPropsId = null;
    this.drawingMenu = null;
    this.compareBars = null;
    this.compareTicker = null;
    this.setBars(bars);
  }

  setInterval(interval: Interval, bars: Bar[]): void {
    this.interval = interval;
    this.setBars(bars);
  }

  setChartType(type: ChartType): void {
    if (type === this.chartType) return;
    this.pushUndo();
    this.chartType = type;
    this.emit();
    this.draw();
  }

  setChartStyle(next: Partial<ChartStyle>): void {
    this.chartStyle = { ...this.chartStyle, ...next };
    this.emit();
    this.draw();
  }

  applyChartStyle(style: ChartStyle): void {
    this.chartStyle = { ...style };
    this.emit();
    this.draw();
  }

  setCanvasSettings(next: Partial<import("./types").CanvasSettings>): void {
    this.canvasSettings = { ...this.canvasSettings, ...next };
    this.emit();
    this.draw();
  }

  /** Get a PNG data URL for snapshot operations. */
  toDataUrl(type = "image/png"): string {
    return this.canvas.toDataURL(type);
  }

  setTool(tool: Tool, extra?: { text?: string }): void {
    this.tool = tool;
    if (extra?.text) this.glyph = extra.text;
    this.draft = null;
    this.emit();
    this.draw();
  }

  setTheme(theme: Theme): void {
    const prev = this.theme;
    if (chartStyleMatchesTheme(this.chartStyle, prev)) {
      this.chartStyle = defaultChartStyle(theme);
    }
    this.theme = theme;
    this.emit();
    this.draw();
  }

  setMagnet(mode: MagnetMode): void {
    this.magnet = mode;
    this.emit();
  }

  toggle(
    flag: "logScale" | "percentScale" | "showGrid" | "stayMode" | "hideDrawings" | "hideIndicators" | "snapIndicators" | "lockDrawings" | "fitMode",
  ): void {
    this[flag] = !this[flag];
    this.emit();
    this.draw();
  }

  /** Hide drawings + indicators together (D-AX-11). */
  toggleHideAll(): void {
    const next = !(this.hideDrawings && this.hideIndicators);
    this.hideDrawings = next;
    this.hideIndicators = next;
    this.emit();
    this.draw();
  }

  clearIndicators(): void {
    this.pushUndo();
    this.indicators = [];
    this.selectedIndicatorId = null;
    this.emit();
    this.draw();
  }

  /** Remove drawings and indicators (D-AX-15). */
  clearDrawingsAndIndicators(): void {
    if (this.lockDrawings) {
      this.clearIndicators();
      return;
    }
    this.pushUndo();
    this.drawings = [];
    this.draft = null;
    this.selectedId = null;
    this.drawingPropsId = null;
    this.drawingMenu = null;
    this.indicators = [];
    this.selectedIndicatorId = null;
    this.emit();
    this.draw();
  }

  cycleMagnet(): void {
    this.magnet = this.magnet === "off" ? "weak" : this.magnet === "weak" ? "strong" : "off";
    this.emit();
  }

  addIndicator(kind: IndicatorInstance["kind"]): void {
    const pane =
      kind === "rsi" ? "rsi" : kind === "macd" ? "macd" : kind === "stoch" ? "stoch" : kind === "atr" ? "atr" : kind === "vol" ? "volume" : "main";
    const params =
      kind === "sma" || kind === "ema" || kind === "wma"
        ? [20]
        : kind === "bb"
          ? [20, 2]
          : kind === "rsi" || kind === "atr"
            ? [14]
            : kind === "stoch"
              ? [14, 3]
              : kind === "vol"
                ? []
                : [12, 26, 9];
    this.pushUndo();
    this.indicators.push({
      id: uid("ind"),
      kind,
      pane,
      params,
      visible: true,
      color: COLORS[this.indicators.length % COLORS.length],
    });
    this.emit();
    this.draw();
  }

  setIndicatorsFromTemplate(
    items: Array<{
      kind: IndicatorInstance["kind"];
      params: number[];
      visible: boolean;
      color: string;
      lineWidth?: number;
      lineStyle?: IndicatorInstance["lineStyle"];
      source?: IndicatorInstance["source"];
      pane?: IndicatorInstance["pane"];
    }>,
  ): void {
    this.pushUndo();
    this.indicators = items.map((item, index) => {
      const pane =
        item.pane ??
        (item.kind === "rsi"
          ? "rsi"
          : item.kind === "macd"
            ? "macd"
            : item.kind === "stoch"
              ? "stoch"
              : item.kind === "atr"
                ? "atr"
                : item.kind === "vol"
                  ? "volume"
                  : "main");
      return {
        id: uid("ind"),
        kind: item.kind,
        pane,
        params: [...item.params],
        visible: item.visible,
        color: item.color || COLORS[index % COLORS.length],
        lineWidth: item.lineWidth,
        lineStyle: item.lineStyle,
        source: item.source,
      };
    });
    this.selectedIndicatorId = null;
    this.emit();
    this.draw();
  }

  removeIndicator(id: string): void {
    this.pushUndo();
    this.indicators = this.indicators.filter((i) => i.id !== id);
    if (this.selectedIndicatorId === id) this.selectedIndicatorId = null;
    this.emit();
    this.draw();
  }

  selectIndicator(id: string | null): void {
    this.selectedIndicatorId = id;
    if (id) this.selectedId = null;
    this.emit();
    this.draw();
  }

  updateIndicator(
    id: string,
    patch: Partial<Pick<IndicatorInstance, "params" | "color" | "visible" | "lineWidth" | "lineStyle" | "source">>,
  ): void {
    this.pushUndo();
    this.indicators = this.indicators.map((i) => (i.id === id ? { ...i, ...patch, params: patch.params ? [...patch.params] : i.params } : i));
    this.emit();
    this.draw();
  }

  cloneIndicator(id: string): string | null {
    const src = this.indicators.find((i) => i.id === id);
    if (!src) return null;
    this.pushUndo();
    const copy: IndicatorInstance = {
      ...src,
      id: uid("ind"),
      params: [...src.params],
      visible: true,
    };
    const idx = this.indicators.findIndex((i) => i.id === id);
    const next = [...this.indicators];
    next.splice(idx + 1, 0, copy);
    this.indicators = next;
    this.selectedIndicatorId = copy.id;
    this.selectedId = null;
    this.emit();
    this.draw();
    return copy.id;
  }

  reorderIndicator(id: string, mode: "front" | "back" | "forward" | "backward"): void {
    const idx = this.indicators.findIndex((i) => i.id === id);
    if (idx < 0) return;
    this.pushUndo();
    const next = [...this.indicators];
    const [item] = next.splice(idx, 1);
    if (mode === "front") next.push(item);
    else if (mode === "back") next.unshift(item);
    else if (mode === "forward") next.splice(Math.min(next.length, idx + 1), 0, item);
    else next.splice(Math.max(0, idx - 1), 0, item);
    this.indicators = next;
    this.emit();
    this.draw();
  }

  selectDrawing(id: string | null): void {
    this.selectedId = id;
    if (id) this.selectedIndicatorId = null;
    if (!id) {
      this.drawingPropsId = null;
      this.drawingMenu = null;
    }
    this.emit();
    this.draw();
  }

  openDrawingProperties(id: string): void {
    this.selectedId = id;
    this.selectedIndicatorId = null;
    this.drawingPropsId = id;
    this.drawingMenu = null;
    this.emit();
    this.draw();
  }

  closeDrawingProperties(): void {
    if (!this.drawingPropsId) return;
    this.drawingPropsId = null;
    this.emit();
  }

  openDrawingMenu(id: string, x: number, y: number): void {
    this.selectedId = id;
    this.selectedIndicatorId = null;
    this.drawingMenu = { id, x, y };
    this.drawingPropsId = null;
    this.emit();
    this.draw();
  }

  closeDrawingMenu(): void {
    if (!this.drawingMenu) return;
    this.drawingMenu = null;
    this.emit();
  }

  updateDrawing(
    id: string,
    patch: Partial<
      Pick<
        Drawing,
        | "color"
        | "lineWidth"
        | "lineStyle"
        | "text"
        | "locked"
        | "visible"
        | "visibility"
        | "points"
        | "fib"
        | "scaleRatio"
        | "leftEnd"
        | "rightEnd"
      >
    >,
  ): void {
    this.pushUndo();
    this.drawings = this.drawings.map((d) => {
      if (d.id !== id) return d;
      const next: Drawing = { ...d, ...patch };
      if (patch.points) next.points = patch.points.map((p) => ({ ...p }));
      if (patch.visibility) next.visibility = { ...DEFAULT_DRAWING_VISIBILITY, ...d.visibility, ...patch.visibility };
      if (patch.fib) {
        const prev = d.fib ?? defaultFibStyleForKind(d.kind) ?? defaultFibStyleForKind("fib")!;
        next.fib = {
          ...prev,
          ...patch.fib,
          levels: (patch.fib.levels ?? prev.levels).map((l) => ({ ...l })),
        };
      }
      return next;
    });
    this.emit();
    this.draw();
  }

  setDrawingPoint(id: string, index: number, point: ChartPoint): void {
    const d = this.drawings.find((item) => item.id === id);
    if (!d || d.locked || index < 0 || index >= d.points.length) return;
    const points = d.points.map((p, i) => (i === index ? { ...point } : { ...p }));
    const next: Drawing = { ...d, points };
    if (next.kind === "gannsquarefixed") this.constrainGannSquareFixed(next, index === 0 ? 0 : 1);
    this.updateDrawing(id, { points: next.points, scaleRatio: next.scaleRatio });
  }

  cloneDrawing(id: string): string | null {
    if (this.lockDrawings) return null;
    const src = this.drawings.find((d) => d.id === id);
    if (!src) return null;
    this.pushUndo();
    const step = intervalSeconds(this.interval) || 60;
    const copy: Drawing = {
      ...src,
      id: uid("dr"),
      locked: false,
      visible: true,
      points: src.points.map((p) => ({ time: p.time + step * 3, price: p.price })),
      visibility: src.visibility ? { ...src.visibility } : undefined,
      fib: src.fib
        ? {
            ...src.fib,
            levels: src.fib.levels.map((l) => ({ ...l })),
          }
        : undefined,
    };
    this.drawings = [...this.drawings, copy];
    this.selectedId = copy.id;
    this.selectedIndicatorId = null;
    this.drawingMenu = null;
    this.emit();
    this.draw();
    return copy.id;
  }

  reorderDrawing(id: string, mode: "front" | "back" | "forward" | "backward"): void {
    const idx = this.drawings.findIndex((d) => d.id === id);
    if (idx < 0) return;
    this.pushUndo();
    const next = [...this.drawings];
    const [item] = next.splice(idx, 1);
    if (mode === "front") next.push(item);
    else if (mode === "back") next.unshift(item);
    else if (mode === "forward") next.splice(Math.min(next.length, idx + 1), 0, item);
    else next.splice(Math.max(0, idx - 1), 0, item);
    this.drawings = next;
    this.emit();
    this.draw();
  }

  toggleIndicator(id: string): void {
    this.pushUndo();
    this.indicators = this.indicators.map((i) => (i.id === id ? { ...i, visible: !i.visible } : i));
    this.emit();
    this.draw();
  }

  removeDrawing(id: string): void {
    if (this.lockDrawings) return;
    this.pushUndo();
    this.drawings = this.drawings.filter((d) => d.id !== id);
    if (this.selectedId === id) this.selectedId = null;
    if (this.drawingPropsId === id) this.drawingPropsId = null;
    if (this.drawingMenu?.id === id) this.drawingMenu = null;
    this.emit();
    this.draw();
  }

  clearDrawings(): void {
    if (this.lockDrawings) return;
    this.pushUndo();
    this.drawings = [];
    this.draft = null;
    this.selectedId = null;
    this.drawingPropsId = null;
    this.drawingMenu = null;
    this.emit();
    this.draw();
  }

  undo(): void {
    const prev = this.undoStack.pop();
    if (!prev) return;
    const keepSel = this.selectedId;
    const keepInd = this.selectedIndicatorId;
    this.redoStack.push({
      drawings: cloneDrawings(this.drawings),
      indicators: cloneIndicators(this.indicators),
      chartType: this.chartType,
    });
    this.drawings = cloneDrawings(prev.drawings);
    this.indicators = cloneIndicators(prev.indicators);
    this.chartType = prev.chartType;
    this.selectedId = keepSel && this.drawings.some((d) => d.id === keepSel) ? keepSel : null;
    this.selectedIndicatorId =
      keepInd && this.indicators.some((i) => i.id === keepInd) ? keepInd : null;
    this.drawingPropsId = null;
    this.drawingMenu = null;
    this.emit();
    this.draw();
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    const keepSel = this.selectedId;
    const keepInd = this.selectedIndicatorId;
    this.undoStack.push({
      drawings: cloneDrawings(this.drawings),
      indicators: cloneIndicators(this.indicators),
      chartType: this.chartType,
    });
    this.drawings = cloneDrawings(next.drawings);
    this.indicators = cloneIndicators(next.indicators);
    this.chartType = next.chartType;
    this.selectedId = keepSel && this.drawings.some((d) => d.id === keepSel) ? keepSel : null;
    this.selectedIndicatorId =
      keepInd && this.indicators.some((i) => i.id === keepInd) ? keepInd : null;
    this.drawingPropsId = null;
    this.drawingMenu = null;
    this.emit();
    this.draw();
  }

  zoom(dir: 1 | -1): void {
    this.setViewCount(this.viewCount * (dir > 0 ? 0.82 : 1.22), this.viewStart() + this.viewCount * 0.5);
    this.fitMode = false;
    this.emit();
    this.draw();
  }

  resetPriceScale(): void {
    this.priceSpan = null;
    this.priceMid = null;
    this.emit();
    this.draw();
  }

  /** TradingView-style: fit time scale to recent bars and scroll to latest. */
  fitTimeScale(): void {
    this.fitMode = true;
    this.applyMobileDefaultView();
    if (this.container.clientWidth >= 520) {
      this.viewCount = this.clampViewCount(140);
    }
    this.snapToLatest();
    this.emit();
    this.draw();
  }

  /** Fit both price (auto) and time scales — double-click empty chart. */
  fitContent(): void {
    this.rangePreset = "1M";
    this.fitTimeScale();
    this.resetPriceScale();
  }

  upsertBar(bar: Bar): void {
    if (this.replay) return;
    const last = this.bars.at(-1);
    const follow = this.isFollowing();
    if (last && bar.time === last.time) {
      this.bars = [...this.bars.slice(0, -1), bar];
    } else if (!last || bar.time > last.time) {
      this.bars = [...this.bars, bar];
    } else {
      return;
    }
    this.fullBars = this.bars;
    if (follow) this.snapToLatest();
    this.emit();
    this.draw();
  }

  applyRange(preset: RangePreset): void {
    this.rangePreset = preset;
    const span = RANGE_SEC[preset] / intervalSeconds(this.interval);
    const count = preset === "ALL" ? Math.max(this.bars.length, 40) : Math.round(span);
    this.viewCount = this.clampViewCount(count);
    this.snapToLatest();
    this.fitMode = true;
    this.priceSpan = null;
    this.priceMid = null;
    this.emit();
    this.draw();
  }

  setCompare(ticker: string | null, bars: Bar[] | null): void {
    this.compareTicker = ticker;
    this.compareBars = bars;
    this.emit();
    this.draw();
  }

  setReplay(on: boolean): void {
    if (on) {
      this.replay = true;
      this.replaySelecting = true;
      this.replayPlaying = false;
      this.replayStartIndex = null;
      this.replayHoverIndex = null;
      this.bars = this.fullBars;
      this.snapToLatest();
    } else {
      this.jumpToRealtime();
      return;
    }
    this.emit();
    this.draw();
  }

  /** Re-enter start-bar picker while already in replay (TV “Go to…” / Select bar). */
  beginReplaySelect(): void {
    if (!this.replay) {
      this.setReplay(true);
      return;
    }
    this.replaySelecting = true;
    this.replayPlaying = false;
    this.bars = this.fullBars;
    this.snapToLatest();
    this.emit();
    this.draw();
  }

  selectReplayStart(index: number): void {
    if (!this.fullBars.length) return;
    const idx = clamp(Math.floor(index), 0, this.fullBars.length - 1);
    this.replay = true;
    this.replaySelecting = false;
    this.replayPlaying = false;
    this.replayStartIndex = idx;
    this.replayHoverIndex = null;
    this.bars = this.fullBars.slice(0, idx + 1);
    this.snapToLatest();
    this.emit();
    this.draw();
  }

  pickRandomReplayStart(): void {
    if (this.fullBars.length < 50) {
      this.selectReplayStart(Math.max(0, this.fullBars.length - 1));
      return;
    }
    const min = Math.floor(this.fullBars.length * 0.15);
    const max = Math.floor(this.fullBars.length * 0.85);
    this.selectReplayStart(min + Math.floor(Math.random() * Math.max(1, max - min)));
  }

  jumpToRealtime(): void {
    this.replay = false;
    this.replaySelecting = false;
    this.replayPlaying = false;
    this.replayStartIndex = null;
    this.replayHoverIndex = null;
    this.bars = this.fullBars;
    this.snapToLatest();
    this.emit();
    this.draw();
  }

  setReplayPlaying(on: boolean): void {
    if (!this.replay || this.replaySelecting) return;
    this.replayPlaying = on;
    this.emit();
  }

  setReplaySpeed(speed: number): void {
    this.replaySpeed = speed;
    this.emit();
  }

  stepReplay(): void {
    if (!this.replay || this.replaySelecting) return;
    const next = this.fullBars[this.bars.length];
    if (!next) {
      this.replayPlaying = false;
      this.emit();
      return;
    }
    this.bars = [...this.bars, next];
    this.snapToLatest();
    this.emit();
    this.draw();
  }

  /** Logical bar index under pointer for replay selection. */
  replayIndexAtClient(clientX: number, clientY: number): number | null {
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    if (this.hitZone(x, y) !== "chart") return null;
    const layout = this.layout();
    const logical = this.indexAtX(x, this.bars.length, layout.main);
    return clamp(Math.round(logical), 0, Math.max(0, this.fullBars.length - 1));
  }

  setReplayHoverIndex(index: number | null): void {
    if (this.replayHoverIndex === index) return;
    this.replayHoverIndex = index;
    this.emit();
    this.draw();
  }

  patchLastBar(bar: Bar): void {
    if (this.replay) return;
    if (!this.bars.length) return;
    this.bars = [...this.bars.slice(0, -1), bar];
    this.fullBars = this.bars;
    if (this.isFollowing()) this.snapToLatest();
    this.emit();
    this.draw();
  }

  screenshot(): void {
    const a = document.createElement("a");
    a.href = this.canvas.toDataURL("image/png");
    a.download = `${this.symbol.ticker}_${this.interval}.png`;
    a.click();
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    window.clearInterval(this.countdownTimer);
    this.ro.disconnect();
    this.canvas.remove();
    this.listeners.clear();
  }

  private pushUndo(): void {
    this.undoStack.push({
      drawings: cloneDrawings(this.drawings),
      indicators: cloneIndicators(this.indicators),
      chartType: this.chartType,
    });
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack = [];
  }

  private emit(): void {
    this.snapshot = this.buildSnapshot();
    this.listeners.forEach((l) => l());
  }

  private countdown(): string {
    const step = intervalSeconds(this.interval) || 60;
    const now = Math.floor(Date.now() / 1000);
    // Remaining time in the current UTC-aligned period (TradingView-style).
    // Do not use last.time + step — live feeds often stamp bar_close_time, which
    // would make a 1m countdown show ~2 minutes.
    const closeAt = Math.floor(now / step) * step + step;
    const remain = Math.max(0, closeAt - now);
    const m = Math.floor(remain / 60);
    const s = remain % 60;
    if (m > 99) return `${Math.floor(m / 60)}h`;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  private legendLines(): LegendLine[] {
    const bar = this.hover ?? this.bars.at(-1);
    if (!bar) return [];
    const p = this.symbol.pricePrecision;
    const chg = ((bar.close - bar.open) / bar.open) * 100;
    const parts: string[] = [`${this.symbol.ticker}  ${this.interval}`];
    if (this.canvasSettings.showOhlc) {
      parts.push(`O${formatPrice(bar.open, p)} H${formatPrice(bar.high, p)} L${formatPrice(bar.low, p)} C${formatPrice(bar.close, p)}`);
    }
    if (this.canvasSettings.showBarChange) {
      parts.push(`${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%`);
    }
    if (this.canvasSettings.showVolumeLegend && bar.volume > 0) {
      parts.push(`V ${formatVolume(bar.volume)}`);
    }
    const lines: LegendLine[] = [
      {
        id: "sym",
        text: parts.join("  "),
        color: chg >= 0 ? palettes[this.theme].up : palettes[this.theme].down,
      },
    ];
    const plotted = this.plotBars();
    if (!this.hideIndicators) {
      for (const ind of this.indicators) {
        if (!ind.visible) continue;
        const series = this.indicatorSeries(ind, plotted);
        const last = series.lines[0]?.at(-1);
        const extra = series.lines[1]?.at(-1);
        const label =
          last == null
            ? ind.kind.toUpperCase()
            : extra != null
              ? `${ind.kind.toUpperCase()} ${formatPrice(last, 2)} / ${formatPrice(extra, 2)}`
              : `${ind.kind.toUpperCase()} ${ind.params[0] ?? ""}  ${formatPrice(last, ind.kind === "rsi" || ind.kind === "stoch" ? 2 : p)}`;
        lines.push({ id: ind.id, text: label, color: ind.color });
      }
    }
    if (this.compareTicker) lines.push({ id: "cmp", text: `Compare ${this.compareTicker}`, color: "#ab47bc" });
    return lines;
  }

  private bind(): void {
    this.canvas.addEventListener("pointerdown", this.onDown);
    this.canvas.addEventListener("pointermove", this.onMove);
    this.canvas.addEventListener("pointerup", this.onUp);
    this.canvas.addEventListener("pointercancel", this.onUp);
    this.canvas.addEventListener("pointerleave", this.onLeave);
    this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
    this.canvas.addEventListener("dblclick", this.onDbl);
    this.canvas.addEventListener("keydown", this.onKey);
    this.canvas.addEventListener("contextmenu", this.onContextMenu);
    // iOS/Android: block page scroll/bounce while dragging the chart
    this.canvas.addEventListener("touchstart", this.onTouchGuard, { passive: false });
    this.canvas.addEventListener("touchmove", this.onTouchGuard, { passive: false });
  }

  private onTouchGuard = (e: TouchEvent): void => {
    if (e.touches.length >= 1) e.preventDefault();
  };

  private resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.canvas.width = Math.max(1, Math.floor(w * dpr));
    this.canvas.height = Math.max(1, Math.floor(h * dpr));
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Do NOT reset viewCount on every resize — mobile browser chrome
    // show/hide fires ResizeObserver constantly and would undo pan/zoom.
    this.draw();
  }

  private extraIndicators(): IndicatorInstance[] {
    if (this.hideIndicators) return [];
    return this.indicators.filter((i) => i.visible && ["rsi", "macd", "stoch", "atr"].includes(i.pane));
  }

  private layout(): { main: Rect; extras: { rect: Rect; ind: IndicatorInstance }[]; chart: Rect } {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    const chart: Rect = { x: 0, y: 0, w: Math.max(0, w - this.priceAxisWidth()), h: Math.max(0, h - TIME_AXIS) };
    const extrasInd = this.extraIndicators();
    const extraH = extrasInd.length ? Math.min(120, chart.h * 0.18) : 0;
    const mainH = chart.h - extraH * extrasInd.length;
    const extras = extrasInd.map((ind, i) => ({
      ind,
      rect: { x: 0, y: mainH + i * extraH, w: chart.w, h: extraH } satisfies Rect,
    }));
    return { main: { x: 0, y: 0, w: chart.w, h: mainH }, extras, chart };
  }

  private priceAxisWidth(): number {
    const w = this.container.clientWidth;
    return w > 0 && w < 520 ? 54 : PRICE_AXIS;
  }

  private rightPad(): number {
    const narrow = this.container.clientWidth > 0 && this.container.clientWidth < 520;
    return Math.max(narrow ? 4 : 8, this.viewCount * (narrow ? 0.08 : 0.18));
  }

  private clampViewCount(count: number): number {
    const max = Math.max(40, this.bars.length * 4, 400);
    return clamp(count, 8, max);
  }

  private snapToLatest(): void {
    this.viewEnd = this.bars.length + this.rightPad();
    // If history is shorter than the window, shrink so candles fill the plot
    // instead of sitting in one half of an empty viewport.
    if (this.fitMode && this.bars.length > 0 && this.viewStart() < -this.viewCount * 0.08) {
      this.viewCount = this.clampViewCount(this.bars.length + this.rightPad());
      this.viewEnd = this.bars.length + this.rightPad();
    }
  }

  private isFollowing(): boolean {
    return this.viewEnd >= this.bars.length + this.rightPad() * 0.4;
  }

  private viewStart(): number {
    return this.viewEnd - this.viewCount;
  }

  private setViewCount(next: number, anchorIndex?: number): void {
    const old = this.viewCount;
    this.viewCount = this.clampViewCount(next);
    if (anchorIndex != null && old > 0) {
      const keep = (this.viewEnd - anchorIndex) / old;
      this.viewEnd = anchorIndex + keep * this.viewCount;
    }
    this.clampPan();
  }

  private clampPan(): void {
    const minEnd = this.viewCount * 0.12;
    const maxEnd = this.bars.length + this.viewCount * 0.92;
    this.viewEnd = clamp(this.viewEnd, minEnd, Math.max(minEnd, maxEnd));
  }

  private slotWidth(rect: Rect): number {
    return rect.w / Math.max(1, this.viewCount);
  }

  private xOfIndex(index: number, rect: Rect): number {
    return rect.x + (index - this.viewStart() + 0.5) * this.slotWidth(rect);
  }

  private timeAtIndex(index: number): number {
    if (!this.bars.length) return Math.floor(Date.now() / 1000);
    const step = intervalSeconds(this.interval) || 60;
    const whole = (i: number) => {
      if (i >= 0 && i < this.bars.length) return this.bars[i].time;
      if (i >= this.bars.length) {
        const last = this.bars[this.bars.length - 1];
        return last.time + (i - (this.bars.length - 1)) * step;
      }
      return this.bars[0].time + i * step;
    };
    const i0 = Math.floor(index);
    const frac = index - i0;
    if (frac === 0) return whole(i0);
    return whole(i0) + (whole(i0 + 1) - whole(i0)) * frac;
  }

  private viewSlice(): { from: number; to: number } {
    if (!this.bars.length) return { from: 0, to: 0 };
    const from = clamp(Math.floor(this.viewStart()), 0, this.bars.length);
    const to = clamp(Math.ceil(this.viewEnd), 0, this.bars.length);
    if (from >= to) return { from: Math.max(0, this.bars.length - 1), to: this.bars.length };
    return { from, to };
  }

  private plotBars(): Bar[] {
    const { from, to } = this.viewSlice();
    return this.transformBars(this.bars.slice(from, to));
  }

  private transformBars(src: Bar[]): Bar[] {
    if (this.chartType === "heikin") return heikinAshi(src);
    if (this.chartType === "renko") return this.toRenko(src, Math.max(this.avgRange(src) * 0.75, 1e-6));
    if (this.chartType === "rangechart") return this.toRenko(src, Math.max(this.avgRange(src) * 0.55, 1e-6));
    if (this.chartType === "linebreak") return this.toLineBreak(src);
    if (this.chartType === "kagi") return this.toKagi(src);
    if (this.chartType === "pnf") return this.toPointFigure(src);
    return src;
  }

  private avgRange(src: Bar[]): number {
    if (!src.length) return 1;
    return src.reduce((sum, bar) => sum + Math.abs(bar.high - bar.low), 0) / src.length;
  }

  private toRenko(src: Bar[], brick: number): Bar[] {
    if (src.length < 2) return src;
    const out: Bar[] = [];
    let lastClose = src[0].close;
    for (const bar of src) {
      let next = bar.close;
      while (Math.abs(next - lastClose) >= brick) {
        const dir = Math.sign(next - lastClose) || 1;
        const close = lastClose + dir * brick;
        out.push({
          time: bar.time,
          open: lastClose,
          high: Math.max(lastClose, close),
          low: Math.min(lastClose, close),
          close,
          volume: bar.volume,
        });
        lastClose = close;
        next = bar.close;
      }
    }
    return out.length ? out : src;
  }

  private toLineBreak(src: Bar[]): Bar[] {
    if (src.length < 2) return src;
    const out: Bar[] = [src[0]];
    for (let i = 1; i < src.length; i++) {
      const last = out[out.length - 1];
      const window = out.slice(-3);
      const max = Math.max(...window.map((b) => b.high));
      const min = Math.min(...window.map((b) => b.low));
      const close = src[i].close;
      if (close > max || close < min) {
        out.push({
          time: src[i].time,
          open: last.close,
          high: Math.max(last.close, close),
          low: Math.min(last.close, close),
          close,
          volume: src[i].volume,
        });
      }
    }
    return out.length ? out : src;
  }

  private toKagi(src: Bar[]): Bar[] {
    if (src.length < 2) return src;
    const out: Bar[] = [src[0]];
    const rev = Math.max(this.avgRange(src) * 1.2, 1e-6);
    let pivot = src[0].close;
    for (let i = 1; i < src.length; i++) {
      const close = src[i].close;
      const last = out[out.length - 1];
      if (Math.abs(close - pivot) >= rev || (close - last.close) * (last.close - last.open) >= 0) {
        out.push({
          time: src[i].time,
          open: last.close,
          high: Math.max(last.close, close),
          low: Math.min(last.close, close),
          close,
          volume: src[i].volume,
        });
        if (Math.abs(close - pivot) >= rev) pivot = close;
      }
    }
    return out.length ? out : src;
  }

  private toPointFigure(src: Bar[]): Bar[] {
    if (src.length < 2) return src;
    const box = Math.max(this.avgRange(src) * 0.5, 1e-6);
    const out: Bar[] = [];
    let anchor = src[0].close;
    for (const bar of src) {
      const diff = bar.close - anchor;
      const boxes = Math.trunc(diff / box);
      if (!boxes) continue;
      for (let i = 0; i < Math.abs(boxes); i++) {
        const close = anchor + Math.sign(boxes) * box;
        out.push({
          time: bar.time,
          open: anchor,
          high: Math.max(anchor, close),
          low: Math.min(anchor, close),
          close,
          volume: bar.volume,
        });
        anchor = close;
      }
    }
    return out.length ? out : src;
  }

  private baseClose(bars: Bar[]): number {
    return bars[0]?.close || 1;
  }

  private sourceValue(bar: Bar, source: ChartSource = this.chartStyle.source): number {
    if (source === "open") return bar.open;
    if (source === "high") return bar.high;
    if (source === "low") return bar.low;
    if (source === "hl2") return (bar.high + bar.low) / 2;
    if (source === "hlc3") return (bar.high + bar.low + bar.close) / 3;
    if (source === "ohlc4") return (bar.open + bar.high + bar.low + bar.close) / 4;
    return bar.close;
  }

  private scaled(price: number, bars: Bar[]): number {
    if (!this.percentScale) return price;
    return ((price - this.baseClose(bars)) / this.baseClose(bars)) * 100;
  }

  private priceRange(bars: Bar[]): { min: number; max: number } {
    if (!bars.length) return { min: 0, max: 1 };
    let min = Infinity;
    let max = -Infinity;
    for (const b of bars) {
      min = Math.min(min, this.scaled(b.low, bars));
      max = Math.max(max, this.scaled(b.high, bars));
    }
    for (const ind of this.indicators) {
      if (!ind.visible || ind.pane !== "main") continue;
      const series = this.indicatorSeries(ind, bars);
      for (const v of series.lines.flat()) {
        if (v != null) {
          min = Math.min(min, this.scaled(v, bars));
          max = Math.max(max, this.scaled(v, bars));
        }
      }
    }
    if (min === max) {
      min -= 1;
      max += 1;
    }
    const pad = (max - min) * 0.16;
    const autoMin = min - pad;
    const autoMax = max + pad;
    if (this.priceSpan != null && this.priceMid != null) {
      return { min: this.priceMid - this.priceSpan / 2, max: this.priceMid + this.priceSpan / 2 };
    }
    return { min: autoMin, max: autoMax };
  }

  private xOf(indexInView: number, _count: number, rect: Rect): number {
    return this.xOfIndex(this.viewSlice().from + indexInView, rect);
  }

  private yOf(price: number, min: number, max: number, rect: Rect): number {
    const p = this.logScale ? Math.log(Math.max(Math.abs(price) < 1e-9 ? 1e-9 : price, 1e-9)) : price;
    const a = this.logScale ? Math.log(Math.max(min, 1e-9)) : min;
    const b = this.logScale ? Math.log(Math.max(max, 1e-9)) : max;
    return rect.y + rect.h * (1 - (p - a) / (b - a || 1));
  }

  private priceAtY(y: number, min: number, max: number, rect: Rect): number {
    const t = 1 - (y - rect.y) / (rect.h || 1);
    if (this.logScale) {
      const a = Math.log(Math.max(min, 1e-9));
      const b = Math.log(Math.max(max, 1e-9));
      return Math.exp(a + (b - a) * t);
    }
    return min + (max - min) * t;
  }

  private indexAtX(x: number, _count: number, rect: Rect): number {
    const logical = this.viewStart() + (x - rect.x) / this.slotWidth(rect) - 0.5;
    return logical;
  }

  /** DI-14 — project target onto nearest 45° from anchor in screen space. */
  private shiftSnapPoint(anchor: ChartPoint, target: ChartPoint): ChartPoint {
    const { main } = this.layout();
    const bars = this.plotBars();
    const rangeBars = bars.length ? bars : this.bars.slice(-40);
    if (!rangeBars.length) return target;
    const range = this.priceRange(rangeBars);
    const a = this.locate(anchor, rangeBars, range, main);
    const b = this.locate(target, rangeBars, range, main);
    const s = snapAngle45(a.x, a.y, b.x, b.y);
    return this.pointFromMouse(s.x, s.y) ?? target;
  }

  private pointFromMouse(x: number, y: number): ChartPoint | null {
    const { main } = this.layout();
    const visible = this.plotBars();
    const rangeSource = visible.length ? visible : this.bars.slice(-30);
    if (!this.bars.length || !rangeSource.length) return null;
    const range = this.priceRange(rangeSource);
    let price = this.priceAtY(y, range.min, range.max, main);
    if (this.percentScale) price = this.baseClose(rangeSource) * (1 + price / 100);
    const logical = this.viewStart() + (x - main.x) / this.slotWidth(main) - 0.5;
    const i0 = Math.floor(logical);
    const t = logical - i0;
    let time = this.timeAtIndex(i0) + (this.timeAtIndex(i0 + 1) - this.timeAtIndex(i0)) * t;
    const idx = clamp(Math.round(logical), 0, Math.max(0, this.bars.length - 1));
    const bar = this.bars[idx];
    if (this.magnet !== "off" && bar && logical >= -0.5 && logical <= this.bars.length - 0.5) {
      const candidates = [bar.open, bar.high, bar.low, bar.close];
      if (this.snapIndicators) {
        for (const ind of this.indicators) {
          if (!ind.visible || ind.pane !== "main") continue;
          const { lines } = this.indicatorSeries(ind, this.bars);
          for (const line of lines) {
            const v = line[idx];
            if (v != null && Number.isFinite(v)) candidates.push(v);
          }
        }
      }
      const nearest = candidates.reduce((best, v) => (Math.abs(v - price) < Math.abs(best - price) ? v : best));
      const dyPx = Math.abs(this.yOf(nearest, range.min, range.max, main) - y);
      const weakPx = 12;
      if (this.magnet === "strong" || dyPx <= weakPx) {
        price = nearest;
        time = bar.time;
      }
    }
    return { time, price };
  }

  private indicatorSeries(ind: IndicatorInstance, src: Bar[]): { lines: (number | null)[][]; hist?: (number | null)[] } {
    const source = ind.source ?? "close";
    const c = src.map((bar) => this.sourceValue(bar, source));
    if (ind.kind === "sma") return { lines: [sma(c, ind.params[0] ?? 20)] };
    if (ind.kind === "ema") return { lines: [ema(c, ind.params[0] ?? 50)] };
    if (ind.kind === "wma") return { lines: [wma(c, ind.params[0] ?? 20)] };
    if (ind.kind === "vwap") return { lines: [vwap(src)] };
    if (ind.kind === "bb") {
      const bb = bollinger(c, ind.params[0] ?? 20, ind.params[1] ?? 2);
      return { lines: [bb.upper, bb.mid, bb.lower] };
    }
    if (ind.kind === "rsi") return { lines: [rsi(c, ind.params[0] ?? 14)] };
    if (ind.kind === "atr") return { lines: [atr(src, ind.params[0] ?? 14)] };
    if (ind.kind === "stoch") {
      const s = stoch(src, ind.params[0] ?? 14, ind.params[1] ?? 3);
      return { lines: [s.k, s.d] };
    }
    if (ind.kind === "macd") {
      const m = macd(c, ind.params[0] ?? 12, ind.params[1] ?? 26, ind.params[2] ?? 9);
      return { lines: [m.line, m.signal], hist: m.hist };
    }
    return { lines: [] };
  }

  private draw = (): void => {
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(() => this.paint());
  };

  private paint(): void {
    const pal = palettes[this.theme];
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, w, h);
    const bars = this.plotBars();
    const layout = this.layout();
    const range = this.priceRange(bars.length ? bars : this.bars.slice(-40));
    this.paintWatermark(layout.main, pal.watermark);
    this.paintGrid(layout.main, range.min, range.max, pal.grid);
    if (bars.length) {
      this.paintVolumeOverlay(layout.main, bars, pal);
      this.paintSeries(layout.main, bars, range, pal);
      if (!this.hideIndicators) this.paintMainIndicators(layout.main, bars, range);
      this.paintCompare(layout.main, bars, pal);
      this.paintPrevDayClose(layout.main, bars, range, pal);
      this.paintPriceLine(layout.main, bars, range, pal);
      this.paintHighLowLabels(layout.main, bars, range, pal);
    }
    if (!this.hideIndicators) {
      for (const extra of layout.extras) this.paintPane(extra.rect, extra.ind, pal);
    }
    if (!this.hideDrawings) this.paintDrawings(layout.main, bars.length ? bars : this.bars.slice(-40), range);
    this.paintAxes(layout, bars, range, pal);
    this.paintCrosshair(layout, bars, range, pal);
    this.paintReplaySelectLine(layout.main);
    this.paintDemoTrail();
    this.paintLegend(layout.main, pal);
  }

  private paintReplaySelectLine(rect: Rect): void {
    if (!this.replaySelecting || this.replayHoverIndex == null) return;
    const x = this.xOfIndex(this.replayHoverIndex, rect);
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = "#2962ff";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(x + 0.5, rect.y);
    ctx.lineTo(x + 0.5, rect.y + rect.h);
    ctx.stroke();
    // Scissors marker (TV-style start picker)
    const cy = rect.y + 18;
    ctx.fillStyle = "#2962ff";
    ctx.beginPath();
    ctx.arc(x, cy, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "10px Trebuchet MS, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("✂", x, cy + 0.5);
    const bar = this.fullBars[this.replayHoverIndex];
    if (bar) {
      ctx.fillStyle = "#2962ff";
      ctx.fillRect(x - 54, rect.y + rect.h + 2, 108, 16);
      ctx.fillStyle = "#fff";
      ctx.font = AXIS_FONT;
      ctx.fillText(formatTime(bar.time, this.interval), x, rect.y + rect.h + 14);
    }
    ctx.restore();
  }

  private paintDemoTrail(): void {
    if (this.tool !== "demonstration" || !this.demoTrail.length) return;
    const now = Date.now();
    this.demoTrail = this.demoTrail.filter((p) => now - p.t < 1200);
    if (!this.demoTrail.length) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (let i = 1; i < this.demoTrail.length; i++) {
      const p0 = this.demoTrail[i - 1];
      const p1 = this.demoTrail[i];
      const age = (now - p1.t) / 1200;
      ctx.globalAlpha = Math.max(0, 1 - age);
      ctx.strokeStyle = "#ff6d00";
      ctx.lineWidth = Math.max(1, 4 * (1 - age));
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
    }
    const last = this.demoTrail[this.demoTrail.length - 1];
    const dotAge = (now - last.t) / 1200;
    ctx.globalAlpha = Math.max(0, 1 - dotAge);
    ctx.fillStyle = "#ff6d00";
    ctx.beginPath();
    ctx.arc(last.x, last.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (this.demoTrail.length) requestAnimationFrame(() => this.draw());
  }

  private paintWatermark(rect: Rect, color: string): void {
    if (!this.canvasSettings.showWatermark) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = this.canvasSettings.watermarkOpacity;
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    ctx.font = "bold 84px Trebuchet MS, Arial, sans-serif";
    ctx.fillText(this.symbol.ticker, cx, cy - 18);
    ctx.font = "bold 36px Trebuchet MS, Arial, sans-serif";
    ctx.fillText(String(this.interval), cx, cy + 28);
    ctx.restore();
  }

  private paintGrid(rect: Rect, min: number, max: number, color: string): void {
    const mode = this.canvasSettings.gridMode ?? (this.showGrid ? "both" : "none");
    if (mode === "none") return;
    const ctx = this.ctx;
    ctx.strokeStyle = this.canvasSettings.gridColor || color;
    ctx.lineWidth = 1;
    if (mode === "both" || mode === "horiz") {
      for (const tick of niceTicks(min, max, 8)) {
        const y = this.yOf(tick, min, max, rect);
        ctx.beginPath();
        ctx.moveTo(rect.x, y);
        ctx.lineTo(rect.x + rect.w, y);
        ctx.stroke();
      }
    }
    if (mode === "both" || mode === "vert") {
      const start = Math.floor(this.viewStart());
      const end = Math.ceil(this.viewEnd);
      const step = Math.max(1, Math.floor(this.viewCount / 8));
      for (let i = start; i <= end; i += step) {
        const x = this.xOfIndex(i, rect);
        ctx.beginPath();
        ctx.moveTo(x, rect.y);
        ctx.lineTo(x, rect.y + rect.h);
        ctx.stroke();
      }
    }
  }

  private paintVolumeOverlay(rect: Rect, bars: Bar[], pal: (typeof palettes)["dark"]): void {
    if (!this.indicators.some((i) => i.kind === "vol" && i.visible)) return;
    const ctx = this.ctx;
    const maxVol = Math.max(...bars.map((b) => b.volume), 1);
    const slot = this.slotWidth(rect);
    const h = rect.h * 0.22;
    bars.forEach((b, i) => {
      const bh = (b.volume / maxVol) * h;
      const x = this.xOf(i, bars.length, rect);
      ctx.fillStyle = b.close >= b.open ? pal.volumeUp : pal.volumeDown;
      ctx.fillRect(x - slot * 0.36, rect.y + rect.h - bh, slot * 0.72, bh);
    });
  }

  private paintSeries(rect: Rect, bars: Bar[], range: { min: number; max: number }, pal: (typeof palettes)["dark"]): void {
    const ctx = this.ctx;
    const slot = this.slotWidth(rect);
    const body = Math.max(1.2, slot * 0.7);

    if (
      this.chartType === "line" ||
      this.chartType === "linemarkers" ||
      this.chartType === "area" ||
      this.chartType === "hlcarea" ||
      this.chartType === "stepline" ||
      this.chartType === "baseline" ||
      this.chartType === "kagi"
    ) {
      ctx.beginPath();
      bars.forEach((b, i) => {
        const x = this.xOf(i, bars.length, rect);
        const source = this.chartType === "hlcarea" ? (b.high + b.low + b.close) / 3 : this.sourceValue(b);
        const y = this.yOf(this.scaled(source, bars), range.min, range.max, rect);
        if (i === 0) ctx.moveTo(x, y);
        else if (this.chartType === "stepline") {
          const px = this.xOf(i - 1, bars.length, rect);
          ctx.lineTo(x, this.yOf(this.scaled(this.sourceValue(bars[i - 1]), bars), range.min, range.max, rect));
          ctx.lineTo(x, y);
          void px;
        } else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = this.chartType === "baseline" ? pal.up : pal.accent;
      if (this.chartType === "kagi") ctx.lineWidth = 2.4;
      ctx.lineWidth = 1.6;
      ctx.stroke();
      if (this.chartType === "linemarkers") {
        ctx.fillStyle = pal.accent;
        bars.forEach((b, i) => {
          const x = this.xOf(i, bars.length, rect);
          const y = this.yOf(this.scaled(this.sourceValue(b), bars), range.min, range.max, rect);
          ctx.beginPath();
          ctx.arc(x, y, Math.max(2, slot * 0.14), 0, Math.PI * 2);
          ctx.fill();
        });
      }
      if (this.chartType === "area" || this.chartType === "baseline" || this.chartType === "hlcarea") {
        const baseY =
          this.chartType === "baseline"
            ? this.yOf(this.scaled(bars[0].close, bars), range.min, range.max, rect)
            : rect.y + rect.h;
        ctx.lineTo(this.xOf(bars.length - 1, bars.length, rect), baseY);
        ctx.lineTo(this.xOf(0, bars.length, rect), baseY);
        ctx.closePath();
        ctx.fillStyle =
          this.chartType === "baseline"
            ? "rgba(38,166,154,0.12)"
            : this.chartType === "hlcarea"
              ? "rgba(41,98,255,0.18)"
              : "rgba(41,98,255,0.12)";
        ctx.fill();
      }
      return;
    }

    if (this.chartType === "columns") {
      const base = this.yOf(this.scaled(bars[0].close, bars), range.min, range.max, rect);
      bars.forEach((b, i) => {
        const x = this.xOf(i, bars.length, rect);
        const y = this.yOf(this.scaled(this.sourceValue(b), bars), range.min, range.max, rect);
        ctx.fillStyle = b.close >= b.open ? this.chartStyle.upColor : this.chartStyle.downColor;
        ctx.fillRect(x - body / 2, Math.min(base, y), body, Math.abs(y - base));
      });
      return;
    }

    if (this.chartType === "highlow") {
      bars.forEach((b, i) => {
        const x = this.xOf(i, bars.length, rect);
        const yH = this.yOf(this.scaled(b.high, bars), range.min, range.max, rect);
        const yL = this.yOf(this.scaled(b.low, bars), range.min, range.max, rect);
        const yC = this.yOf(this.scaled(this.sourceValue(b), bars), range.min, range.max, rect);
        ctx.strokeStyle = b.close >= b.open ? this.chartStyle.upColor : this.chartStyle.downColor;
        ctx.beginPath();
        ctx.moveTo(x, yH);
        ctx.lineTo(x, yL);
        ctx.moveTo(x, yC);
        ctx.lineTo(x + body * 0.55, yC);
        ctx.stroke();
      });
      return;
    }

    if (this.chartType === "pnf") {
      const box = Math.max(body * 0.72, 5);
      bars.forEach((b, i) => {
        const x = this.xOf(i, bars.length, rect);
        const y = this.yOf(this.scaled((b.open + b.close) / 2, bars), range.min, range.max, rect);
        const up = b.close >= b.open;
        ctx.strokeStyle = up ? this.chartStyle.upColor : this.chartStyle.downColor;
        if (up) {
          ctx.beginPath();
          ctx.moveTo(x - box / 2, y - box / 2);
          ctx.lineTo(x + box / 2, y + box / 2);
          ctx.moveTo(x + box / 2, y - box / 2);
          ctx.lineTo(x - box / 2, y + box / 2);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(x, y, box / 2, 0, Math.PI * 2);
          ctx.stroke();
        }
      });
      return;
    }

    if (this.chartType === "volfoot") {
      bars.forEach((b, i) => {
        const x = this.xOf(i, bars.length, rect);
        const yO = this.yOf(this.scaled(b.open, bars), range.min, range.max, rect);
        const yC = this.yOf(this.scaled(b.close, bars), range.min, range.max, rect);
        const yH = this.yOf(this.scaled(b.high, bars), range.min, range.max, rect);
        const yL = this.yOf(this.scaled(b.low, bars), range.min, range.max, rect);
        const up = b.close >= b.open;
        if (this.chartStyle.showWick) {
          ctx.strokeStyle = up ? this.chartStyle.wickUpColor : this.chartStyle.wickDownColor;
          ctx.beginPath();
          ctx.moveTo(x, yH);
          ctx.lineTo(x, yL);
          ctx.stroke();
        }
        ctx.fillStyle = up ? "rgba(38,166,154,0.24)" : "rgba(239,83,80,0.24)";
        ctx.fillRect(x - body / 2, Math.min(yO, yC), body, Math.max(1, Math.abs(yC - yO)));
        for (let r = 0; r < 4; r++) {
          const yy = yH + ((yL - yH) * (r + 0.5)) / 4;
          ctx.fillStyle = r % 2 === 0 ? "rgba(41,98,255,0.32)" : "rgba(255,255,255,0.18)";
          ctx.fillRect(x - body * 0.42, yy - 2, body * 0.84, 3);
        }
      });
      return;
    }

    if (this.chartType === "tpo") {
      ctx.font = `bold ${Math.max(9, Math.min(12, slot * 0.35))}px Trebuchet MS, Arial, sans-serif`;
      const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
      bars.forEach((b, i) => {
        const x = this.xOf(i, bars.length, rect);
        const steps = 6;
        for (let s = 0; s < steps; s++) {
          const price = b.low + ((b.high - b.low) * s) / Math.max(1, steps - 1);
          const y = this.yOf(this.scaled(price, bars), range.min, range.max, rect);
          ctx.fillStyle = "rgba(41,98,255,0.72)";
          ctx.fillText(letters[i % letters.length], x - 4, y + 3);
        }
      });
      return;
    }

    if (this.chartType === "sessionvp") {
      const bins = 24;
      const vol = Array.from({ length: bins }, () => 0);
      for (const b of bars) {
        const mid = (b.high + b.low + b.close) / 3;
        const t = (this.scaled(mid, bars) - range.min) / (range.max - range.min || 1);
        const idx = clamp(Math.floor((1 - t) * bins), 0, bins - 1);
        vol[idx] += b.volume;
      }
      const vmax = Math.max(...vol, 1);
      vol.forEach((v, i) => {
        const y0 = rect.y + (i * rect.h) / bins;
        const y1 = rect.y + ((i + 1) * rect.h) / bins;
        const w = (v / vmax) * rect.w * 0.26;
        ctx.fillStyle = "rgba(41,98,255,0.24)";
        ctx.fillRect(rect.x + rect.w - w, y0 + 1, w, Math.max(1, y1 - y0 - 2));
      });
    }

    bars.forEach((b, i) => {
      const x = this.xOf(i, bars.length, rect);
      const yO = this.yOf(this.scaled(b.open, bars), range.min, range.max, rect);
      const yC = this.yOf(this.scaled(b.close, bars), range.min, range.max, rect);
      const yH = this.yOf(this.scaled(b.high, bars), range.min, range.max, rect);
      const yL = this.yOf(this.scaled(b.low, bars), range.min, range.max, rect);
      const up = b.close >= b.open;
      if (this.chartStyle.showWick) {
        ctx.strokeStyle = up ? this.chartStyle.wickUpColor : this.chartStyle.wickDownColor;
        ctx.beginPath();
        ctx.moveTo(x, yH);
        ctx.lineTo(x, yL);
        ctx.stroke();
      }
      const top = Math.min(yO, yC);
      const height = Math.max(1, Math.abs(yC - yO));
      if (this.chartType === "bar") {
        ctx.beginPath();
        ctx.moveTo(x - body / 2, yO);
        ctx.lineTo(x, yO);
        ctx.moveTo(x, yC);
        ctx.lineTo(x + body / 2, yC);
        ctx.strokeStyle = up ? this.chartStyle.upColor : this.chartStyle.downColor;
        ctx.stroke();
      } else if (this.chartType === "volcandle") {
        const alpha = clamp(b.volume / Math.max(...bars.map((it) => it.volume), 1), 0.18, 1);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = up ? this.chartStyle.upColor : this.chartStyle.downColor;
        ctx.fillRect(x - body / 2, top, body, height);
        ctx.globalAlpha = 1;
        if (this.chartStyle.showBorder) {
          ctx.strokeStyle = up ? this.chartStyle.borderUpColor : this.chartStyle.borderDownColor;
          ctx.strokeRect(x - body / 2, top, body, height);
        }
      } else if (this.chartType === "hollow" && up) {
        ctx.strokeStyle = up ? this.chartStyle.borderUpColor : this.chartStyle.borderDownColor;
        ctx.strokeRect(x - body / 2, top, body, height);
      } else {
        ctx.fillStyle = up ? this.chartStyle.upColor : this.chartStyle.downColor;
        ctx.fillRect(x - body / 2, top, body, height);
        if (this.chartStyle.showBorder) {
          ctx.strokeStyle = up ? this.chartStyle.borderUpColor : this.chartStyle.borderDownColor;
          ctx.strokeRect(x - body / 2, top, body, height);
        }
      }
    });
  }

  private paintMainIndicators(rect: Rect, bars: Bar[], range: { min: number; max: number }): void {
    const ctx = this.ctx;
    for (const ind of this.indicators) {
      if (!ind.visible || ind.pane !== "main") continue;
      const { lines } = this.indicatorSeries(ind, bars);
      lines.forEach((line, li) => {
        ctx.beginPath();
        let started = false;
        line.forEach((v, i) => {
          if (v == null) return;
          const x = this.xOf(i, bars.length, rect);
          const y = this.yOf(this.scaled(v, bars), range.min, range.max, rect);
          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else ctx.lineTo(x, y);
        });
        ctx.strokeStyle = ind.color;
        ctx.globalAlpha = ind.kind === "bb" && li !== 1 ? 0.55 : 1;
        ctx.lineWidth = ind.lineWidth ?? 1.15;
        if (ind.lineStyle === "dashed") ctx.setLineDash([6, 4]);
        else if (ind.lineStyle === "dotted") ctx.setLineDash([2, 3]);
        else ctx.setLineDash([]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      });
    }
  }

  private paintCompare(rect: Rect, bars: Bar[], pal: (typeof palettes)["dark"]): void {
    if (!this.compareBars) return;
    const { from, to } = this.viewSlice();
    const slice = this.compareBars.slice(from, to);
    if (slice.length < 2) return;
    const base = slice[0].close;
    const ctx = this.ctx;
    ctx.beginPath();
    slice.forEach((b, i) => {
      const pct = ((b.close - base) / base) * 100;
      const y = this.yOf(pct, -20, 20, rect);
      const x = this.xOf(i, bars.length, rect);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = "#ab47bc";
    ctx.setLineDash([5, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    void pal;
  }

  private paintPriceLine(rect: Rect, bars: Bar[], range: { min: number; max: number }, pal: (typeof palettes)["dark"]): void {
    if (this.canvasSettings.showLastPriceLine === false) return;
    const last = this.bars.at(-1);
    if (!last) return;
    const y = this.yOf(this.scaled(last.close, bars.length ? bars : [last]), range.min, range.max, rect);
    const ctx = this.ctx;
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = last.close >= last.open ? pal.up : pal.down;
    ctx.beginPath();
    ctx.moveTo(rect.x, y);
    ctx.lineTo(rect.x + rect.w, y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /** V-07 — previous trading day close line (TradingView-style). */
  private paintPrevDayClose(
    rect: Rect,
    bars: Bar[],
    range: { min: number; max: number },
    pal: (typeof palettes)["dark"],
  ): void {
    if (!this.canvasSettings.showPrevDayClose) return;
    const px = this.previousDayClose();
    if (px == null || !Number.isFinite(px)) return;
    const y = this.yOf(this.scaled(px, bars), range.min, range.max, rect);
    if (y < rect.y - 2 || y > rect.y + rect.h + 2) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.setLineDash([2, 4]);
    ctx.strokeStyle = pal.muted;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(rect.x, y + 0.5);
    ctx.lineTo(rect.x + rect.w, y + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
    const label = `PClose ${formatPrice(px, this.symbol.pricePrecision)}`;
    ctx.font = AXIS_FONT;
    const tw = ctx.measureText(label).width + 8;
    const lx = rect.x + 6;
    const ly = Math.max(rect.y + 12, Math.min(rect.y + rect.h - 4, y - 4));
    ctx.fillStyle = this.theme === "dark" ? "rgba(30,34,45,0.92)" : "rgba(248,249,253,0.94)";
    ctx.fillRect(lx, ly - 11, tw, 14);
    ctx.fillStyle = pal.muted;
    ctx.textAlign = "left";
    ctx.fillText(label, lx + 4, ly);
    ctx.restore();
  }

  private previousDayClose(): number | null {
    if (this.bars.length < 2) return null;
    const last = this.bars[this.bars.length - 1]!;
    const lastDay = Math.floor(last.time / 86400);
    for (let i = this.bars.length - 2; i >= 0; i--) {
      const bar = this.bars[i]!;
      if (Math.floor(bar.time / 86400) < lastDay) return bar.close;
    }
    return null;
  }

  /** V-06 — high / low of the visible range. */
  private paintHighLowLabels(
    rect: Rect,
    bars: Bar[],
    range: { min: number; max: number },
    pal: (typeof palettes)["dark"],
  ): void {
    if (!this.canvasSettings.showHighLow || bars.length < 2) return;
    let hi = -Infinity;
    let lo = Infinity;
    let hiI = 0;
    let loI = 0;
    bars.forEach((b, i) => {
      if (b.high >= hi) {
        hi = b.high;
        hiI = i;
      }
      if (b.low <= lo) {
        lo = b.low;
        loI = i;
      }
    });
    if (!Number.isFinite(hi) || !Number.isFinite(lo)) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.font = AXIS_FONT;
    const drawTag = (price: number, index: number, kind: "H" | "L") => {
      const x = this.xOf(index, bars.length, rect);
      const y = this.yOf(this.scaled(price, bars), range.min, range.max, rect);
      const text = `${kind} ${formatPrice(price, this.symbol.pricePrecision)}`;
      const tw = ctx.measureText(text).width + 8;
      const above = kind === "H";
      const ty = above ? y - 6 : y + 12;
      const lx = Math.max(rect.x + 2, Math.min(rect.x + rect.w - tw - 2, x - tw / 2));
      ctx.fillStyle = this.theme === "dark" ? "rgba(30,34,45,0.9)" : "rgba(248,249,253,0.94)";
      ctx.fillRect(lx, ty - 10, tw, 14);
      ctx.strokeStyle = kind === "H" ? pal.up : pal.down;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 0.5, y);
      ctx.lineTo(x + 0.5, above ? ty : ty - 10);
      ctx.stroke();
      ctx.fillStyle = kind === "H" ? pal.up : pal.down;
      ctx.textAlign = "left";
      ctx.fillText(text, lx + 4, ty);
    };
    drawTag(hi, hiI, "H");
    drawTag(lo, loI, "L");
    ctx.restore();
  }

  private paintPane(rect: Rect, ind: IndicatorInstance, pal: (typeof palettes)["dark"]): void {
    const ctx = this.ctx;
    ctx.fillStyle = pal.grid;
    ctx.fillRect(rect.x, rect.y, rect.w, 1);
    const bars = this.plotBars();
    const series = this.indicatorSeries(ind, bars);
    const bounded = ind.kind === "rsi" || ind.kind === "stoch";
    const vals = series.lines.flat().filter((v): v is number => v != null);
    const min = bounded ? 0 : Math.min(...vals, 0);
    const max = bounded ? 100 : Math.max(...vals, 0.01);
    if (bounded) {
      for (const lvl of [20, 50, 80]) {
        const y = this.yOf(lvl, min, max, rect);
        ctx.strokeStyle = pal.grid;
        ctx.beginPath();
        ctx.moveTo(rect.x, y);
        ctx.lineTo(rect.x + rect.w, y);
        ctx.stroke();
      }
    }
    if (series.hist) {
      const ext = Math.max(...series.hist.filter((v): v is number => v != null).map(Math.abs), 0.01);
      const slot = this.slotWidth(rect);
      series.hist.forEach((v, i) => {
        if (v == null) return;
        const y0 = this.yOf(0, -ext, ext, rect);
        const y1 = this.yOf(v, -ext, ext, rect);
        ctx.fillStyle = v >= 0 ? pal.volumeUp : pal.volumeDown;
        ctx.fillRect(this.xOf(i, bars.length, rect) - slot * 0.28, Math.min(y0, y1), slot * 0.56, Math.abs(y1 - y0));
      });
    }
    series.lines.forEach((line, li) => {
      ctx.beginPath();
      let started = false;
      const lo = series.hist ? -Math.max(...vals.map(Math.abs), 0.01) : min;
      const hi = series.hist ? -lo : max;
      line.forEach((v, i) => {
        if (v == null) return;
        const x = this.xOf(i, bars.length, rect);
        const y = this.yOf(v, lo, hi, rect);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = li === 0 ? ind.color : pal.muted;
      ctx.stroke();
    });
    ctx.fillStyle = pal.muted;
    ctx.font = CHART_FONT;
    ctx.fillText(`${ind.kind.toUpperCase()} ${ind.params.join(",")}`, rect.x + 8, rect.y + 14);
  }

  private locate(point: ChartPoint, bars: Bar[], range: { min: number; max: number }, rect: Rect): { x: number; y: number } {
    return { x: this.xOfTime(point.time, bars, rect), y: this.yOf(this.scaled(point.price, bars), range.min, range.max, rect) };
  }

  /** Logical bar index for a unix time (fractional between bars). */
  private indexFromTime(time: number): number {
    if (!this.bars.length) return 0;
    const data = this.bars;
    const step = intervalSeconds(this.interval) || 60;
    if (time <= data[0].time) return (time - data[0].time) / step;
    const last = data.length - 1;
    if (time >= data[last].time) return last + (time - data[last].time) / step;
    let lo = 0;
    let hi = last;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (data[mid].time <= time) lo = mid;
      else hi = mid;
    }
    const span = data[hi].time - data[lo].time || 1;
    return lo + (time - data[lo].time) / span;
  }

  /** Current chart price-per-bar (locks a 1:1 screen square into Gann Fixed). */
  private chartScaleRatio(): number {
    const main = this.layout().main;
    const plotted = this.plotBars();
    const sample = plotted.length ? plotted : this.bars.slice(-40);
    if (!sample.length) return 1;
    const range = this.priceRange(sample);
    const priceSpan = Math.max(1e-12, range.max - range.min);
    const pricePerPx = priceSpan / Math.max(1, main.h);
    const slot = this.slotWidth(main);
    return Math.max(1e-12, pricePerPx * Math.max(1e-6, slot));
  }

  /**
   * Supercharts Gann Square Fixed: keep |Δprice| = |Δbars| × scaleRatio.
   * Size follows the time drag; price is forced to the locked ratio.
   */
  private constrainGannSquareFixed(d: Drawing, movingIndex: 0 | 1): void {
    if (d.kind !== "gannsquarefixed" || d.points.length < 2) return;
    if (!(d.scaleRatio && d.scaleRatio > 0)) d.scaleRatio = this.chartScaleRatio();
    const fixed = d.points[movingIndex === 0 ? 1 : 0];
    const moving = d.points[movingIndex];
    const i0 = this.indexFromTime(fixed.time);
    const i1 = this.indexFromTime(moving.time);
    let di = i1 - i0;
    if (Math.abs(di) < 0.5) di = di < 0 ? -1 : 1;
    const priceSign = Math.sign(moving.price - fixed.price) || 1;
    moving.price = fixed.price + priceSign * Math.abs(di) * d.scaleRatio!;
  }

  private xOfTime(time: number, _bars: Bar[], rect: Rect): number {
    if (!this.bars.length) return rect.x;
    const data = this.bars;
    if (time <= data[0].time) {
      const dt = data[1] ? data[1].time - data[0].time : intervalSeconds(this.interval) || 1;
      return this.xOfIndex(0, rect) + ((time - data[0].time) / (dt || 1)) * this.slotWidth(rect);
    }
    const last = data.length - 1;
    if (time >= data[last].time) {
      const dt = last > 0 ? data[last].time - data[last - 1].time : intervalSeconds(this.interval) || 1;
      return this.xOfIndex(last, rect) + ((time - data[last].time) / (dt || 1)) * this.slotWidth(rect);
    }
    let lo = 0;
    let hi = last;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (data[mid].time <= time) lo = mid;
      else hi = mid;
    }
    const span = data[hi].time - data[lo].time || 1;
    const t = (time - data[lo].time) / span;
    return this.xOfIndex(lo, rect) * (1 - t) + this.xOfIndex(hi, rect) * t;
  }

  private paintDrawings(rect: Rect, bars: Bar[], range: { min: number; max: number }): void {
    const all = this.draft ? [...this.drawings, this.draft] : this.drawings;
    for (const d of all) {
      if (d !== this.draft && !drawingShownOnInterval(d, this.interval)) continue;
      const pts = d.points.map((p) => this.locate(p, bars, range, rect));
      paintDrawing(this.ctx, d, pts, rect, this.symbol.pricePrecision, d.id === this.selectedId, bars, (price) =>
        this.yOf(this.scaled(price, bars), range.min, range.max, rect),
      );
    }
  }

  private paintAxes(
    layout: { main: Rect; chart: Rect },
    bars: Bar[],
    range: { min: number; max: number },
    pal: (typeof palettes)["dark"],
  ): void {
    const ctx = this.ctx;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    ctx.fillStyle = pal.muted;
    ctx.font = AXIS_FONT;
    ctx.textAlign = "left";
    for (const tick of niceTicks(range.min, range.max, 8)) {
      const y = this.yOf(tick, range.min, range.max, layout.main);
      const label = this.percentScale ? `${tick.toFixed(2)}%` : formatPrice(tick, this.symbol.pricePrecision);
      ctx.fillText(label, layout.chart.w + 8, y + 3);
    }
    const labelCount = w < 400 ? 3 : w < 720 ? 4 : 6;
    const step = Math.max(1, Math.floor(this.viewCount / labelCount));
    ctx.textAlign = "center";
    const axisStart = Math.floor(this.viewStart());
    const axisEnd = Math.ceil(this.viewEnd);
    for (let i = axisStart; i <= axisEnd; i += step) {
      ctx.fillText(formatTime(this.timeAtIndex(i), this.interval), this.xOfIndex(i, layout.main), h - 8);
    }
    ctx.textAlign = "left";
    const last = this.bars.at(-1) ?? bars.at(-1);
    if (last && this.canvasSettings.showLastPriceLine !== false) {
      const y = this.yOf(this.scaled(last.close, bars.length ? bars : [last]), range.min, range.max, layout.main);
      ctx.fillStyle = last.close >= last.open ? pal.up : pal.down;
      ctx.fillRect(layout.chart.w, y - 9, this.priceAxisWidth(), 18);
      ctx.fillStyle = "#fff";
      ctx.fillText(
        this.percentScale ? `${this.scaled(last.close, bars).toFixed(2)}%` : formatPrice(last.close, this.symbol.pricePrecision),
        layout.chart.w + 8,
        y + 4,
      );
      ctx.fillStyle = pal.panel;
      ctx.fillRect(layout.chart.w, y + 10, this.priceAxisWidth(), 16);
      ctx.fillStyle = pal.muted;
      ctx.fillText(this.countdown(), layout.chart.w + 16, y + 22);
    }
    ctx.strokeStyle = pal.grid;
    ctx.beginPath();
    ctx.moveTo(layout.chart.w, 0);
    ctx.lineTo(layout.chart.w, h);
    ctx.moveTo(0, layout.chart.h);
    ctx.lineTo(w, layout.chart.h);
    ctx.stroke();
  }

  private paintCrosshair(
    layout: { main: Rect; chart: Rect },
    bars: Bar[],
    range: { min: number; max: number },
    pal: (typeof palettes)["dark"],
  ): void {
    if (!this.mouse || this.tool === "cursor" || this.tool === "magic") return;
    const ctx = this.ctx;
    const { x, y } = this.mouse;
    if (x > layout.chart.w || y > layout.chart.h) return;
    const xhStyle = this.canvasSettings.crosshairStyle ?? "dashed";
    const xhWidth = this.canvasSettings.crosshairWidth ?? 1;
    if (xhStyle === "dashed") ctx.setLineDash([5, 4]);
    else if (xhStyle === "dotted") ctx.setLineDash([2, 3]);
    else ctx.setLineDash([]);
    ctx.strokeStyle = this.canvasSettings.crosshairColor || pal.cross;
    ctx.lineWidth = xhWidth;
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, layout.chart.h);
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(layout.chart.w, y + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineWidth = 1;
    const logical = this.indexAtX(x, bars.length, layout.main);
    const idx = Math.round(logical);
    const bar = idx >= 0 && idx < this.bars.length ? this.bars[idx] : undefined;
    if (bar) this.hover = bar;
    const price = this.priceAtY(y, range.min, range.max, layout.main);
    ctx.fillStyle = "#2962ff";
    ctx.fillRect(layout.chart.w, y - 8, this.priceAxisWidth(), 16);
    ctx.fillStyle = "#fff";
    ctx.font = AXIS_FONT;
    ctx.fillText(this.percentScale ? `${price.toFixed(2)}%` : formatPrice(price, this.symbol.pricePrecision), layout.chart.w + 8, y + 4);
    ctx.fillStyle = "#2962ff";
    ctx.fillRect(x - 48, layout.chart.h + 4, 96, 16);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.fillText(formatTime(this.timeAtIndex(logical), this.interval), x, layout.chart.h + 16);
    ctx.textAlign = "left";
    if (bar && this.canvasSettings.showTrackerBox !== false) {
      const boxW = 132;
      const bx = x + 16 + boxW > layout.chart.w ? x - boxW - 12 : x + 16;
      const by = y + 18;
      ctx.fillStyle = pal.panel;
      ctx.strokeStyle = pal.border;
      ctx.fillRect(bx, by, boxW, 108);
      ctx.strokeRect(bx, by, boxW, 108);
      const chg = ((bar.close - bar.open) / bar.open) * 100;
      const p = this.symbol.pricePrecision;
      const rows = [
        formatTime(bar.time, this.interval),
        `Open  ${formatPrice(bar.open, p)}`,
        `High  ${formatPrice(bar.high, p)}`,
        `Low   ${formatPrice(bar.low, p)}`,
        `Close ${formatPrice(bar.close, p)}`,
        `Chg   ${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%`,
        `Vol   ${formatVolume(bar.volume)}`,
      ];
      ctx.font = AXIS_FONT;
      rows.forEach((row, i) => {
        ctx.fillStyle = i === 5 ? (chg >= 0 ? pal.up : pal.down) : pal.text;
        ctx.fillText(row, bx + 8, by + 16 + i * 13);
      });
    }
  }

  private paintLegend(rect: Rect, pal: (typeof palettes)["dark"]): void {
    const ctx = this.ctx;
    const lines = this.legendLines();
    const sym = lines.find((l) => l.id === "sym" || l.id === "symbol") ?? lines[0];
    if (!sym) return;
    ctx.font = CHART_FONT_BOLD;
    ctx.fillStyle = sym.color || pal.text;
    const parts = sym.text.split("  ").filter(Boolean);
    let y = rect.y + 18;
    ctx.fillText(parts[0] ?? sym.text, rect.x + 10, y);
    if (parts.length > 1) {
      y += 16;
      ctx.font = AXIS_FONT;
      ctx.fillStyle = pal.text;
      ctx.fillText(parts.slice(1).join("  "), rect.x + 10, y);
    }
  }

  private locPts(d: Drawing): { x: number; y: number }[] {
    const layout = this.layout();
    const bars = this.plotBars();
    const rangeBars = bars.length ? bars : this.bars.slice(-40);
    if (!rangeBars.length) return [];
    const range = this.priceRange(rangeBars);
    return d.points.map((p) => this.locate(p, rangeBars, range, layout.main));
  }

  private hitDrawing(x: number, y: number): Drawing | null {
    const layout = this.layout();
    const bars = this.plotBars();
    const rangeBars = bars.length ? bars : this.bars.slice(-40);
    if (!rangeBars.length) return null;
    const range = this.priceRange(rangeBars);
    for (let i = this.drawings.length - 1; i >= 0; i--) {
      const d = this.drawings[i];
      if (!drawingShownOnInterval(d, this.interval)) continue;
      const pts = d.points.map((p) => this.locate(p, rangeBars, range, layout.main));
      if (hitHandle(pts, x, y) != null || hitTestDrawing(d, pts, x, y, layout.main)) return d;
    }
    return null;
  }

  private finishDraft(): void {
    if (!this.draft) return;
    this.pushUndo();
    this.drawings.push(this.draft);
    this.selectedId = this.draft.id;
    this.selectedIndicatorId = null;
    this.draft = null;
    if (!this.stayMode) this.tool = "crosshair";
  }

  private hitZone(x: number, y: number): "price" | "time" | "chart" {
    const { chart } = this.layout();
    // Widen price/time hit targets on phones so scale gestures are usable.
    const pricePad = this.container.clientWidth < 520 ? 12 : 0;
    const timePad = this.container.clientWidth < 520 ? 10 : 0;
    if (x >= chart.w - pricePad) return "price";
    if (y >= chart.h - timePad) return "time";
    return "chart";
  }

  private pointerDistance(): number {
    const pts = [...this.pointers.values()];
    if (pts.length < 2) return 0;
    const dx = pts[0].x - pts[1].x;
    const dy = pts[0].y - pts[1].y;
    return Math.hypot(dx, dy);
  }

  private pointerMidpoint(): { x: number; y: number } {
    const pts = [...this.pointers.values()];
    if (pts.length < 2) return pts[0] ?? { x: 0, y: 0 };
    return { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
  }

  private beginPinch(): void {
    const dist = this.pointerDistance();
    if (dist < 8) return;
    this.dragging = "pinch";
    this.pinchStartDist = dist;
    this.pinchStartCount = this.viewCount;
    const mid = this.pointerMidpoint();
    const main = this.layout().main;
    const frac = clamp((mid.x - main.x) / Math.max(1, main.w), 0, 1);
    this.pinchAnchor = this.viewStart() + frac * this.viewCount;
    this.fitMode = false;
  }

  private ensurePriceSpan(): void {
    if (this.priceSpan != null && this.priceMid != null) return;
    const r = this.priceRange(this.plotBars());
    this.priceSpan = r.max - r.min;
    this.priceMid = (r.max + r.min) / 2;
  }

  private updateCursor(x: number, y: number): void {
    if (this.replaySelecting) {
      this.canvas.style.cursor = this.hitZone(x, y) === "chart" ? "col-resize" : "default";
      return;
    }
    const zone = this.hitZone(x, y);
    if (zone === "price") this.canvas.style.cursor = "ns-resize";
    else if (zone === "time") this.canvas.style.cursor = "ew-resize";
    else if (this.tool === "cursor" || this.tool === "magic") this.canvas.style.cursor = "default";
    else if (this.tool === "demonstration") this.canvas.style.cursor = "cell";
    else {
      const hit = this.hideDrawings || this.lockDrawings ? null : this.hitDrawing(x, y);
      if (hit) {
        const handle = hitHandle(this.locPts(hit), x, y);
        this.canvas.style.cursor = handle != null ? "grab" : "move";
      } else this.canvas.style.cursor = "crosshair";
    }
  }

  private onDown = (e: PointerEvent): void => {
    e.preventDefault();
    if (e.button === 2) return;
    if (this.drawingMenu) {
      this.drawingMenu = null;
      this.emit();
    }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const { x, y } = this.local(e);
    this.mouse = { x, y };
    this.gestureMoved = false;

    if (this.pointers.size >= 2) {
      this.beginPinch();
      this.emit();
      this.draw();
      return;
    }

    if (this.replaySelecting) {
      const idx = this.replayIndexAtClient(e.clientX, e.clientY);
      if (idx != null) this.selectReplayStart(idx);
      return;
    }
    const zone = this.hitZone(x, y);
    if (zone === "price") {
      this.dragging = "priceAxis";
      this.dragLastY = y;
      this.emit();
      return;
    }
    if (zone === "time") {
      this.dragging = "timeAxis";
      this.dragLastX = x;
      this.emit();
      return;
    }
    const hit = this.lockDrawings || this.hideDrawings ? null : this.hitDrawing(x, y);
    if (this.tool === "eraser") {
      if (hit) this.removeDrawing(hit.id);
      return;
    }
    if (this.tool === "zoom") {
      this.dragging = "zoom";
      const p = this.pointFromMouse(x, y);
      if (p) this.draft = { id: uid("dr"), kind: "rect", points: [p], color: "#2962ff" };
      return;
    }
    if (this.tool === "brush" || this.tool === "highlighter") {
      const p = this.pointFromMouse(x, y);
      if (!p) return;
      this.dragging = "brush";
      this.draft = { id: uid("dr"), kind: this.tool, points: [p], color: palettes[this.theme].overlay };
      return;
    }
    const pickMode = this.tool === "cursor" || this.tool === "crosshair" || this.tool === "dot" || this.tool === "magic" || (!this.draft && !!hit);
    if (pickMode && hit && !this.draft) {
      this.selectedId = hit.id;
      this.selectedIndicatorId = null;
      this.dragging = "drawing";
      this.dragHandle = hitHandle(this.locPts(hit), x, y);
      this.dragFrom = this.pointFromMouse(x, y);
      this.dragDirty = false;
      this.canvas.style.cursor = this.dragHandle != null ? "grabbing" : "move";
      this.emit();
      this.draw();
      return;
    }
    if (this.tool === "cursor" || this.tool === "crosshair" || this.tool === "dot" || this.tool === "magic") {
      if (this.tool === "magic" && hit) {
        this.selectedId = hit.id;
        this.selectedIndicatorId = null;
        this.emit();
        this.draw();
        return;
      }
      this.selectedId = null;
      this.dragging = "pan";
      this.dragLastX = x;
      this.dragLastY = y;
      this.emit();
      this.draw();
      return;
    }
    if (this.tool === "demonstration") {
      this.demoTrail.push({ x, y, t: Date.now() });
      this.selectedId = null;
      this.dragging = "pan";
      this.dragLastX = x;
      this.dragLastY = y;
      this.emit();
      this.draw();
      return;
    }
    if (!isDrawingTool(this.tool)) return;
    const point = this.pointFromMouse(x, y);
    if (!point) return;
    const kind = this.tool;
    if (!this.draft) {
      const needsText =
        kind === "text" ||
        kind === "anchoredtext" ||
        kind === "note" ||
        kind === "anchorednote" ||
        kind === "signpost" ||
        kind === "callout" ||
        kind === "comment" ||
        kind === "pricenote" ||
        kind === "table";
      let text: string | undefined;
      if (kind === "sticker" || kind === "flagmark") text = this.glyph;
      else if (kind === "image") text = "Image";
      else if (needsText) {
        const fallback = kind === "note" || kind === "anchorednote" ? "Note" : kind === "table" ? "A1" : "Text";
        text = window.prompt("Text", fallback) || fallback;
      }
      this.draft = {
        id: uid("dr"),
        kind,
        points: [point],
        color: palettes[this.theme].overlay,
        text,
        lineWidth: 1,
        lineStyle: "solid",
        fib: defaultFibStyleForKind(kind),
        scaleRatio: kind === "gannsquarefixed" ? this.chartScaleRatio() : undefined,
      };
      if (neededPoints(kind) === 1) this.finishDraft();
    } else {
      this.draft.points[this.draft.points.length - 1] = point;
      if (this.draft.kind === "gannsquarefixed" && this.draft.points.length >= 2) {
        this.constrainGannSquareFixed(this.draft, 1);
      }
      if (!isOpenEnded(this.draft.kind) && this.draft.points.length >= neededPoints(this.draft.kind)) this.finishDraft();
      else this.draft.points = [...this.draft.points, point];
    }
    this.emit();
    this.draw();
  };

  private onMove = (e: PointerEvent): void => {
    if (this.pointers.has(e.pointerId)) {
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    const { x, y } = this.local(e);
    this.mouse = { x, y };

    if (this.pointers.size >= 2 || this.dragging === "pinch") {
      if (this.dragging !== "pinch") this.beginPinch();
      if (this.dragging === "pinch" && this.pinchStartDist > 0) {
        const dist = this.pointerDistance();
        if (dist > 8) {
          const ratio = this.pinchStartDist / dist;
          this.setViewCount(this.pinchStartCount * ratio, this.pinchAnchor);
          this.fitMode = false;
        }
      }
      this.draw();
      this.emit();
      return;
    }

    if (this.replaySelecting) {
      const idx = this.replayIndexAtClient(e.clientX, e.clientY);
      this.setReplayHoverIndex(idx);
      this.updateCursor(x, y);
      return;
    }
    if (!this.dragging) this.updateCursor(x, y);
    if (this.tool === "demonstration") {
      const now = Date.now();
      this.demoTrail.push({ x, y, t: now });
      this.demoTrail = this.demoTrail.filter((p) => now - p.t < 1200);
    }
    if (this.tool === "magic" && !this.dragging) {
      const nearHit = this.hitDrawing(x, y);
      if (nearHit && this.selectedId !== nearHit.id) {
        this.selectedId = nearHit.id;
        this.emit();
      } else if (!nearHit && this.selectedId) {
        this.selectedId = null;
        this.emit();
      }
    }
    if (this.dragging === "priceAxis") {
      const dy = y - this.dragLastY;
      this.dragLastY = y;
      if (Math.abs(dy) > 2) {
        this.gestureMoved = true;
        this.ensurePriceSpan();
        if (this.priceSpan != null && this.priceMid != null) {
          this.priceSpan = clamp(this.priceSpan * Math.exp(dy / 160), 1e-8, 1e12);
          this.fitMode = false;
        }
      }
    }
    if (this.dragging === "timeAxis") {
      const dx = x - this.dragLastX;
      this.dragLastX = x;
      if (Math.abs(dx) > 2) {
        this.gestureMoved = true;
        this.setViewCount(this.viewCount * Math.exp(-dx / 200));
        this.fitMode = false;
      }
    }
    if (this.dragging === "pan") {
      const dx = x - this.dragLastX;
      const dy = y - this.dragLastY;
      this.dragLastX = x;
      this.dragLastY = y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) this.gestureMoved = true;
      const slot = this.slotWidth(this.layout().main);
      this.viewEnd -= dx / Math.max(0.001, slot);
      this.clampPan();
      this.fitMode = false;
      if (Math.abs(dy) > 0) {
        this.ensurePriceSpan();
        if (this.priceSpan != null && this.priceMid != null) {
          this.priceMid += (dy / Math.max(1, this.layout().main.h)) * this.priceSpan;
        }
      }
    }
    if (this.dragging === "drawing" && this.selectedId) {
      const d = this.drawings.find((item) => item.id === this.selectedId);
      let p = this.pointFromMouse(x, y);
      if (d && p && !d.locked) {
        if (!this.dragDirty) {
          this.pushUndo();
          this.dragDirty = true;
        }
        if (this.dragHandle != null && d.points[this.dragHandle]) {
          if (e.shiftKey && d.points.length >= 2) {
            const anchorIdx = this.dragHandle === 0 ? Math.min(1, d.points.length - 1) : 0;
            p = this.shiftSnapPoint(d.points[anchorIdx], p);
          }
          d.points[this.dragHandle] = p;
          if (d.kind === "gannsquarefixed") this.constrainGannSquareFixed(d, this.dragHandle === 0 ? 0 : 1);
        } else if (this.dragFrom) {
          const dt = p.time - this.dragFrom.time;
          const dp = p.price - this.dragFrom.price;
          d.points = d.points.map((pt) => ({ time: pt.time + dt, price: pt.price + dp }));
          this.dragFrom = p;
        }
      }
    } else if (this.draft && this.dragging !== "brush") {
      let p = this.pointFromMouse(x, y);
      if (p) {
        if (e.shiftKey && this.draft.points.length >= 1) {
          p = this.shiftSnapPoint(this.draft.points[0], p);
        }
        if (this.draft.points.length === 1) this.draft.points = [this.draft.points[0], p];
        else this.draft.points = [...this.draft.points.slice(0, -1), p];
        if (this.draft.kind === "gannsquarefixed" && this.draft.points.length >= 2) {
          this.constrainGannSquareFixed(this.draft, 1);
        }
      }
    }
    if (this.dragging === "brush") {
      const p = this.pointFromMouse(x, y);
      if (p && this.draft) this.draft.points = [...this.draft.points, p];
    }
    this.draw();
    this.emit();
  };

  private onUp = (e?: PointerEvent): void => {
    if (e) {
      this.pointers.delete(e.pointerId);
      try {
        this.canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      if (this.pointers.size >= 2) {
        this.beginPinch();
        return;
      }
      if (this.pointers.size === 1 && this.dragging === "pinch") {
        // Drop back to pan with the remaining finger
        const rem = [...this.pointers.entries()][0];
        const r = this.canvas.getBoundingClientRect();
        this.dragging = "pan";
        this.dragLastX = rem[1].x - r.left;
        this.dragLastY = rem[1].y - r.top;
        this.emit();
        this.draw();
        return;
      }
    } else {
      this.pointers.clear();
    }

    const tapX = e ? this.local(e).x : this.mouse?.x;
    const tapY = e ? this.local(e).y : this.mouse?.y;
    const wasAxisOrPan =
      this.dragging === "pan" || this.dragging === "priceAxis" || this.dragging === "timeAxis" || this.dragging == null;
    const canDoubleTap =
      !this.gestureMoved &&
      this.pointers.size === 0 &&
      wasAxisOrPan &&
      this.tool !== "brush" &&
      this.tool !== "highlighter" &&
      this.tool !== "zoom" &&
      !isDrawingTool(this.tool) &&
      tapX != null &&
      tapY != null;

    if (this.dragging === "zoom" && this.draft && this.draft.points.length >= 2) {
      const t0 = Math.min(this.draft.points[0].time, this.draft.points[1].time);
      const t1 = Math.max(this.draft.points[0].time, this.draft.points[1].time);
      const i0 = this.indexFromTime(t0);
      const i1 = this.indexFromTime(t1);
      const span = Math.max(8, Math.abs(i1 - i0));
      this.setViewCount(span, (i0 + i1) / 2);
      this.fitMode = false;
      this.draft = null;
      this.tool = "crosshair";
    }
    if (this.dragging === "brush" && this.draft) this.finishDraft();
    this.dragging = null;
    this.dragHandle = null;
    this.dragFrom = null;
    this.dragDirty = false;
    this.pinchStartDist = 0;

    if (canDoubleTap && tapX != null && tapY != null) {
      const now = performance.now();
      const dt = now - this.lastTapAt;
      const dist = Math.hypot(tapX - this.lastTapX, tapY - this.lastTapY);
      if (dt > 0 && dt < 350 && dist < 28) {
        this.lastTapAt = 0;
        this.handleAxisOrChartDoubleActivate(tapX, tapY);
        return;
      }
      this.lastTapAt = now;
      this.lastTapX = tapX;
      this.lastTapY = tapY;
    }

    this.emit();
    this.draw();
  };

  private onLeave = (e: PointerEvent): void => {
    // Keep active drag alive while pointer is captured (mobile finger slides).
    if (this.dragging && this.pointers.has(e.pointerId)) return;
    if (this.dragging) return;
    this.mouse = null;
    this.canvas.style.cursor = "crosshair";
    this.draw();
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const zone = this.hitZone(x, y);
    if (zone === "price" || e.shiftKey) {
      this.ensurePriceSpan();
      if (this.priceSpan != null) {
        this.priceSpan = clamp(this.priceSpan * (e.deltaY > 0 ? 1.12 : 0.88), 1e-8, 1e12);
        this.fitMode = false;
      }
    } else {
      const main = this.layout().main;
      const frac = clamp((x - main.x) / Math.max(1, main.w), 0, 1);
      const anchor = this.viewStart() + frac * this.viewCount;
      this.setViewCount(this.viewCount * (e.deltaY > 0 ? 1.12 : 0.9), anchor);
      this.fitMode = false;
    }
    this.emit();
    this.draw();
  };

  private onContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
    const { x, y } = this.local(e as unknown as PointerEvent);
    const hit = this.hideDrawings || this.lockDrawings ? null : this.hitDrawing(x, y);
    if (hit) {
      this.openDrawingMenu(hit.id, e.clientX, e.clientY);
      return;
    }
    this.closeDrawingMenu();
  };

  private onDbl = (e?: MouseEvent): void => {
    if (this.draft && isOpenEnded(this.draft.kind)) {
      if (this.draft.points.length > 2) this.draft.points = this.draft.points.slice(0, -1);
      this.finishDraft();
      return;
    }
    if (e) {
      const { x, y } = this.local(e as unknown as PointerEvent);
      this.handleAxisOrChartDoubleActivate(x, y);
      return;
    }
    this.fitContent();
  };

  private handleAxisOrChartDoubleActivate(x: number, y: number): void {
    const zone = this.hitZone(x, y);
    if (zone === "price") {
      this.resetPriceScale();
      return;
    }
    if (zone === "time") {
      this.fitTimeScale();
      return;
    }
    const hit = this.hitDrawing(x, y);
    if (hit) {
      this.openDrawingProperties(hit.id);
      return;
    }
    this.fitContent();
  }

  private onKey = (e: KeyboardEvent): void => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;

    if (e.shiftKey && e.altKey && e.key.toLowerCase() === "r") {
      e.preventDefault();
      this.setReplay(!this.replay);
      return;
    }
    if (this.replay && e.shiftKey && e.key === "ArrowDown") {
      e.preventDefault();
      this.setReplayPlaying(!this.replayPlaying);
      return;
    }
    if (this.replay && e.shiftKey && e.key === "ArrowRight") {
      e.preventDefault();
      this.stepReplay();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) this.redo();
      else this.undo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
      e.preventDefault();
      this.redo();
      return;
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      if (this.selectedId) this.removeDrawing(this.selectedId);
      else if (this.selectedIndicatorId) this.removeIndicator(this.selectedIndicatorId);
    }
    if (e.key === "Enter" && this.draft && isOpenEnded(this.draft.kind)) {
      if (this.draft.points.length > 2) this.draft.points = this.draft.points.slice(0, -1);
      this.finishDraft();
      return;
    }
    if (e.key === "Escape") {
      if (this.replaySelecting) {
        this.jumpToRealtime();
        return;
      }
      if (this.drawingPropsId || this.drawingMenu) {
        this.drawingPropsId = null;
        this.drawingMenu = null;
        this.emit();
        return;
      }
      this.draft = null;
      this.selectedId = null;
      this.selectedIndicatorId = null;
      this.tool = "crosshair";
      this.emit();
      this.draw();
    }
    if (e.key === "+" || e.key === "=") this.zoom(1);
    if (e.key === "-") this.zoom(-1);
    if (e.key.toLowerCase() === "l") this.toggle("logScale");
    if (e.key.toLowerCase() === "a" && !e.altKey) this.onDbl();

    // Supercharts drawing hotkeys (K-01…K-04)
    if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      const k = e.key.toLowerCase();
      if (k === "t") {
        e.preventDefault();
        this.setTool("trend");
        return;
      }
      if (k === "h") {
        e.preventDefault();
        this.setTool("hline");
        return;
      }
      if (k === "v") {
        e.preventDefault();
        this.setTool("vline");
        return;
      }
      if (k === "f") {
        e.preventDefault();
        this.setTool("fib");
        return;
      }
    }
  };

  private local(e: PointerEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
}
