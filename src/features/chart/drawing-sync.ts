/**
 * Cross-pane drawing sync (TradingView multi-chart): drawings share absolute
 * time + price, so a trend line on 4H appears on the matching 15m candles.
 * Supports all Charting Library drawing tools (not just trend lines).
 */

import type { EntityId, IChartWidgetApi } from "@/infrastructure/tradingview";

export interface ShapeSnapshot {
  readonly shape: string;
  readonly points: ReadonlyArray<{ time: number; price: number }>;
  readonly overrides: Record<string, unknown>;
  readonly text?: string;
}

/** Shapes that Charting Library creates with a single point via createShape. */
const SINGLE_POINT_SHAPES = new Set([
  "horizontal_line",
  "vertical_line",
  "cross_line",
  "horizontal_ray",
  "arrow_up",
  "arrow_down",
  "flag",
  "icon",
  "emoji",
  "sticker",
  "text",
  "anchored_text",
  "note",
  "anchored_note",
  "price_label",
  "price_note",
  "long_position",
  "short_position",
  "signpost",
  "comment",
]);

/** Map Charting Library entity / LineTool names → createMultipointShape ids. */
const SHAPE_ALIASES: Record<string, string> = {
  trend_line: "trend_line",
  trendline: "trend_line",
  linetooltrendline: "trend_line",
  ray: "ray",
  linetoolray: "ray",
  info_line: "info_line",
  infoline: "info_line",
  linetoolinfoline: "info_line",
  trend_angle: "trend_angle",
  trendangle: "trend_angle",
  linetooltrendangle: "trend_angle",
  arrow: "arrow",
  linetoolarrow: "arrow",
  extended: "extended",
  linetoolextended: "extended",
  horizontal_line: "horizontal_line",
  horz_line: "horizontal_line",
  horzline: "horizontal_line",
  linetoolhorzline: "horizontal_line",
  horizontal_ray: "horizontal_ray",
  horz_ray: "horizontal_ray",
  horzray: "horizontal_ray",
  linetoolhorzray: "horizontal_ray",
  vertical_line: "vertical_line",
  vert_line: "vertical_line",
  vertline: "vertical_line",
  linetoolvertline: "vertical_line",
  cross_line: "cross_line",
  crossline: "cross_line",
  linetoolcrossline: "cross_line",
  parallel_channel: "parallel_channel",
  parallelchannel: "parallel_channel",
  linetoolparallelchannel: "parallel_channel",
  flat_bottom: "flat_bottom",
  flattopbottom: "flat_bottom",
  linetoolflatbottom: "flat_bottom",
  disjoint_angle: "disjoint_angle",
  disjointangle: "disjoint_angle",
  linetooldisjointangle: "disjoint_angle",
  regression_trend: "regression_trend",
  regressiontrend: "regression_trend",
  linetoolregressiontrend: "regression_trend",
  rectangle: "rectangle",
  linetoolrectangle: "rectangle",
  rotated_rectangle: "rotated_rectangle",
  rotatedrectangle: "rotated_rectangle",
  linetoolrotatedrectangle: "rotated_rectangle",
  ellipse: "ellipse",
  linetoolellipse: "ellipse",
  circle: "circle",
  linetoolcircle: "circle",
  triangle: "triangle",
  linetooltriangle: "triangle",
  polyline: "polyline",
  linetoolpolyline: "polyline",
  path: "path",
  linetoolpath: "path",
  arc: "arc",
  linetoolarc: "arc",
  fib_retracement: "fib_retracement",
  fibretracement: "fib_retracement",
  linetoolfibretracement: "fib_retracement",
  fib_trend_ext: "fib_trend_ext",
  fib_extension: "fib_trend_ext",
  fibtrendext: "fib_trend_ext",
  linetoolfibtrendext: "fib_trend_ext",
  fib_channel: "fib_channel",
  fibchannel: "fib_channel",
  linetoolfibchannel: "fib_channel",
  fib_timezone: "fib_timezone",
  fibtimezone: "fib_timezone",
  linetoolfibtimezone: "fib_timezone",
  fib_speed_resist_fan: "fib_speed_resist_fan",
  fibspeedresistfan: "fib_speed_resist_fan",
  linetoolfibspeedresistfan: "fib_speed_resist_fan",
  fib_speed_res_fan: "fib_speed_resist_fan",
  fib_circles: "fib_circles",
  fibcircles: "fib_circles",
  linetoolfibcircles: "fib_circles",
  fib_spiral: "fib_spiral",
  fibspiral: "fib_spiral",
  pitchfan: "pitchfan",
  linetoolpitchfan: "pitchfan",
  pitchfork: "pitchfork",
  linetoolpitchfork: "pitchfork",
  schiffpitchfork: "schiff_pitchfork",
  schiff_pitchfork: "schiff_pitchfork",
  linetoolschiffpitchfork: "schiff_pitchfork",
  gannbox: "gannbox",
  linetoolgannbox: "gannbox",
  gannbox_square: "gannbox_square",
  gannboxsquare: "gannbox_square",
  gannbox_fixed: "gannbox_fixed",
  gannboxfixed: "gannbox_fixed",
  gannfan: "gann_fan",
  gann_fan: "gann_fan",
  linetoolgannfan: "gann_fan",
  gannsquare: "gannbox_square",
  long_position: "long_position",
  longposition: "long_position",
  linetoollongposition: "long_position",
  short_position: "short_position",
  shortposition: "short_position",
  linetoolshortposition: "short_position",
  forecast: "forecast",
  linetoolforecast: "forecast",
  price_range: "price_range",
  pricerange: "price_range",
  linetoolpricerange: "price_range",
  date_range: "date_range",
  daterange: "date_range",
  linetooldaterange: "date_range",
  date_and_price_range: "date_and_price_range",
  dateandpricerange: "date_and_price_range",
  brush: "brush",
  linetoolbrush: "brush",
  highlighter: "highlighter",
  linetoolhighlighter: "highlighter",
  text: "text",
  linetooltext: "text",
  anchored_text: "anchored_text",
  anchoredtext: "anchored_text",
  note: "note",
  linetoolnote: "note",
  callout: "callout",
  linetoolcallout: "callout",
  balloon: "balloon",
  price_label: "price_label",
  pricelabel: "price_label",
  price_note: "price_note",
  pricenote: "price_note",
  arrow_mark_up: "arrow_up",
  arrowmarkup: "arrow_up",
  arrow_mark_down: "arrow_down",
  arrowmarkdown: "arrow_down",
  arrow_up: "arrow_up",
  arrow_down: "arrow_down",
  flag: "flag",
  linetoolflag: "flag",
  xabcd_pattern: "xabcd_pattern",
  xabcdpattern: "xabcd_pattern",
  linetoolxabcdpattern: "xabcd_pattern",
  abcd_pattern: "abcd_pattern",
  abcdpattern: "abcd_pattern",
  head_and_shoulders: "head_and_shoulders",
  headandshoulders: "head_and_shoulders",
  triangle_pattern: "triangle_pattern",
  trianglepattern: "triangle_pattern",
  cypher_pattern: "cypher_pattern",
  cypherpattern: "cypher_pattern",
  elliott_impulse_wave: "elliott_impulse_wave",
  elliottimpulsewave: "elliott_impulse_wave",
  elliott_triangle_wave: "elliott_triangle_wave",
  elliotttrianglewave: "elliott_triangle_wave",
  elliott_triple_combo: "elliott_triple_combo",
  elliotttriplecombo: "elliott_triple_combo",
  elliott_correction: "elliott_correction",
  elliottcorrection: "elliott_correction",
  elliott_double_combo: "elliott_double_combo",
  elliottdoublecombo: "elliott_double_combo",
  cyclic_lines: "cyclic_lines",
  cycliclines: "cyclic_lines",
  time_cycles: "time_cycles",
  timecycles: "time_cycles",
  sine_line: "sine_line",
  sineline: "sine_line",
};

