import type { ChartType, IndicatorKind, Interval, Tool } from "./engine/types";

export const INTERVALS: { id: Interval; label: string; short: string }[] = [
  { id: "1", label: "1 minute", short: "1m" },
  { id: "5", label: "5 minutes", short: "5m" },
  { id: "15", label: "15 minutes", short: "15m" },
  { id: "30", label: "30 minutes", short: "30m" },
  { id: "60", label: "1 hour", short: "1h" },
  { id: "120", label: "2 hours", short: "2h" },
  { id: "240", label: "4 hours", short: "4h" },
  { id: "1D", label: "1 day", short: "D" },
  { id: "1W", label: "1 week", short: "W" },
  { id: "1M", label: "1 month", short: "M" },
];

export const QUICK_INTERVALS: Interval[] = ["1", "5", "15", "30", "60", "240", "1D", "1W", "1M"];

export const CHART_TYPES: { id: ChartType; label: string }[] = [
  { id: "candle", label: "Candles" },
  { id: "hollow", label: "Hollow candles" },
  { id: "bar", label: "Bars" },
  { id: "line", label: "Line" },
  { id: "area", label: "Area" },
  { id: "baseline", label: "Baseline" },
  { id: "stepline", label: "Step line" },
  { id: "heikin", label: "Heikin Ashi" },
];

export const INDICATORS: { id: IndicatorKind; label: string; group: string }[] = [
  { id: "sma", label: "Moving Average", group: "Trend" },
  { id: "ema", label: "Moving Average Exponential", group: "Trend" },
  { id: "wma", label: "Moving Average Weighted", group: "Trend" },
  { id: "bb", label: "Bollinger Bands", group: "Trend" },
  { id: "vwap", label: "VWAP", group: "Volume" },
  { id: "vol", label: "Volume", group: "Volume" },
  { id: "rsi", label: "Relative Strength Index", group: "Oscillators" },
  { id: "macd", label: "MACD", group: "Oscillators" },
  { id: "stoch", label: "Stochastic", group: "Oscillators" },
  { id: "atr", label: "Average True Range", group: "Volatility" },
];

export type ToolItem = {
  id: string;
  label: string;
  draw: Tool;
  glyph?: string;
};

export type ToolGroup = {
  id: string;
  title: string;
  tools: ToolItem[];
};

