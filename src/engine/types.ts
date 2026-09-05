export type Interval = string;

export type ChartType =
  | "candle"
  | "hollow"
  | "bar"
  | "volcandle"
  | "line"
  | "linemarkers"
  | "area"
  | "hlcarea"
  | "baseline"
  | "heikin"
  | "stepline"
  | "columns"
  | "highlow"
  | "renko"
  | "linebreak"
  | "kagi"
  | "pnf"
  | "rangechart"
  | "volfoot"
  | "tpo"
  | "sessionvp";

export type CursorTool = "cursor" | "crosshair" | "dot" | "eraser" | "zoom" | "demonstration" | "magic";

export type DrawingKind =
  | "trend"
  | "ray"
  | "info"
  | "extended"
  | "trendangle"
  | "hline"
  | "horzray"
  | "vline"
  | "crossline"
  | "parallel"
  | "regression"
  | "flattop"
  | "disjoint"
  | "fib"
  | "fibext"
  | "fibchannel"
  | "fibtimezone"
  | "fibfan"
  | "fibtime"
  | "fibcircles"
  | "fibspiral"
  | "fibarcs"
  | "fibwedge"
  | "pitchfan"
  | "pitchfork"
  | "schiff"
  | "modschiff"
  | "insidepitchfork"
  | "gannbox"
  | "gannsquare"
  | "gannfan"
  | "gannsquarefixed"
  | "brush"
  | "highlighter"
  | "rect"
  | "rotatedrect"
  | "path"
  | "circle"
  | "ellipse"
  | "polyline"
  | "triangle"
  | "arc"
  | "curve"
  | "doublecurve"
  | "arrow"
  | "arrowup"
  | "arrowdown"
  | "text"
  | "anchoredtext"
  | "note"
  | "signpost"
  | "callout"
  | "comment"
  | "pricelabel"
  | "pricenote"
  | "arrowmarker"
  | "arrowmarkleft"
  | "arrowmarkright"
  | "flagmark"
  | "sticker"
  | "table"
  | "image"
  | "anchorednote"
  | "xabcd"
  | "cypher"
  | "headshoulders"
  | "abcd"
  | "trianglepattern"
  | "threedrives"
  | "elliottimpulse"
  | "elliottcorrection"
  | "elliotttriangle"
  | "elliottdouble"
  | "elliotttriple"
  | "cycliclines"
  | "timecycles"
  | "sineline"
  | "long"
  | "short"
  | "forecast"
  | "daterange"
  | "pricerange"
  | "datepricerange"
  | "barspattern"
  | "ghostfeed"
  | "projection"
  | "sector"
  | "anchoredvwap"
  | "volprofile"
  | "anchoredvolprofile"
  | "measure";

export type Tool = CursorTool | DrawingKind;

export type MagnetMode = "off" | "weak" | "strong";

export type IndicatorKind =
  | "sma"
  | "ema"
  | "wma"
  | "smma"
  | "vwma"
  | "hma"
  | "bb"
  | "vwap"
  | "rsi"
  | "macd"
  | "stoch"
  | "atr"
  | "vol"
  | "ichimoku"
  | "psar"
  | "supertrend"
  | "adx"
  | "stochrsi"
  | "cci"
  | "willr"
  | "obv"
  | "cmf"
  | "donchian"
  | "keltner"
  | "pivot";

export type IndicatorPane = "main" | "rsi" | "macd" | "stoch" | "atr" | "volume" | "osc";

export type Bar = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type SymbolInfo = {
  ticker: string;
  name: string;
  exchange: string;
  type: "crypto" | "fx" | "stock" | "metal" | "index" | "fund" | "future" | "bond" | "economy" | "option";
  pricePrecision: number;
};

/** Per-timeframe visibility buckets (GAP-14), same shape as drawing visibility. */
export type IndicatorVisibility = DrawingVisibility;

export const DEFAULT_INDICATOR_VISIBILITY: IndicatorVisibility = {
  seconds: true,
  minutes: true,
  hours: true,
  daily: true,
  weekly: true,
  monthly: true,
};