export function normalizeShapeName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const key = raw
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
  if (SHAPE_ALIASES[key]) return SHAPE_ALIASES[key]!;
  const stripped = key.replace(/^linetool/, "");
  if (SHAPE_ALIASES[stripped]) return SHAPE_ALIASES[stripped]!;
  // Keep underscore form for CL createMultipointShape when unknown but plausible.
  if (/^[a-z][a-z0-9_]*$/.test(stripped) && stripped.length > 2) return stripped;
  if (/^[a-z][a-z0-9_]*$/.test(key) && key.length > 2) return key;
  return null;
}

function chartFallbackTime(chart: IChartWidgetApi): number {
  try {
    const range = chart.getVisibleRange();
    if (range && Number.isFinite(range.to)) return Math.floor(range.to);
  } catch {
    /* ignore */
  }
  return Math.floor(Date.now() / 1000);
}

function sanitizePoints(
  points: ReadonlyArray<{ time?: number; price?: number; channel?: string }>,
  fallbackTime: number,
): Array<{ time: number; price: number }> {
  const out: Array<{ time: number; price: number }> = [];
  for (const p of points) {
    const price = Number(p.price);
    if (!Number.isFinite(price)) continue;
    let time = Number(p.time);
    if (!Number.isFinite(time) || time <= 0) time = fallbackTime;
    out.push({ time: time > 1e12 ? Math.floor(time / 1000) : Math.floor(time), price });
  }
  return out;
}