export const TOOL_GROUPS: ToolGroup[] = [
  {
    id: "cursors",
    title: "Cursors",
    tools: [
      { id: "cross", label: "Cross", draw: "crosshair" },
      { id: "dot", label: "Dot", draw: "dot" },
      { id: "arrowCursor", label: "Arrow", draw: "cursor" },
      { id: "eraser", label: "Eraser", draw: "eraser" },
    ],
  },
  {
    id: "trend",
    title: "Trend Line Tools",
    tools: [
      { id: "trendLine", label: "Trend Line", draw: "trend" },
      { id: "ray", label: "Ray", draw: "ray" },
      { id: "infoLine", label: "Info Line", draw: "info" },
      { id: "extendedLine", label: "Extended Line", draw: "extended" },
      { id: "trendAngle", label: "Trend Angle", draw: "trendangle" },
      { id: "hline", label: "Horizontal Line", draw: "hline" },
      { id: "horzRay", label: "Horizontal Ray", draw: "horzray" },
      { id: "vline", label: "Vertical Line", draw: "vline" },
      { id: "crossLine", label: "Cross Line", draw: "crossline" },
      { id: "parallel", label: "Parallel Channel", draw: "parallel" },
      { id: "regression", label: "Regression Trend", draw: "regression" },
      { id: "flatTop", label: "Flat Top/Bottom", draw: "flattop" },
      { id: "disjoint", label: "Disjoint Channel", draw: "disjoint" },
    ],
  },
  {
    id: "gann",
    title: "Gann and Fibonacci Tools",
    tools: [
      { id: "fibRetracement", label: "Fib Retracement", draw: "fib" },
      { id: "fibExtension", label: "Trend-Based Fib Extension", draw: "fibext" },
      { id: "fibChannel", label: "Fib Channel", draw: "fibchannel" },
      { id: "fibTimeZone", label: "Fib Time Zone", draw: "fibtimezone" },
      { id: "fibFan", label: "Fib Speed Resistance Fan", draw: "fibfan" },
      { id: "fibTime", label: "Trend-Based Fib Time", draw: "fibtime" },
      { id: "fibCircles", label: "Fib Circles", draw: "fibcircles" },
      { id: "fibSpiral", label: "Fib Spiral", draw: "fibspiral" },
      { id: "fibArcs", label: "Fib Speed Resistance Arcs", draw: "fibarcs" },
      { id: "fibWedge", label: "Fib Wedge", draw: "fibwedge" },
      { id: "pitchfan", label: "Pitchfan", draw: "pitchfan" },
      { id: "pitchfork", label: "Pitchfork", draw: "pitchfork" },
      { id: "schiff", label: "Schiff Pitchfork", draw: "schiff" },
      { id: "modSchiff", label: "Modified Schiff Pitchfork", draw: "modschiff" },
      { id: "insidePitchfork", label: "Inside Pitchfork", draw: "insidepitchfork" },
      { id: "gannBox", label: "Gann Box", draw: "gannbox" },
      { id: "gannSquare", label: "Gann Square", draw: "gannsquare" },
      { id: "gannFan", label: "Gann Fan", draw: "gannfan" },
      { id: "gannSquareFixed", label: "Gann Square Fixed", draw: "gannsquarefixed" },
    ],
  },
  {
    id: "shapes",
    title: "Geometric Shapes",
    tools: [
      { id: "brush", label: "Brush", draw: "brush" },
      { id: "highlighter", label: "Highlighter", draw: "highlighter" },
      { id: "rectangle", label: "Rectangle", draw: "rect" },
      { id: "rotatedRect", label: "Rotated Rectangle", draw: "rotatedrect" },
      { id: "path", label: "Path", draw: "path" },
      { id: "circle", label: "Circle", draw: "circle" },
      { id: "ellipse", label: "Ellipse", draw: "ellipse" },
      { id: "polyline", label: "Polyline", draw: "polyline" },
      { id: "triangle", label: "Triangle", draw: "triangle" },
      { id: "arc", label: "Arc", draw: "arc" },
      { id: "curve", label: "Curve", draw: "curve" },
      { id: "doubleCurve", label: "Double Curve", draw: "doublecurve" },
      { id: "arrow", label: "Arrow", draw: "arrow" },
      { id: "arrowUp", label: "Arrow Marker Up", draw: "arrowup" },
      { id: "arrowDown", label: "Arrow Marker Down", draw: "arrowdown" },
    ],
  },
  {
    id: "annotation",
    title: "Annotation Tools",
    tools: [
      { id: "text", label: "Text", draw: "text" },
      { id: "anchoredText", label: "Anchored Text", draw: "anchoredtext" },
      { id: "note", label: "Note", draw: "note" },
      { id: "signpost", label: "Signpost", draw: "signpost" },
      { id: "callout", label: "Callout", draw: "callout" },
      { id: "comment", label: "Comment", draw: "comment" },
      { id: "priceLabel", label: "Price Label", draw: "pricelabel" },
      { id: "priceNote", label: "Price Note", draw: "pricenote" },
      { id: "arrowMarker", label: "Arrow Marker", draw: "arrowmarker" },
      { id: "flagMark", label: "Flag Mark", draw: "flagmark" },
    ],
  },
  {
    id: "patterns",
    title: "Patterns",
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
  {
    id: "prediction",
    title: "Prediction and Measurement Tools",
    tools: [
      { id: "long", label: "Long Position", draw: "long" },
      { id: "short", label: "Short Position", draw: "short" },
      { id: "forecast", label: "Forecast", draw: "forecast" },
      { id: "dateRange", label: "Date Range", draw: "daterange" },
      { id: "priceRange", label: "Price Range", draw: "pricerange" },
      { id: "datePriceRange", label: "Date and Price Range", draw: "datepricerange" },
      { id: "barsPattern", label: "Bars Pattern", draw: "barspattern" },
      { id: "ghostFeed", label: "Ghost Feed", draw: "ghostfeed" },
      { id: "projection", label: "Projection", draw: "projection" },
      { id: "anchoredVwap", label: "Anchored VWAP", draw: "anchoredvwap" },
      { id: "volProfile", label: "Fixed Range Volume Profile", draw: "volprofile" },
      { id: "anchoredVolProfile", label: "Anchored Volume Profile", draw: "anchoredvolprofile" },
    ],
  },
  {
    id: "icons",
    title: "Icons",
    tools: [
      { id: "iconStar", label: "Star", draw: "sticker", glyph: "★" },
      { id: "iconFire", label: "Fire", draw: "sticker", glyph: "🔥" },
      { id: "iconRocket", label: "Rocket", draw: "sticker", glyph: "🚀" },
      { id: "iconFlag", label: "Flag", draw: "sticker", glyph: "🚩" },
      { id: "iconCheck", label: "Check", draw: "sticker", glyph: "✅" },
      { id: "iconWarn", label: "Warning", draw: "sticker", glyph: "⚠️" },
      { id: "iconIdea", label: "Idea", draw: "sticker", glyph: "💡" },
      { id: "iconTarget", label: "Target", draw: "sticker", glyph: "🎯" },
      { id: "iconUp", label: "Up", draw: "sticker", glyph: "⬆️" },
      { id: "iconDown", label: "Down", draw: "sticker", glyph: "⬇️" },
      { id: "iconPin", label: "Pin", draw: "sticker", glyph: "📌" },
      { id: "iconMoney", label: "Money", draw: "sticker", glyph: "💰" },
    ],
  },
];
