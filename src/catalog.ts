import type { ChartType, IndicatorKind, Interval, Tool } from "./engine/types";
import { intervalLabel, intervalShort } from "./data/interval";

export type IntervalItem = {
  id: Interval;
  label: string;
  short: string;
  group: string;
};

export const INTERVAL_GROUPS: { id: string; title: string; items: IntervalItem[] }[] = [
  {
    id: "seconds",
    title: "Seconds",
    items: [
      { id: "1S", label: "1 second", short: "1s", group: "seconds" },
      { id: "5S", label: "5 seconds", short: "5s", group: "seconds" },
      { id: "10S", label: "10 seconds", short: "10s", group: "seconds" },
      { id: "15S", label: "15 seconds", short: "15s", group: "seconds" },
      { id: "30S", label: "30 seconds", short: "30s", group: "seconds" },
    ],
  },
  {
    id: "minutes",
    title: "Minutes",
    items: [
      { id: "1", label: "1 minute", short: "1m", group: "minutes" },
      { id: "2", label: "2 minutes", short: "2m", group: "minutes" },
      { id: "3", label: "3 minutes", short: "3m", group: "minutes" },
      { id: "5", label: "5 minutes", short: "5m", group: "minutes" },
      { id: "10", label: "10 minutes", short: "10m", group: "minutes" },
      { id: "15", label: "15 minutes", short: "15m", group: "minutes" },
      { id: "30", label: "30 minutes", short: "30m", group: "minutes" },
      { id: "45", label: "45 minutes", short: "45m", group: "minutes" },
    ],
  },
  {
    id: "hours",
    title: "Hours",
    items: [
      { id: "60", label: "1 hour", short: "1h", group: "hours" },
      { id: "120", label: "2 hours", short: "2h", group: "hours" },
      { id: "180", label: "3 hours", short: "3h", group: "hours" },
      { id: "240", label: "4 hours", short: "4h", group: "hours" },
    ],
  },
  {
    id: "days",
    title: "Days",
    items: [
      { id: "1D", label: "1 day", short: "D", group: "days" },
      { id: "2D", label: "2 days", short: "2D", group: "days" },
      { id: "3D", label: "3 days", short: "3D", group: "days" },
    ],
  },
  {
    id: "weeks",
    title: "Weeks",
    items: [{ id: "1W", label: "1 week", short: "W", group: "weeks" }],
  },
  {
    id: "months",
    title: "Months",
    items: [
      { id: "1M", label: "1 month", short: "M", group: "months" },
      { id: "3M", label: "3 months", short: "3M", group: "months" },
      { id: "6M", label: "6 months", short: "6M", group: "months" },
      { id: "12M", label: "12 months", short: "12M", group: "months" },
    ],
  },
  {
    id: "range",
    title: "Range",
    items: [
      { id: "1R", label: "1 range", short: "1R", group: "range" },
      { id: "10R", label: "10 range", short: "10R", group: "range" },
      { id: "100R", label: "100 range", short: "100R", group: "range" },
      { id: "1000R", label: "1000 range", short: "1000R", group: "range" },
    ],
  },
];

export const INTERVALS: IntervalItem[] = INTERVAL_GROUPS.flatMap((group) => group.items);

export const DEFAULT_FAVORITE_INTERVALS: Interval[] = ["1", "5", "15", "30", "60", "240", "1D", "1W", "1M"];

export function intervalMeta(id: Interval): IntervalItem {
  return (
    INTERVALS.find((item) => item.id === id) ?? {
      id,
      label: intervalLabel(id),
      short: intervalShort(id),
      group: "custom",
    }
  );
}

export const QUICK_INTERVALS: Interval[] = DEFAULT_FAVORITE_INTERVALS;