/** Drop nested / volatile props that break createMultipointShape on the peer pane. */
function sanitizeOverrides(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    if (v == null) continue;
    if (typeof v === "object" && !Array.isArray(v)) continue;
    if (typeof v === "function") continue;
    if (/^(symbol|interval|state|points|intervalsVisibilities|ownerSource|currencyId|unitId|symbolSource)/i.test(k)) {
      continue;
    }
    // Skip huge numeric arrays (fib levels etc. often re-default correctly).
    if (Array.isArray(v) && v.length > 40) continue;
    out[k] = v;
  }
  return out;
}

export function readShapeSnapshot(
  chart: IChartWidgetApi,
  entityId: EntityId,
  preferredShape?: string | null,
): ShapeSnapshot | null {
  try {
    const shapeApi = chart.getShapeById(entityId);
    const fallbackTime = chartFallbackTime(chart);
    let points = sanitizePoints(
      shapeApi.getPoints() as Array<{ time?: number; price?: number }>,
      fallbackTime,
    );
    const props = (shapeApi.getProperties() ?? {}) as Record<string, unknown>;
    // Some tools (esp. horizontal line mid-create) expose price only via properties.
    if (points.length === 0) {
      const price = Number(props.price ?? props.level ?? props.linePrice);
      if (Number.isFinite(price)) {
        points = [{ time: fallbackTime, price }];
      }
    }
    if (points.length === 0) return null;

    const all = chart.getAllShapes();
    const info = all.find((s) => s.id === entityId);
    const shape =
      normalizeShapeName(preferredShape) ??
      normalizeShapeName(info?.name) ??
      normalizeShapeName(typeof props.toolName === "string" ? props.toolName : null) ??
      normalizeShapeName(typeof props.name === "string" ? props.name : null) ??
      normalizeShapeName(typeof props.statName === "string" ? props.statName : null) ??
      // Prefer ray/hline over trend_line when geometry suggests it.
      (points.length === 1
        ? "horizontal_line"
        : points.length === 2 && Math.abs(points[0]!.price - points[1]!.price) < 1e-12
          ? "horizontal_line"
          : points.length === 2 && points[0]!.time === points[1]!.time
            ? "vertical_line"
            : "trend_line");
    const text = typeof props.text === "string" ? props.text : undefined;
    return {
      shape,
      points,
      overrides: sanitizeOverrides(props),
      text,
    };
  } catch {
    return null;
  }
}