export type IndicatorInstance = {
  id: string;
  kind: IndicatorKind;
  pane: IndicatorPane;
  params: number[];
  visible: boolean;
  color: string;
  lineWidth?: number;
  lineStyle?: LineStyle;
  source?: ChartSource;
  /** Horizontal reference levels (IND-08), e.g. RSI 30/70. */
  levels?: number[];
  /** Paint order within a pane (IND-10); higher draws later. */
  zIndex?: number;
  /** Pin to left/right price scale (IND-11 / V-26). */
  scaleSide?: "left" | "right";
  /** Soft-collapse extra pane (V-14). */
  collapsed?: boolean;
  /** Interval-bucket visibility; omitted means all on (GAP-14). */
  visibility?: IndicatorVisibility;
  /** Legend / axis value decimals (GAP-13). Default = symbol precision. */
  precision?: number;
  /** Draw last-value horizontal price line (GAP-13). */
  priceLine?: boolean;
  /** Keep last value labeled on the price scale (GAP-13). */
  trackPrice?: boolean;
};


export type ChartPoint = {
  time: number;
  price: number;
};

export type LineStyle = "solid" | "dashed" | "dotted";

/** Line endpoint cap (DI-17). */
export type LineEnd = "normal" | "arrow" | "circle";

/** Grid mode for canvas (V-10). */
export type GridMode = "both" | "vert" | "horiz" | "none";

/** Per-level Fib Retracement style (DI-20 / D-FI-01). */
export type FibLevelStyle = {
  ratio: number;
  visible: boolean;
  color: string;
  /** Fill toward the next visible level. */
  fill: string;
};

/** Supercharts-style Fib Retracement options. */
export type FibRetraceStyle = {
  levels: FibLevelStyle[];
  showTrendLine: boolean;
  trendColor: string;
  trendWidth: number;
  trendStyle: LineStyle;
  extendLeft: boolean;
  extendRight: boolean;
  reverse: boolean;
  showBackground: boolean;
  showPrices: boolean;
  showLevels: boolean;
  /** Independent stats readout for trend / channel tools (DI-19). */
  showStats?: boolean;
  levelsWidth: number;
  levelsStyle: LineStyle;
};

/** Per-timeframe visibility (DI-09), matching Supercharts Visibility tab buckets. */
export type DrawingVisibility = {
  seconds: boolean;
  minutes: boolean;
  hours: boolean;
  daily: boolean;
  weekly: boolean;
  monthly: boolean;
};

export const DEFAULT_DRAWING_VISIBILITY: DrawingVisibility = {
  seconds: true,
  minutes: true,
  hours: true,
  daily: true,
  weekly: true,
  monthly: true,
};

export type Drawing = {
  id: string;
  kind: DrawingKind;
  points: ChartPoint[];
  color: string;
  text?: string;
  locked?: boolean;
  /** Soft-hide one object without removing it (DI-04 / DI-11). */
  visible?: boolean;
  lineWidth?: number;
  lineStyle?: LineStyle;
  /** Left endpoint cap for linear tools (DI-17). */
  leftEnd?: LineEnd;
  /** Right endpoint cap for linear tools (DI-17). */
  rightEnd?: LineEnd;
  /** Interval-bucket visibility; omitted means all on. */
  visibility?: DrawingVisibility;
  /** Fib / Gann / Pitchfork style (D-FI-01…18); omitted uses Supercharts defaults. */
  fib?: FibRetraceStyle;
  /**
   * Locked price-per-bar ratio for Gann Square Fixed (D-FI-19).
   * Captured from the chart scale at creation; keeps |Δprice| = |Δbars| × scaleRatio.
   */
  scaleRatio?: number;
};

export type DrawingContextMenu = {
  id: string;
  x: number;
  y: number;
};

export type ChartContextMenu = {
  kind: "chart" | "price" | "time";
  x: number;
  y: number;
  price?: number;
  time?: number;
};

export type ChartEventKind = "earnings" | "dividend" | "split" | "news" | "idea";

export type ChartEvent = {
  id: string;
  time: number;
  kind: ChartEventKind;
  label: string;
};

export type Theme = "dark" | "light";

export type ChartSource = "open" | "high" | "low" | "close" | "hl2" | "hlc3" | "ohlc4";