export const CHART_TYPES: { id: ChartType; label: string; group: string }[] = [
  { id: "candle", label: "Candles", group: "Time-based" },
  { id: "hollow", label: "Hollow candles", group: "Time-based" },
  { id: "volcandle", label: "Volume candles", group: "Time-based" },
  { id: "bar", label: "Bars", group: "Time-based" },
  { id: "line", label: "Line", group: "Time-based" },
  { id: "linemarkers", label: "Line with markers", group: "Time-based" },
  { id: "stepline", label: "Step line", group: "Time-based" },
  { id: "area", label: "Area", group: "Time-based" },
  { id: "hlcarea", label: "HLC area", group: "Time-based" },
  { id: "baseline", label: "Baseline", group: "Time-based" },
  { id: "columns", label: "Columns", group: "Time-based" },
  { id: "highlow", label: "High-low", group: "Time-based" },
  { id: "heikin", label: "Heikin Ashi", group: "Alternative" },
  { id: "renko", label: "Renko", group: "Alternative" },
  { id: "linebreak", label: "Line Break", group: "Alternative" },
  { id: "kagi", label: "Kagi", group: "Alternative" },
  { id: "pnf", label: "Point and Figure", group: "Alternative" },
  { id: "rangechart", label: "Range", group: "Alternative" },
  { id: "volfoot", label: "Volume footprint", group: "Advanced" },
  { id: "tpo", label: "Time Price Opportunity", group: "Advanced" },
  { id: "sessionvp", label: "Session volume profile chart", group: "Advanced" },
];

export type IndicatorTab = "technicals" | "financials" | "community" | "invite" | "patterns";

export type IndicatorRole = "indicator" | "strategy" | "metric" | "pattern" | "script";

export type IndicatorCatalogEntry = {
  id: string;
  label: string;
  group: string;
  tab: IndicatorTab;
  role: IndicatorRole;
  kind?: IndicatorKind;
  /** Pattern tools that can be armed from the dialog. */
  tool?: Tool;
  author?: string;
};

export const INDICATOR_TABS: { id: IndicatorTab; label: string }[] = [
  { id: "technicals", label: "Technicals" },
  { id: "financials", label: "Financials" },
  { id: "community", label: "Community" },
  { id: "invite", label: "Invite-only" },
  { id: "patterns", label: "Patterns" },
];

export const INDICATOR_ROLE_FILTERS: { id: "all" | IndicatorRole; label: string }[] = [
  { id: "all", label: "All" },
  { id: "indicator", label: "Indicators" },
  { id: "strategy", label: "Strategies" },
  { id: "metric", label: "Metrics" },
  { id: "pattern", label: "Patterns" },
  { id: "script", label: "Scripts" },
];