/** Snapshot every drawable on a chart (for seeding a newly opened pane). */
export function readAllShapeSnapshots(chart: IChartWidgetApi): Array<{ id: EntityId; snap: ShapeSnapshot }> {
  const out: Array<{ id: EntityId; snap: ShapeSnapshot }> = [];
  try {
    for (const info of chart.getAllShapes()) {
      const snap = readShapeSnapshot(chart, info.id, info.name);
      if (snap) out.push({ id: info.id, snap });
    }
  } catch {
    /* ignore */
  }
  return out;
}

async function tryCreate(
  chart: IChartWidgetApi,
  snap: ShapeSnapshot,
  withOverrides: boolean,
): Promise<EntityId | null> {
  const overrides = withOverrides ? (snap.overrides as never) : ({} as never);
  const isLongShort = snap.shape === "long_position" || snap.shape === "short_position";
  const useSingle =
    SINGLE_POINT_SHAPES.has(snap.shape) ||
    (snap.points.length === 1 && !snap.shape.includes("fib")) ||
    (isLongShort && snap.points.length === 1);

  if (useSingle || isLongShort) {
    const p = snap.points[0]!;
    try {
      // Long/Short position: prefer createShape with a single anchor; heavy overrides lock CL.
      const id = await chart.createShape(
        { time: p.time, price: p.price },
        {
          shape: snap.shape as never,
          text: snap.text,
          disableUndo: true,
          overrides: isLongShort ? ({} as never) : overrides,
        },
      );
      if (id) return id;
    } catch {
      /* fall through to multipoint */
    }
  }

  if (isLongShort) {
    // Avoid multipoint fallback for positions — it often freezes the chart.
    return null;
  }

  try {
    const id = await chart.createMultipointShape([...snap.points], {
      shape: snap.shape as never,
      text: snap.text,
      disableUndo: true,
      overrides,
    });
    return id ?? null;
  } catch {
    return null;
  }
}

export async function createShapeFromSnapshot(
  chart: IChartWidgetApi,
  snap: ShapeSnapshot,
): Promise<EntityId | null> {
  // First attempt with style overrides; retry bare if CL rejects them.
  const withStyle = await tryCreate(chart, snap, true);
  if (withStyle) return withStyle;
  if (Object.keys(snap.overrides).length > 0) {
    const bare = await tryCreate(chart, snap, false);
    if (bare) return bare;
  }
  // Long/short: never fall back to trend_line (causes lock / wrong tool).
  if (snap.shape === "long_position" || snap.shape === "short_position") {
    return null;
  }
  // Last resort: preserve geometry as a trend/horizontal so the peer pane still shows something.
  try {
    if (snap.points.length >= 2) {
      const id = await chart.createMultipointShape([...snap.points], {
        shape: "trend_line",
        disableUndo: true,
      });
      return id ?? null;
    }
    const p = snap.points[0]!;
    const id = await chart.createShape(
      { time: p.time, price: p.price },
      { shape: "horizontal_line", disableUndo: true },
    );
    return id ?? null;
  } catch {
    return null;
  }
}

export function applyShapeSnapshot(chart: IChartWidgetApi, entityId: EntityId, snap: ShapeSnapshot): void {
  try {
    const shapeApi = chart.getShapeById(entityId);
    shapeApi.setPoints([...snap.points]);
    if (Object.keys(snap.overrides).length > 0) {
      try {
        shapeApi.setProperties(snap.overrides);
      } catch {
        /* style mismatch — points still updated */
      }
    }
  } catch {
    /* gone */
  }
}

/** Retry reading a shape until points exist (CL often fires create before points settle). */
export async function readShapeSnapshotRetry(
  chart: IChartWidgetApi,
  entityId: EntityId,
  preferredShape?: string | null,
  attempts = 12,
  delayMs = 50,
): Promise<ShapeSnapshot | null> {
  for (let i = 0; i < attempts; i += 1) {
    const snap = readShapeSnapshot(chart, entityId, preferredShape);
    if (snap && snap.points.length > 0) return snap;
    await new Promise((r) => window.setTimeout(r, delayMs));
  }
  return readShapeSnapshot(chart, entityId, preferredShape);
}