export type ChartStyle = {
  upColor: string;
  downColor: string;
  wickUpColor: string;
  wickDownColor: string;
  borderUpColor: string;
  borderDownColor: string;
  showWick: boolean;
  showBorder: boolean;
  source: ChartSource;
};

export type CanvasSettings = {
  showOhlc: boolean;
  showVolumeLegend: boolean;
  showBarChange: boolean;
  showWatermark: boolean;
  showCountdown: boolean;
  showHighLow: boolean;
  showPrevDayClose: boolean;
  showNavButtons: boolean;
  /** Crosshair OHLC tracker box (V-02). */
  showTrackerBox: boolean;
  /** Last price line + axis label (V-04). */
  showLastPriceLine: boolean;
  /** Volume histogram overlay on main pane (V-15). */
  volumeOverlay: boolean;
  /** Session / day separators (V-16). */
  sessionBreaks: boolean;
  /** Earnings / dividend / split / news markers on time scale (V-17). */
  showEvents: boolean;
  /** Invert price scale (V-22). */
  invertScale: boolean;
  /** Lock price-to-bar ratio (V-23). */
  lockRatio: boolean;
  /** Auto-scale using price only, ignore overlays (V-24). */
  scalePriceOnly: boolean;
  /** Show left price scale (V-26). */
  leftScale: boolean;
  /** Show right price scale (V-26). */
  rightScale: boolean;
  /** Pin left edge when interval changes (V-34). */
  pinLeft: boolean;
  /** Pane maximize/collapse/close buttons (V-14 / S-13). */
  showPaneButtons: boolean;
  /** Top / bottom / right plot margins 0–0.4 (S-14). */
  marginTop: number;
  marginBottom: number;
  marginRight: number;
  /** IANA timezone for axis labels (I-11). */
  timezone: string;
  /** Axis date format (I-12). */
  dateFormat: "default" | "ymd" | "dmy" | "mdy";
  bgColor: string;
  gridColor: string;
  crosshairColor: string;
  crosshairStyle: LineStyle;
  crosshairWidth: number;
  /** Vert / horiz / both / none (V-10). When set, overrides the legacy showGrid flag. */
  gridMode: GridMode;
  watermarkOpacity: number;
};

export type RangePreset = "1D" | "5D" | "1M" | "3M" | "6M" | "YTD" | "1Y" | "5Y" | "ALL";

export type LegendLine = {
  id: string;
  text: string;
  color: string;
};

export type EngineSnapshot = {
  symbol: SymbolInfo;
  interval: Interval;
  chartType: ChartType;
  tool: Tool;
  theme: Theme;
  logScale: boolean;
  percentScale: boolean;
  /** Price indexed to 100 at left of view (V-20). */
  indexedScale: boolean;
  magnet: MagnetMode;
  showGrid: boolean;
  hover: Bar | null;
  last: Bar | null;
  indicators: IndicatorInstance[];
  drawings: Drawing[];
  selectedId: string | null;
  selectedIndicatorId: string | null;
  /** When set, UI opens the drawing properties dialog (DI-05). */
  drawingPropsId: string | null;
  /** Right-click menu anchor (DI-11). */
  drawingMenu: DrawingContextMenu | null;
  /** Empty-chart / scale context menu (V-35 / V-36). */
  chartMenu: ChartContextMenu | null;
  /** Maximized extra pane indicator id (V-14). */
  maximizedPaneId: string | null;
  replay: boolean;
  /** Choosing start bar (blue scissors line) before / during replay. */
  replaySelecting: boolean;
  replayPlaying: boolean;
  replaySpeed: number;
  /** Index into fullBars for the replay start (inclusive end of visible history). */
  replayStartIndex: number | null;
  stayMode: boolean;
  hideDrawings: boolean;
  hideIndicators: boolean;
  /** When true, magnet also snaps to main-pane indicator values (D-AX-05). */
  snapIndicators: boolean;
  lockDrawings: boolean;
  fitMode: boolean;
  countdown: string;
  legend: LegendLine[];
  canUndo: boolean;
  canRedo: boolean;
  compare: string | null;
  rangePreset: RangePreset;
  autoScale: boolean;
  chartStyle: ChartStyle;
  canvas: CanvasSettings;
};