export const INDICATOR_CATALOG: IndicatorCatalogEntry[] = [
  // Built-in technicals (runnable)
  { id: "sma", kind: "sma", label: "Moving Average", group: "Trend", tab: "technicals", role: "indicator" },
  { id: "ema", kind: "ema", label: "Moving Average Exponential", group: "Trend", tab: "technicals", role: "indicator" },
  { id: "wma", kind: "wma", label: "Moving Average Weighted", group: "Trend", tab: "technicals", role: "indicator" },
  { id: "bb", kind: "bb", label: "Bollinger Bands", group: "Trend", tab: "technicals", role: "indicator" },
  { id: "vwap", kind: "vwap", label: "VWAP", group: "Volume", tab: "technicals", role: "indicator" },
  { id: "vol", kind: "vol", label: "Volume", group: "Volume", tab: "technicals", role: "indicator" },
  { id: "rsi", kind: "rsi", label: "Relative Strength Index", group: "Oscillators", tab: "technicals", role: "indicator" },
  { id: "macd", kind: "macd", label: "MACD", group: "Oscillators", tab: "technicals", role: "indicator" },
  { id: "stoch", kind: "stoch", label: "Stochastic", group: "Oscillators", tab: "technicals", role: "indicator" },
  { id: "atr", kind: "atr", label: "Average True Range", group: "Volatility", tab: "technicals", role: "indicator" },
  // Built-in technicals catalog density (preview until engine support)
  { id: "tech:smma", label: "Moving Average Smoothed", group: "Trend", tab: "technicals", role: "indicator" },
  { id: "tech:vwma", label: "Moving Average Volume Weighted", group: "Trend", tab: "technicals", role: "indicator" },
  { id: "tech:hma", label: "Hull Moving Average", group: "Trend", tab: "technicals", role: "indicator" },
  { id: "tech:ichimoku", label: "Ichimoku Cloud", group: "Trend", tab: "technicals", role: "indicator" },
  { id: "tech:psar", label: "Parabolic SAR", group: "Trend", tab: "technicals", role: "indicator" },
  { id: "tech:supertrend", label: "Supertrend", group: "Trend", tab: "technicals", role: "indicator" },
  { id: "tech:adx", label: "Average Directional Index", group: "Trend", tab: "technicals", role: "indicator" },
  { id: "tech:stochrsi", label: "Stochastic RSI", group: "Oscillators", tab: "technicals", role: "indicator" },
  { id: "tech:cci", label: "Commodity Channel Index", group: "Oscillators", tab: "technicals", role: "indicator" },
  { id: "tech:willr", label: "Williams %R", group: "Oscillators", tab: "technicals", role: "indicator" },
  { id: "tech:obv", label: "On Balance Volume", group: "Volume", tab: "technicals", role: "indicator" },
  { id: "tech:cmf", label: "Chaikin Money Flow", group: "Volume", tab: "technicals", role: "indicator" },
  { id: "tech:donchian", label: "Donchian Channels", group: "Volatility", tab: "technicals", role: "indicator" },
  { id: "tech:keltner", label: "Keltner Channels", group: "Volatility", tab: "technicals", role: "indicator" },
  { id: "tech:pivot", label: "Pivot Points Standard", group: "Levels", tab: "technicals", role: "indicator" },
  // Strategies
  { id: "strat:ma-cross", label: "MA Cross Strategy", group: "Strategies", tab: "technicals", role: "strategy" },
  { id: "strat:rsi-revert", label: "RSI Reversion Strategy", group: "Strategies", tab: "technicals", role: "strategy" },
  { id: "strat:macd-trend", label: "MACD Trend Strategy", group: "Strategies", tab: "technicals", role: "strategy" },
  { id: "strat:breakout", label: "Donchian Breakout Strategy", group: "Strategies", tab: "technicals", role: "strategy" },
  // Financials (metrics)
  { id: "fin:eps", label: "Earnings Per Share", group: "Income Statement", tab: "financials", role: "metric" },
  { id: "fin:revenue", label: "Total Revenue", group: "Income Statement", tab: "financials", role: "metric" },
  { id: "fin:net-income", label: "Net Income", group: "Income Statement", tab: "financials", role: "metric" },
  { id: "fin:ebitda", label: "EBITDA", group: "Income Statement", tab: "financials", role: "metric" },
  { id: "fin:pe", label: "Price to Earnings Ratio", group: "Valuation", tab: "financials", role: "metric" },
  { id: "fin:pb", label: "Price to Book Ratio", group: "Valuation", tab: "financials", role: "metric" },
  { id: "fin:ps", label: "Price to Sales Ratio", group: "Valuation", tab: "financials", role: "metric" },
  { id: "fin:debt", label: "Total Debt", group: "Balance Sheet", tab: "financials", role: "metric" },
  { id: "fin:cash", label: "Cash and Equivalents", group: "Balance Sheet", tab: "financials", role: "metric" },
  { id: "fin:assets", label: "Total Assets", group: "Balance Sheet", tab: "financials", role: "metric" },
  { id: "fin:margin", label: "Profit Margin", group: "Ratios", tab: "financials", role: "metric" },
  { id: "fin:roe", label: "Return on Equity", group: "Ratios", tab: "financials", role: "metric" },
  { id: "fin:roa", label: "Return on Assets", group: "Ratios", tab: "financials", role: "metric" },
  // Community scripts
  { id: "com:rsi-div", label: "RSI Divergence Indicator", group: "Oscillators", tab: "community", role: "script", author: "ChartMaster42" },
  { id: "com:supertrend-pro", label: "Supertrend Pro+", group: "Trend", tab: "community", role: "script", author: "AlphaSignals" },
  { id: "com:vol-profile", label: "Volume Profile Lite", group: "Volume", tab: "community", role: "script", author: "QuantForge" },
  { id: "com:session-map", label: "Session Map Overlay", group: "Time", tab: "community", role: "script", author: "DayTraderX" },
  { id: "com:smart-money", label: "Smart Money Concepts", group: "Trend", tab: "community", role: "script", author: "ICTFan" },
  { id: "com:order-blocks", label: "Order Blocks Detector", group: "Trend", tab: "community", role: "script", author: "SMCTools" },
  { id: "com:liquidity-hunt", label: "Liquidity Hunt Zones", group: "Levels", tab: "community", role: "script", author: "FlowDesk" },
  // Invite-only
  { id: "inv:alpha", label: "Alpha Momentum Suite", group: "Invite-only", tab: "invite", role: "script", author: "PrivateLab" },
  { id: "inv:inst-flow", label: "Institutional Flow Tracker", group: "Invite-only", tab: "invite", role: "script", author: "HedgeDesk" },
  { id: "inv:dark-pool", label: "Dark Pool Heatmap", group: "Invite-only", tab: "invite", role: "script", author: "VaultSignals" },
  // Patterns → drawing tools
  { id: "pat:hs", label: "Head and Shoulders", group: "Reversal", tab: "patterns", role: "pattern", tool: "headshoulders" },
  { id: "pat:xabcd", label: "XABCD Pattern", group: "Harmonic", tab: "patterns", role: "pattern", tool: "xabcd" },
  { id: "pat:cypher", label: "Cypher Pattern", group: "Harmonic", tab: "patterns", role: "pattern", tool: "cypher" },
  { id: "pat:abcd", label: "ABCD Pattern", group: "Harmonic", tab: "patterns", role: "pattern", tool: "abcd" },
  { id: "pat:triangle", label: "Triangle Pattern", group: "Continuation", tab: "patterns", role: "pattern", tool: "trianglepattern" },
  { id: "pat:three-drives", label: "Three Drives Pattern", group: "Harmonic", tab: "patterns", role: "pattern", tool: "threedrives" },
  { id: "pat:elliott-impulse", label: "Elliott Impulse Wave (12345)", group: "Elliott", tab: "patterns", role: "pattern", tool: "elliottimpulse" },
  { id: "pat:elliott-abc", label: "Elliott Correction Wave (ABC)", group: "Elliott", tab: "patterns", role: "pattern", tool: "elliottcorrection" },
  { id: "pat:double-top", label: "Double Top / Bottom", group: "Reversal", tab: "patterns", role: "pattern" },
  { id: "pat:flag", label: "Bull / Bear Flag", group: "Continuation", tab: "patterns", role: "pattern" },
  { id: "pat:wedge", label: "Rising / Falling Wedge", group: "Reversal", tab: "patterns", role: "pattern" },
];

