import { INTERVAL_SEC } from "../data/feed";
import { hitTestDrawing, isDrawingTool, isOpenEnded, neededPoints, paintDrawing } from "./drawings";
import { bollinger, closesOf, ema, heikinAshi, macd, rsi, sma } from "./indicators";
import { clamp, formatPrice, formatTime, formatVolume, niceTicks, uid } from "./math";
import { atr, stoch, vwap, wma } from "./studies";
import { AXIS_FONT, CHART_FONT, CHART_FONT_BOLD, palettes } from "./theme";
import type {
  Bar,
  ChartPoint,
  ChartType,
  Drawing,
  EngineSnapshot,
  IndicatorInstance,
  Interval,
  LegendLine,
  MagnetMode,
  RangePreset,
  SymbolInfo,
  Theme,
  Tool,
} from "./types";

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
  private dragging: "pan" | "drawing" | "zoom" | "brush" | "priceAxis" | "timeAxis" | null = null;
  private dragLastX = 0;
  private dragLastY = 0;
  private priceSpan: number | null = null;
  private priceMid: number | null = null;
  private replay = false;
  private replayPlaying = false;
  private replaySpeed = 1;
  private stayMode = false;
  private hideDrawings = false;
  private lockDrawings = false;
  private fitMode = true;
  private rangePreset: RangePreset = "ALL";
  private undoStack: Drawing[][] = [];
  private redoStack: Drawing[][] = [];
  private listeners = new Set<Listener>();
  private raf = 0;
  private snapshot: EngineSnapshot;

  constructor(container: HTMLElement, symbol: SymbolInfo) {
    this.container = container;
    this.symbol = symbol;
    this.canvas = document.createElement("canvas");
    this.canvas.className = "forge-canvas";
    this.canvas.tabIndex = 0;
    container.appendChild(this.canvas);
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D is not available");
    this.ctx = ctx;
    this.bind();
    this.snapshot = this.buildSnapshot();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): EngineSnapshot => this.snapshot;

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
      replay: this.replay,
      replayPlaying: this.replayPlaying,
      replaySpeed: this.replaySpeed,
      stayMode: this.stayMode,
      hideDrawings: this.hideDrawings,
      lockDrawings: this.lockDrawings,
      fitMode: this.fitMode,
      countdown: this.countdown(),
      legend: this.legendLines(),
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
      compare: this.compareTicker,
      rangePreset: this.rangePreset,
      autoScale: this.priceSpan == null,
    };
  }

  setBars(bars: Bar[]): void {
    this.fullBars = bars;
    this.bars = this.replay ? bars.slice(0, Math.max(30, Math.floor(bars.length * 0.7))) : bars;
    this.viewEnd = this.bars.length;
    this.hover = this.bars.at(-1) ?? null;
    this.emit();
    this.draw();
  }

  setSymbol(symbol: SymbolInfo, bars: Bar[]): void {
    this.symbol = symbol;
    this.drawings = [];
    this.draft = null;
    this.selectedId = null;
    this.compareBars = null;
    this.compareTicker = null;
    this.setBars(bars);
  }

  setInterval(interval: Interval, bars: Bar[]): void {
    this.interval = interval;
    this.setBars(bars);
  }

  setChartType(type: ChartType): void {
    this.chartType = type;
    this.emit();
    this.draw();
  }

  setTool(tool: Tool, extra?: { text?: string }): void {
    this.tool = tool;
    if (extra?.text) this.glyph = extra.text;
    this.draft = null;
    this.emit();
    this.draw();
  }

  setTheme(theme: Theme): void {
    this.theme = theme;
    this.emit();
    this.draw();
  }

  setMagnet(mode: MagnetMode): void {
    this.magnet = mode;
    this.emit();
  }

  toggle(flag: "logScale" | "percentScale" | "showGrid" | "stayMode" | "hideDrawings" | "lockDrawings" | "fitMode"): void {
    this[flag] = !this[flag];
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
              : [12, 26, 9];
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

  removeIndicator(id: string): void {
    this.indicators = this.indicators.filter((i) => i.id !== id);
    this.emit();
    this.draw();
  }

  toggleIndicator(id: string): void {
    this.indicators = this.indicators.map((i) => (i.id === id ? { ...i, visible: !i.visible } : i));
    this.emit();
    this.draw();
  }

  removeDrawing(id: string): void {
    if (this.lockDrawings) return;
    this.pushUndo();
    this.drawings = this.drawings.filter((d) => d.id !== id);
    if (this.selectedId === id) this.selectedId = null;
    this.emit();
    this.draw();
  }

  clearDrawings(): void {
    if (this.lockDrawings) return;
    this.pushUndo();
    this.drawings = [];
    this.draft = null;
    this.selectedId = null;
    this.emit();
    this.draw();
  }

  undo(): void {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.redoStack.push(this.drawings);
    this.drawings = prev;
    this.emit();
    this.draw();
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(this.drawings);
    this.drawings = next;
    this.emit();
    this.draw();
  }

  zoom(dir: 1 | -1): void {
    this.viewCount = clamp(Math.round(this.viewCount * (dir > 0 ? 0.82 : 1.22)), 20, Math.max(20, this.bars.length));
    this.fitMode = false;
    this.emit();
    this.draw();
  }

  resetPriceScale(): void {
    this.priceSpan = null;
    this.priceMid = null;
    this.fitMode = true;
    this.emit();
    this.draw();
  }

  upsertBar(bar: Bar): void {
    if (this.replay) return;
    const last = this.bars.at(-1);
    const follow = this.viewEnd >= this.bars.length - 1;
    if (last && bar.time === last.time) {
      this.bars = [...this.bars.slice(0, -1), bar];
    } else if (!last || bar.time > last.time) {
      this.bars = [...this.bars, bar];
    } else {
      return;
    }
    this.fullBars = this.bars;
    if (follow) this.viewEnd = this.bars.length;
    this.emit();
    this.draw();
  }

  applyRange(preset: RangePreset): void {
    this.rangePreset = preset;
    const span = RANGE_SEC[preset] / INTERVAL_SEC[this.interval];
    this.viewCount = clamp(Math.round(span), 20, this.bars.length);
    this.viewEnd = this.bars.length;
    this.fitMode = preset === "ALL";
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
    this.replay = on;
    this.replayPlaying = on;
    if (on) this.bars = this.fullBars.slice(0, Math.max(40, Math.floor(this.fullBars.length * 0.55)));
    else this.bars = this.fullBars;
    this.viewEnd = this.bars.length;
    this.emit();
    this.draw();
  }

  setReplayPlaying(on: boolean): void {
    this.replayPlaying = on;
    this.emit();
  }

  setReplaySpeed(speed: number): void {
    this.replaySpeed = speed;
    this.emit();
  }

  stepReplay(): void {
    if (!this.replay) return;
    const next = this.fullBars[this.bars.length];
    if (!next) {
      this.replayPlaying = false;
      this.emit();
      return;
    }
    this.bars = [...this.bars, next];
    this.viewEnd = this.bars.length;
    this.emit();
    this.draw();
  }

  patchLastBar(bar: Bar): void {
    if (this.replay) return;
    if (!this.bars.length) return;
    this.bars = [...this.bars.slice(0, -1), bar];
    this.fullBars = this.bars;
    if (this.viewEnd >= this.bars.length - 1) this.viewEnd = this.bars.length;
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
    this.ro.disconnect();
    this.canvas.remove();
    this.listeners.clear();
  }

  private pushUndo(): void {
    this.undoStack.push(this.drawings.map((d) => ({ ...d, points: [...d.points] })));
    this.redoStack = [];
  }

  private emit(): void {
    this.snapshot = this.buildSnapshot();
    this.listeners.forEach((l) => l());
  }

  private countdown(): string {
    const step = INTERVAL_SEC[this.interval];
    const last = this.bars.at(-1);
    if (!last) return "--:--";
    const remain = Math.max(0, last.time + step - Math.floor(Date.now() / 1000));
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
    const lines: LegendLine[] = [
      {
        id: "sym",
        text: `${this.symbol.ticker}  ${this.interval}  O${formatPrice(bar.open, p)} H${formatPrice(bar.high, p)} L${formatPrice(bar.low, p)} C${formatPrice(bar.close, p)}  ${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%`,
        color: chg >= 0 ? palettes[this.theme].up : palettes[this.theme].down,
      },
    ];
    const plotted = this.plotBars();
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
    if (this.compareTicker) lines.push({ id: "cmp", text: `Compare ${this.compareTicker}`, color: "#ab47bc" });
    return lines;
  }

  private bind(): void {
    this.canvas.addEventListener("pointerdown", this.onDown);
    this.canvas.addEventListener("pointermove", this.onMove);
    this.canvas.addEventListener("pointerup", this.onUp);
    this.canvas.addEventListener("pointerleave", this.onLeave);
    this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
    this.canvas.addEventListener("dblclick", this.onDbl);
    this.canvas.addEventListener("keydown", this.onKey);
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  private resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.canvas.width = Math.max(1, Math.floor(w * dpr));
    this.canvas.height = Math.max(1, Math.floor(h * dpr));
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw();
  }

  private extraIndicators(): IndicatorInstance[] {
    return this.indicators.filter((i) => i.visible && ["rsi", "macd", "stoch", "atr"].includes(i.pane));
  }

  private layout(): { main: Rect; extras: { rect: Rect; ind: IndicatorInstance }[]; chart: Rect } {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    const chart: Rect = { x: 0, y: 0, w: Math.max(0, w - PRICE_AXIS), h: Math.max(0, h - TIME_AXIS) };
    const extrasInd = this.extraIndicators();
    const extraH = extrasInd.length ? Math.min(120, chart.h * 0.18) : 0;
    const mainH = chart.h - extraH * extrasInd.length;
    const extras = extrasInd.map((ind, i) => ({
      ind,
      rect: { x: 0, y: mainH + i * extraH, w: chart.w, h: extraH } satisfies Rect,
    }));
    return { main: { x: 0, y: 0, w: chart.w, h: mainH }, extras, chart };
  }

  private viewSlice(): { from: number; to: number } {
    const to = clamp(this.viewEnd, 1, this.bars.length);
    const from = clamp(to - this.viewCount, 0, Math.max(0, to - 1));
    return { from, to };
  }

  private plotBars(): Bar[] {
    const { from, to } = this.viewSlice();
    const src = this.chartType === "heikin" ? heikinAshi(this.bars) : this.bars;
    return src.slice(from, to);
  }

  private baseClose(bars: Bar[]): number {
    return bars[0]?.close || 1;
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
    const pad = (max - min) * 0.08;
    const autoMin = min - pad;
    const autoMax = max + pad;
    if (this.priceSpan != null && this.priceMid != null) {
      return { min: this.priceMid - this.priceSpan / 2, max: this.priceMid + this.priceSpan / 2 };
    }
    return { min: autoMin, max: autoMax };
  }

  private xOf(indexInView: number, count: number, rect: Rect): number {
    const slot = rect.w / Math.max(1, count);
    return rect.x + slot * (indexInView + 0.5);
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

  private indexAtX(x: number, count: number, rect: Rect): number {
    const slot = rect.w / Math.max(1, count);
    return clamp(Math.floor((x - rect.x) / slot), 0, count - 1);
  }

  private pointFromMouse(x: number, y: number): ChartPoint | null {
    const { main } = this.layout();
    const bars = this.plotBars();
    if (!bars.length) return null;
    const range = this.priceRange(bars);
    const idx = this.indexAtX(x, bars.length, main);
    const bar = bars[idx];
    let price = this.priceAtY(y, range.min, range.max, main);
    if (this.percentScale) price = this.baseClose(bars) * (1 + price / 100);
    const slot = main.w / Math.max(1, bars.length);
    const iFloat = (x - main.x) / slot - 0.5;
    const i0 = clamp(Math.floor(iFloat), 0, bars.length - 1);
    const i1 = Math.min(i0 + 1, bars.length - 1);
    const t = clamp(iFloat - i0, 0, 1);
    let time = bars[i0].time + (bars[i1].time - bars[i0].time) * t;
    if (this.magnet !== "off") {
      const candidates = [bar.open, bar.high, bar.low, bar.close];
      const nearest = candidates.reduce((best, v) => (Math.abs(v - price) < Math.abs(best - price) ? v : best));
      if (this.magnet === "strong" || Math.abs(nearest - price) / (price || 1) < 0.004) {
        price = nearest;
        time = bar.time;
      }
    }
    return { time, price };
  }

  private indicatorSeries(ind: IndicatorInstance, src: Bar[]): { lines: (number | null)[][]; hist?: (number | null)[] } {
    const c = closesOf(src);
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
    if (!bars.length) return;
    const range = this.priceRange(bars);
    this.paintWatermark(layout.main, pal.watermark);
    this.paintGrid(layout.main, range.min, range.max, pal.grid);
    this.paintVolumeOverlay(layout.main, bars, pal);
    this.paintSeries(layout.main, bars, range, pal);
    this.paintMainIndicators(layout.main, bars, range);
    this.paintCompare(layout.main, bars, pal);
    this.paintPriceLine(layout.main, bars, range, pal);
    for (const extra of layout.extras) this.paintPane(extra.rect, extra.ind, pal);
    if (!this.hideDrawings) this.paintDrawings(layout.main, bars, range);
    this.paintAxes(layout, bars, range, pal);
    this.paintCrosshair(layout, bars, range, pal);
    this.paintLegend(layout.main, pal);
  }

  private paintWatermark(rect: Rect, color: string): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = color;
    ctx.font = "bold 92px Trebuchet MS, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(this.symbol.ticker, rect.x + rect.w / 2, rect.y + rect.h / 2);
    ctx.restore();
  }

  private paintGrid(rect: Rect, min: number, max: number, color: string): void {
    if (!this.showGrid) return;
    const ctx = this.ctx;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    for (const tick of niceTicks(min, max, 8)) {
      const y = this.yOf(tick, min, max, rect);
      ctx.beginPath();
      ctx.moveTo(rect.x, y);
      ctx.lineTo(rect.x + rect.w, y);
      ctx.stroke();
    }
  }

  private paintVolumeOverlay(rect: Rect, bars: Bar[], pal: (typeof palettes)["dark"]): void {
    if (!this.indicators.some((i) => i.kind === "vol" && i.visible)) return;
    const ctx = this.ctx;
    const maxVol = Math.max(...bars.map((b) => b.volume), 1);
    const slot = rect.w / Math.max(1, bars.length);
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
    const slot = rect.w / Math.max(1, bars.length);
    const body = Math.max(1.2, slot * 0.7);

    if (this.chartType === "line" || this.chartType === "area" || this.chartType === "stepline" || this.chartType === "baseline") {
      ctx.beginPath();
      bars.forEach((b, i) => {
        const x = this.xOf(i, bars.length, rect);
        const y = this.yOf(this.scaled(b.close, bars), range.min, range.max, rect);
        if (i === 0) ctx.moveTo(x, y);
        else if (this.chartType === "stepline") {
          const px = this.xOf(i - 1, bars.length, rect);
          ctx.lineTo(x, this.yOf(this.scaled(bars[i - 1].close, bars), range.min, range.max, rect));
          ctx.lineTo(x, y);
          void px;
        } else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = this.chartType === "baseline" ? pal.up : pal.accent;
      ctx.lineWidth = 1.6;
      ctx.stroke();
      if (this.chartType === "area" || this.chartType === "baseline") {
        const baseY =
          this.chartType === "baseline"
            ? this.yOf(this.scaled(bars[0].close, bars), range.min, range.max, rect)
            : rect.y + rect.h;
        ctx.lineTo(this.xOf(bars.length - 1, bars.length, rect), baseY);
        ctx.lineTo(this.xOf(0, bars.length, rect), baseY);
        ctx.closePath();
        ctx.fillStyle = this.chartType === "baseline" ? "rgba(38,166,154,0.12)" : "rgba(41,98,255,0.12)";
        ctx.fill();
      }
      return;
    }

    bars.forEach((b, i) => {
      const x = this.xOf(i, bars.length, rect);
      const yO = this.yOf(this.scaled(b.open, bars), range.min, range.max, rect);
      const yC = this.yOf(this.scaled(b.close, bars), range.min, range.max, rect);
      const yH = this.yOf(this.scaled(b.high, bars), range.min, range.max, rect);
      const yL = this.yOf(this.scaled(b.low, bars), range.min, range.max, rect);
      const up = b.close >= b.open;
      ctx.strokeStyle = up ? pal.wickUp : pal.wickDown;
      ctx.beginPath();
      ctx.moveTo(x, yH);
      ctx.lineTo(x, yL);
      ctx.stroke();
      const top = Math.min(yO, yC);
      const height = Math.max(1, Math.abs(yC - yO));
      if (this.chartType === "bar") {
        ctx.beginPath();
        ctx.moveTo(x - body / 2, yO);
        ctx.lineTo(x, yO);
        ctx.moveTo(x, yC);
        ctx.lineTo(x + body / 2, yC);
        ctx.stroke();
      } else if (this.chartType === "hollow" && up) {
        ctx.strokeRect(x - body / 2, top, body, height);
      } else {
        ctx.fillStyle = up ? pal.up : pal.down;
        ctx.fillRect(x - body / 2, top, body, height);
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
        ctx.lineWidth = 1.15;
        ctx.stroke();
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
    const last = bars.at(-1);
    if (!last) return;
    const y = this.yOf(this.scaled(last.close, bars), range.min, range.max, rect);
    const ctx = this.ctx;
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = last.close >= last.open ? pal.up : pal.down;
    ctx.beginPath();
    ctx.moveTo(rect.x, y);
    ctx.lineTo(rect.x + rect.w, y);
    ctx.stroke();
    ctx.setLineDash([]);
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
      const slot = rect.w / Math.max(1, bars.length);
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

  private xOfTime(time: number, bars: Bar[], rect: Rect): number {
    if (!bars.length) return rect.x;
    const slot = rect.w / Math.max(1, bars.length);
    if (time <= bars[0].time) {
      const dt = bars[1] ? bars[1].time - bars[0].time : 1;
      return this.xOf(0, bars.length, rect) + ((time - bars[0].time) / (dt || 1)) * slot;
    }
    const last = bars.length - 1;
    if (time >= bars[last].time) {
      const dt = last > 0 ? bars[last].time - bars[last - 1].time : 1;
      return this.xOf(last, bars.length, rect) + ((time - bars[last].time) / (dt || 1)) * slot;
    }
    let lo = 0;
    let hi = last;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (bars[mid].time <= time) lo = mid;
      else hi = mid;
    }
    const span = bars[hi].time - bars[lo].time || 1;
    const t = (time - bars[lo].time) / span;
    return this.xOf(lo, bars.length, rect) * (1 - t) + this.xOf(hi, bars.length, rect) * t;
  }

  private paintDrawings(rect: Rect, bars: Bar[], range: { min: number; max: number }): void {
    const all = this.draft ? [...this.drawings, this.draft] : this.drawings;
    for (const d of all) {
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
    const step = Math.max(1, Math.floor(bars.length / 6));
    ctx.textAlign = "center";
    for (let i = 0; i < bars.length; i += step) {
      ctx.fillText(formatTime(bars[i].time, this.interval), this.xOf(i, bars.length, layout.main), h - 8);
    }
    ctx.textAlign = "left";
    const last = bars.at(-1);
    if (last) {
      const y = this.yOf(this.scaled(last.close, bars), range.min, range.max, layout.main);
      ctx.fillStyle = last.close >= last.open ? pal.up : pal.down;
      ctx.fillRect(layout.chart.w, y - 9, PRICE_AXIS, 18);
      ctx.fillStyle = "#fff";
      ctx.fillText(
        this.percentScale ? `${this.scaled(last.close, bars).toFixed(2)}%` : formatPrice(last.close, this.symbol.pricePrecision),
        layout.chart.w + 8,
        y + 4,
      );
      ctx.fillStyle = pal.panel;
      ctx.fillRect(layout.chart.w, y + 10, PRICE_AXIS, 16);
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
    if (!this.mouse || this.tool === "cursor") return;
    const ctx = this.ctx;
    const { x, y } = this.mouse;
    if (x > layout.chart.w || y > layout.chart.h) return;
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = pal.cross;
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, layout.chart.h);
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(layout.chart.w, y + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
    const idx = this.indexAtX(x, bars.length, layout.main);
    const bar = bars[idx];
    this.hover = bar ?? this.hover;
    const price = this.priceAtY(y, range.min, range.max, layout.main);
    ctx.fillStyle = "#2962ff";
    ctx.fillRect(layout.chart.w, y - 8, PRICE_AXIS, 16);
    ctx.fillStyle = "#fff";
    ctx.font = AXIS_FONT;
    ctx.fillText(this.percentScale ? `${price.toFixed(2)}%` : formatPrice(price, this.symbol.pricePrecision), layout.chart.w + 8, y + 4);
    if (bar) {
      ctx.fillStyle = "#2962ff";
      ctx.fillRect(x - 48, layout.chart.h + 4, 96, 16);
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.fillText(formatTime(bar.time, this.interval), x, layout.chart.h + 16);
      ctx.textAlign = "left";
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
    this.legendLines().forEach((line, i) => {
      ctx.font = i === 0 ? CHART_FONT_BOLD : CHART_FONT;
      ctx.fillStyle = line.color || pal.text;
      ctx.fillText(line.text, rect.x + 10, rect.y + 18 + i * 16);
    });
  }

  private hitDrawing(x: number, y: number): Drawing | null {
    const layout = this.layout();
    const bars = this.plotBars();
    if (!bars.length) return null;
    const range = this.priceRange(bars);
    for (let i = this.drawings.length - 1; i >= 0; i--) {
      const d = this.drawings[i];
      const pts = d.points.map((p) => this.locate(p, bars, range, layout.main));
      if (hitTestDrawing(d, pts, x, y, layout.main)) return d;
    }
    return null;
  }

  private finishDraft(): void {
    if (!this.draft) return;
    this.pushUndo();
    this.drawings.push(this.draft);
    this.draft = null;
    if (!this.stayMode) this.tool = "crosshair";
  }

  private hitZone(x: number, y: number): "price" | "time" | "chart" {
    const { chart } = this.layout();
    if (x >= chart.w) return "price";
    if (y >= chart.h) return "time";
    return "chart";
  }

  private ensurePriceSpan(): void {
    if (this.priceSpan != null && this.priceMid != null) return;
    const r = this.priceRange(this.plotBars());
    this.priceSpan = r.max - r.min;
    this.priceMid = (r.max + r.min) / 2;
  }

  private updateCursor(x: number, y: number): void {
    const zone = this.hitZone(x, y);
    this.canvas.style.cursor = zone === "price" ? "ns-resize" : zone === "time" ? "ew-resize" : this.tool === "cursor" ? "default" : "crosshair";
  }

  private onDown = (e: PointerEvent): void => {
    this.canvas.setPointerCapture(e.pointerId);
    const { x, y } = this.local(e);
    this.mouse = { x, y };
    const zone = this.hitZone(x, y);
    if (zone === "price") {
      this.ensurePriceSpan();
      this.dragging = "priceAxis";
      this.dragLastY = y;
      this.fitMode = false;
      this.emit();
      return;
    }
    if (zone === "time") {
      this.dragging = "timeAxis";
      this.dragLastX = x;
      this.fitMode = false;
      this.emit();
      return;
    }
    const hit = this.lockDrawings ? null : this.hitDrawing(x, y);
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
    if (this.tool === "cursor" || this.tool === "crosshair" || this.tool === "dot") {
      if (hit) {
        this.selectedId = hit.id;
        this.dragging = "drawing";
      } else {
        this.selectedId = null;
        this.dragging = "pan";
        this.dragLastX = x;
      }
      this.emit();
      this.draw();
      return;
    }
    if (!isDrawingTool(this.tool)) return;
    const point = this.pointFromMouse(x, y);
    if (!point) return;
    const kind = this.tool;
    if (!this.draft) {
      const needsText = kind === "text" || kind === "anchoredtext" || kind === "note" || kind === "signpost" || kind === "callout" || kind === "comment" || kind === "pricenote";
      const text =
        kind === "sticker" || kind === "flagmark"
          ? this.glyph
          : needsText
            ? window.prompt("Text", kind === "note" ? "Note" : "Text") || "Text"
            : undefined;
      this.draft = { id: uid("dr"), kind, points: [point], color: palettes[this.theme].overlay, text };
      if (neededPoints(kind) === 1) this.finishDraft();
    } else {
      this.draft.points[this.draft.points.length - 1] = point;
      if (!isOpenEnded(this.draft.kind) && this.draft.points.length >= neededPoints(this.draft.kind)) this.finishDraft();
      else this.draft.points = [...this.draft.points, point];
    }
    this.emit();
    this.draw();
  };

  private onMove = (e: PointerEvent): void => {
    const { x, y } = this.local(e);
    this.mouse = { x, y };
    if (!this.dragging) this.updateCursor(x, y);
    if (this.dragging === "priceAxis" && this.priceSpan != null && this.priceMid != null) {
      const dy = y - this.dragLastY;
      this.dragLastY = y;
      this.priceSpan = clamp(this.priceSpan * Math.exp(dy / 160), 1e-8, 1e12);
      this.fitMode = false;
    }
    if (this.dragging === "timeAxis") {
      const dx = x - this.dragLastX;
      this.dragLastX = x;
      this.viewCount = clamp(Math.round(this.viewCount * Math.exp(-dx / 200)), 15, Math.max(15, this.bars.length));
      this.fitMode = false;
    }
    if (this.dragging === "pan") {
      const dx = x - this.dragLastX;
      this.dragLastX = x;
      const slot = this.layout().main.w / Math.max(1, this.viewCount);
      this.viewEnd = clamp(this.viewEnd - dx / slot, this.viewCount, this.bars.length);
      this.fitMode = false;
    }
    if (this.draft && this.dragging !== "brush") {
      const p = this.pointFromMouse(x, y);
      if (p) {
        if (this.draft.points.length === 1) this.draft.points = [this.draft.points[0], p];
        else this.draft.points = [...this.draft.points.slice(0, -1), p];
      }
    }
    if (this.dragging === "brush") {
      const p = this.pointFromMouse(x, y);
      if (p && this.draft) this.draft.points = [...this.draft.points, p];
    }
    this.draw();
    this.emit();
  };

  private onUp = (): void => {
    if (this.dragging === "zoom" && this.draft && this.draft.points.length >= 2) {
      this.viewCount = clamp(Math.round(this.viewCount * 0.55), 20, this.bars.length);
      this.draft = null;
    }
    if (this.dragging === "brush" && this.draft) this.finishDraft();
    this.dragging = null;
    this.emit();
    this.draw();
  };

  private onLeave = (): void => {
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
      this.viewCount = clamp(Math.round(this.viewCount * (e.deltaY > 0 ? 1.12 : 0.9)), 15, Math.max(15, this.bars.length));
      this.fitMode = false;
    }
    this.emit();
    this.draw();
  };

  private onDbl = (e?: MouseEvent): void => {
    if (this.draft && isOpenEnded(this.draft.kind)) {
      if (this.draft.points.length > 2) this.draft.points = this.draft.points.slice(0, -1);
      this.finishDraft();
      return;
    }
    if (e) {
      const { x, y } = this.local(e as unknown as PointerEvent);
      const zone = this.hitZone(x, y);
      if (zone === "price") {
        this.resetPriceScale();
        return;
      }
      if (zone === "time") {
        this.viewCount = 160;
        this.viewEnd = this.bars.length;
        this.fitMode = true;
        this.emit();
        this.draw();
        return;
      }
    }
    this.viewCount = 160;
    this.viewEnd = this.bars.length;
    this.fitMode = true;
    this.rangePreset = "ALL";
    this.resetPriceScale();
  };

  private onKey = (e: KeyboardEvent): void => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) this.redo();
      else this.undo();
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      if (this.selectedId) this.removeDrawing(this.selectedId);
    }
    if (e.key === "Enter" && this.draft && isOpenEnded(this.draft.kind)) {
      if (this.draft.points.length > 2) this.draft.points = this.draft.points.slice(0, -1);
      this.finishDraft();
      return;
    }
    if (e.key === "Escape") {
      this.draft = null;
      this.tool = "crosshair";
      this.emit();
      this.draw();
    }
    if (e.key === "+" || e.key === "=") this.zoom(1);
    if (e.key === "-") this.zoom(-1);
    if (e.key.toLowerCase() === "l") this.toggle("logScale");
    if (e.key.toLowerCase() === "a") this.onDbl();
  };

  private local(e: PointerEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
}
