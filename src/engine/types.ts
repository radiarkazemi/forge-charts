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
  | "flagmark"
  | "sticker"
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
  | "bb"
  | "vwap"
  | "rsi"
  | "macd"
  | "stoch"
  | "atr"
  | "vol";

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

export type IndicatorInstance = {
  id: string;
  kind: IndicatorKind;
  pane: "main" | "rsi" | "macd" | "stoch" | "atr" | "volume";
  params: number[];
  visible: boolean;
  color: string;
  lineWidth?: number;
  lineStyle?: LineStyle;
  source?: ChartSource;
};


export type ChartPoint = {
  time: number;
  price: number;
};

export type LineStyle = "solid" | "dashed" | "dotted";

export type Drawing = {
  id: string;
  kind: DrawingKind;
  points: ChartPoint[];
  color: string;
  text?: string;
  locked?: boolean;
  lineWidth?: number;
  lineStyle?: LineStyle;
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
  showNavButtons: boolean;
  bgColor: string;
  gridColor: string;
  crosshairColor: string;
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
  magnet: MagnetMode;
  showGrid: boolean;
  hover: Bar | null;
  last: Bar | null;
  indicators: IndicatorInstance[];
  drawings: Drawing[];
  selectedId: string | null;
  selectedIndicatorId: string | null;
  replay: boolean;
  /** Choosing start bar (blue scissors line) before / during replay. */
  replaySelecting: boolean;
  replayPlaying: boolean;
  replaySpeed: number;
  /** Index into fullBars for the replay start (inclusive end of visible history). */
  replayStartIndex: number | null;
  stayMode: boolean;
  hideDrawings: boolean;
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