export const INDICATORS = INDICATOR_CATALOG.filter((item): item is IndicatorCatalogEntry & { kind: IndicatorKind } => !!item.kind);

export function indicatorTitle(kind: IndicatorKind): string {
  return INDICATOR_CATALOG.find((i) => i.kind === kind)?.label ?? kind.toUpperCase();
}

export function catalogEntry(id: string): IndicatorCatalogEntry | undefined {
  return INDICATOR_CATALOG.find((item) => item.id === id);
}

export function indicatorInputs(kind: IndicatorKind): { index: number; label: string }[] {
  if (kind === "sma" || kind === "ema" || kind === "wma" || kind === "rsi" || kind === "atr") return [{ index: 0, label: "Length" }];
  if (kind === "bb") return [
    { index: 0, label: "Length" },
    { index: 1, label: "StdDev" },
  ];
  if (kind === "stoch") return [
    { index: 0, label: "%K" },
    { index: 1, label: "%D" },
  ];
  if (kind === "macd") return [
    { index: 0, label: "Fast" },
    { index: 1, label: "Slow" },
    { index: 2, label: "Signal" },
  ];
  return [];
}

export type ToolItem = {
  id: string;
  label: string;
  draw: Tool;
  glyph?: string;
};

export type ToolSection = {
  id: string;
  title?: string;
  tools: ToolItem[];
};

export type ToolGroup = {
  id: string;
  title: string;
  sections: ToolSection[];
};

export function allToolItems(): ToolItem[] {
  return TOOL_GROUPS.flatMap((g) => g.sections.flatMap((s) => s.tools));
}

export function toolLabelForDraw(draw: Tool): string {
  const hit = allToolItems().find((t) => t.draw === draw);
  return hit?.label ?? String(draw);
}

export const TOOL_GROUPS: ToolGroup[] = [
  {
    id: "cursors",
    title: "Cursors",
    sections: [
      {
        id: "cursor-main",
        tools: [
          { id: "cross", label: "Cross", draw: "crosshair" },
          { id: "dot", label: "Dot", draw: "dot" },
          { id: "arrowCursor", label: "Arrow", draw: "cursor" },
          { id: "demonstration", label: "Demonstration", draw: "demonstration" },
          { id: "magic", label: "Magic", draw: "magic" },
        ],
      },
      {
        id: "cursor-other",
        tools: [{ id: "eraser", label: "Eraser", draw: "eraser" }],
      },
    ],
  },
  {
    id: "trend",
    title: "Trend Line Tools",
    sections: [
      {
        id: "trend-lines",
        title: "Lines",
        tools: [
          { id: "trendLine", label: "Trendline", draw: "trend" },
          { id: "ray", label: "Ray", draw: "ray" },
          { id: "infoLine", label: "Info line", draw: "info" },
          { id: "extendedLine", label: "Extended line", draw: "extended" },
          { id: "trendAngle", label: "Trend angle", draw: "trendangle" },
          { id: "hline", label: "Horizontal line", draw: "hline" },
          { id: "horzRay", label: "Horizontal ray", draw: "horzray" },
          { id: "vline", label: "Vertical line", draw: "vline" },
          { id: "crossLine", label: "Crossline", draw: "crossline" },
        ],
      },
      {
        id: "trend-channels",
        title: "Channels",
        tools: [
          { id: "parallel", label: "Parallel channel", draw: "parallel" },
          { id: "regression", label: "Regression trend", draw: "regression" },
          { id: "flatTop", label: "Flat top / bottom", draw: "flattop" },
          { id: "disjoint", label: "Disjoint channel", draw: "disjoint" },
        ],
      },
      {
        id: "trend-pitchforks",
        title: "Pitchforks",
        tools: [
          { id: "pitchfork", label: "Pitchfork", draw: "pitchfork" },
          { id: "schiff", label: "Schiff pitchfork", draw: "schiff" },
          { id: "modSchiff", label: "Modified Schiff pitchfork", draw: "modschiff" },
          { id: "insidePitchfork", label: "Inside pitchfork", draw: "insidepitchfork" },
        ],
      },
    ],
  },
  {
    id: "gann",
    title: "Gann and Fibonacci Tools",
    sections: [
      {
        id: "fib-section",
        title: "Fibonacci",
        tools: [
          { id: "fibRetracement", label: "Fib retracement", draw: "fib" },
          { id: "fibExtension", label: "Trend-based fib extension", draw: "fibext" },
          { id: "fibChannel", label: "Fib channel", draw: "fibchannel" },
          { id: "fibTimeZone", label: "Fib time zone", draw: "fibtimezone" },
          { id: "fibFan", label: "Fib speed resistance fan", draw: "fibfan" },
          { id: "fibTime", label: "Trend-based fib time", draw: "fibtime" },
          { id: "fibCircles", label: "Fib circles", draw: "fibcircles" },
          { id: "fibSpiral", label: "Fib spiral", draw: "fibspiral" },
          { id: "fibArcs", label: "Fib speed resistance arcs", draw: "fibarcs" },
          { id: "fibWedge", label: "Fib wedge", draw: "fibwedge" },
          { id: "pitchfan", label: "Pitchfan", draw: "pitchfan" },
        ],
      },
      {
        id: "gann-section",
        title: "Gann",
        tools: [
          { id: "gannBox", label: "Gann box", draw: "gannbox" },
          { id: "gannSquareFixed", label: "Gann square fixed", draw: "gannsquarefixed" },
          { id: "gannSquare", label: "Gann square", draw: "gannsquare" },
          { id: "gannFan", label: "Gann fan", draw: "gannfan" },
        ],
      },
    ],
  },
  {
    id: "patterns",
    title: "Patterns",
    sections: [
      {
        id: "patterns-main",
        tools: [
          { id: "xabcd", label: "XABCD Pattern", draw: "xabcd" },
          { id: "cypher", label: "Cypher Pattern", draw: "cypher" },
          { id: "headShoulders", label: "Head and Shoulders", draw: "headshoulders" },
          { id: "abcd", label: "ABCD Pattern", draw: "abcd" },
          { id: "trianglePattern", label: "Triangle Pattern", draw: "trianglepattern" },
          { id: "threeDrives", label: "Three Drives Pattern", draw: "threedrives" },
          { id: "elliottImpulse", label: "Elliott Impulse Wave (12345)", draw: "elliottimpulse" },
          { id: "elliottCorrection", label: "Elliott Correction Wave (ABC)", draw: "elliottcorrection" },
          { id: "elliottTriangle", label: "Elliott Triangle Wave (ABCDE)", draw: "elliotttriangle" },
          { id: "elliottDouble", label: "Elliott Double Combo Wave (WXY)", draw: "elliottdouble" },
          { id: "elliottTriple", label: "Elliott Triple Combo Wave (WXYXZ)", draw: "elliotttriple" },
          { id: "cyclicLines", label: "Cyclic Lines", draw: "cycliclines" },
          { id: "timeCycles", label: "Time Cycles", draw: "timecycles" },
          { id: "sineLine", label: "Sine Line", draw: "sineline" },
        ],
      },
    ],
  },
  {
    id: "prediction",
    title: "Prediction and Measurement Tools",
    sections: [
      {
        id: "prediction-forecasting",
        title: "Forecasting",
        tools: [
          { id: "long", label: "Long position", draw: "long" },
          { id: "short", label: "Short position", draw: "short" },
          { id: "forecast", label: "Position forecast", draw: "forecast" },
          { id: "barsPattern", label: "Bars pattern", draw: "barspattern" },
          { id: "ghostFeed", label: "Ghost feed", draw: "ghostfeed" },
          { id: "projection", label: "Projection", draw: "projection" },
          { id: "sector", label: "Sector", draw: "sector" },
        ],
      },
      {
        id: "prediction-volume",
        title: "Volume-Based",
        tools: [
          { id: "anchoredVwap", label: "Anchored VWAP", draw: "anchoredvwap" },
          { id: "volProfile", label: "Fixed range volume profile", draw: "volprofile" },
          { id: "anchoredVolProfile", label: "Anchored volume profile", draw: "anchoredvolprofile" },
        ],
      },
      {
        id: "prediction-measurers",
        title: "Measurers",
        tools: [
          { id: "priceRange", label: "Price range", draw: "pricerange" },
          { id: "dateRange", label: "Date range", draw: "daterange" },
          { id: "datePriceRange", label: "Date and price range", draw: "datepricerange" },
        ],
      },
    ],
  },
  {
    id: "shapes",
    title: "Geometric Shapes",
    sections: [
      {
        id: "shapes-brushes",
        title: "Brushes",
        tools: [
          { id: "brush", label: "Brush", draw: "brush" },
          { id: "highlighter", label: "Highlighter", draw: "highlighter" },
        ],
      },
      {
        id: "shapes-arrows",
        title: "Arrows",
        tools: [
          { id: "arrowMarker", label: "Arrow marker", draw: "arrowmarker" },
          { id: "arrowMarkLeft", label: "Arrow mark left", draw: "arrowmarkleft" },
          { id: "arrowMarkRight", label: "Arrow mark right", draw: "arrowmarkright" },
          { id: "arrow", label: "Arrow", draw: "arrow" },
          { id: "arrowUp", label: "Arrow mark up", draw: "arrowup" },
          { id: "arrowDown", label: "Arrow mark down", draw: "arrowdown" },
        ],
      },
      {
        id: "shapes-main",
        title: "Shapes",
        tools: [
          { id: "rectangle", label: "Rectangle", draw: "rect" },
          { id: "rotatedRect", label: "Rotated rectangle", draw: "rotatedrect" },
          { id: "path", label: "Path", draw: "path" },
          { id: "circle", label: "Circle", draw: "circle" },
          { id: "ellipse", label: "Ellipse", draw: "ellipse" },
          { id: "polyline", label: "Polyline", draw: "polyline" },
          { id: "triangle", label: "Triangle", draw: "triangle" },
          { id: "arc", label: "Arc", draw: "arc" },
          { id: "curve", label: "Curve", draw: "curve" },
          { id: "doubleCurve", label: "Double curve", draw: "doublecurve" },
        ],
      },
    ],
  },
  {
    id: "annotation",
    title: "Annotation Tools",
    sections: [
      {
        id: "annotation-main",
        tools: [
          { id: "text", label: "Text", draw: "text" },
          { id: "anchoredText", label: "Anchored text", draw: "anchoredtext" },
          { id: "note", label: "Note", draw: "note" },
          { id: "anchoredNote", label: "Anchored note", draw: "anchorednote" },
          { id: "signpost", label: "Signpost", draw: "signpost" },
          { id: "callout", label: "Callout", draw: "callout" },
          { id: "comment", label: "Comment", draw: "comment" },
          { id: "priceLabel", label: "Price label", draw: "pricelabel" },
          { id: "priceNote", label: "Price note", draw: "pricenote" },
          { id: "flagMark", label: "Flag mark", draw: "flagmark" },
          { id: "table", label: "Table", draw: "table" },
          { id: "image", label: "Image", draw: "image" },
        ],
      },
    ],
  },
  {
    id: "icons",
    title: "Icons",
    sections: [
      {
        id: "icons-emoji",
        title: "Emoji",
        tools: [
          { id: "emojiSmile", label: "Smile", draw: "sticker", glyph: "😀" },
          { id: "emojiFire", label: "Fire", draw: "sticker", glyph: "🔥" },
          { id: "emojiRocket", label: "Rocket", draw: "sticker", glyph: "🚀" },
          { id: "emojiChart", label: "Chart up", draw: "sticker", glyph: "📈" },
          { id: "emojiDown", label: "Chart down", draw: "sticker", glyph: "📉" },
          { id: "emojiMoney", label: "Money", draw: "sticker", glyph: "💰" },
          { id: "emojiGem", label: "Gem", draw: "sticker", glyph: "💎" },
          { id: "emojiEyes", label: "Eyes", draw: "sticker", glyph: "👀" },
          { id: "emojiThink", label: "Think", draw: "sticker", glyph: "🤔" },
          { id: "emojiParty", label: "Party", draw: "sticker", glyph: "🥳" },
          { id: "emojiWarn", label: "Warning", draw: "sticker", glyph: "⚠️" },
          { id: "emojiCheck", label: "Check", draw: "sticker", glyph: "✅" },
        ],
      },
      {
        id: "icons-stickers",
        title: "Stickers",
        tools: [
          { id: "stickerBull", label: "Bull", draw: "sticker", glyph: "🐂" },
          { id: "stickerBear", label: "Bear", draw: "sticker", glyph: "🐻" },
          { id: "stickerTarget", label: "Target", draw: "sticker", glyph: "🎯" },
          { id: "stickerIdea", label: "Idea", draw: "sticker", glyph: "💡" },
          { id: "stickerPin", label: "Pin", draw: "sticker", glyph: "📌" },
          { id: "stickerFlag", label: "Flag", draw: "sticker", glyph: "🚩" },
          { id: "stickerStar", label: "Star", draw: "sticker", glyph: "⭐" },
          { id: "stickerLightning", label: "Lightning", draw: "sticker", glyph: "⚡" },
          { id: "stickerLock", label: "Lock", draw: "sticker", glyph: "🔒" },
          { id: "stickerKey", label: "Key", draw: "sticker", glyph: "🔑" },
        ],
      },
      {
        id: "icons-library",
        title: "Icons library",
        tools: [
          { id: "iconStar", label: "Star", draw: "sticker", glyph: "★" },
          { id: "iconUp", label: "Up", draw: "sticker", glyph: "▲" },
          { id: "iconDown", label: "Down", draw: "sticker", glyph: "▼" },
          { id: "iconPlus", label: "Plus", draw: "sticker", glyph: "＋" },
          { id: "iconMinus", label: "Minus", draw: "sticker", glyph: "－" },
          { id: "iconDot", label: "Dot", draw: "sticker", glyph: "●" },
          { id: "iconSquare", label: "Square", draw: "sticker", glyph: "■" },
          { id: "iconDiamond", label: "Diamond", draw: "sticker", glyph: "◆" },
          { id: "iconArrow", label: "Arrow", draw: "sticker", glyph: "➤" },
          { id: "iconCross", label: "Cross", draw: "sticker", glyph: "✕" },
        ],
      },
    ],
  },
];
