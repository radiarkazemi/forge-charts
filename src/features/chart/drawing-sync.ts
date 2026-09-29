/**
 * Cross-pane drawing sync (TradingView multi-chart): drawings share absolute
 * time + price, so a Long Position / Fib on 4H appears with full geometry on 15m.
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
  "signpost",
  "comment",
]);

/** Position tools: createShape (1 pt + profit/stop levels) or multipoint (2–3 pts). */
const POSITION_SHAPES = new Set(["long_position", "short_position"]);

/** Never degrade these to a plain trend_line — that is the “one line” bug. */
const NO_TRENDLINE_FALLBACK = new Set([
  "long_position",
  "short_position",
  "fib_retracement",
  "fib_trend_ext",
  "fib_channel",
  "fib_timezone",
  "fib_speed_resist_fan",
  "fib_circles",
  "fib_spiral",
  "fib_speed_resist_arcs",
  "fib_trend_time",
  "parallel_channel",
  "flat_bottom",
  "disjoint_angle",
  "rectangle",
  "rotated_rectangle",
  "ellipse",
  "circle",
  "triangle",
  "gannbox",
  "gannbox_square",
  "gannbox_fixed",
  "pitchfork",
  "schiff_pitchfork",
  "pitchfan",
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
  rectangle: "rectangle",
  linetoolrectangle: "rectangle",
  rotated_rectangle: "rotated_rectangle",
  rotatedrectangle: "rotated_rectangle",
  ellipse: "ellipse",
  linetoolellipse: "ellipse",
  circle: "circle",
  linetoolcircle: "circle",
  triangle: "triangle",
  linetooltriangle: "triangle",
  polyline: "polyline",
  path: "path",
  arc: "arc",
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
  fib_speed_resist_fan: "fib_speed_resist_fan",
  fibspeedresistfan: "fib_speed_resist_fan",
  fib_circles: "fib_circles",
  fibcircles: "fib_circles",
  fib_spiral: "fib_spiral",
  pitchfan: "pitchfan",
  pitchfork: "pitchfork",
  schiff_pitchfork: "schiff_pitchfork",
  schiffpitchfork: "schiff_pitchfork",
  gannbox: "gannbox",
  gannbox_square: "gannbox_square",
  gannboxsquare: "gannbox_square",
  gannbox_fixed: "gannbox_fixed",
  gannboxfixed: "gannbox_fixed",
  gann_fan: "gann_fan",
  gannfan: "gann_fan",
  long_position: "long_position",
  longposition: "long_position",
  linetoollongposition: "long_position",
  // CL entity name is LineToolRiskRewardLong (not LineToolLongPosition).
  linetoolriskrewardlong: "long_position",
  riskrewardlong: "long_position",
  risk_reward_long: "long_position",
  short_position: "short_position",
  shortposition: "short_position",
  linetoolshortposition: "short_position",
  linetoolriskrewardshort: "short_position",
  riskrewardshort: "short_position",
  risk_reward_short: "short_position",
  forecast: "forecast",
  linetoolprediction: "forecast",
  prediction: "forecast",
  price_range: "price_range",
  pricerange: "price_range",
  linetoolpricerange: "price_range",
  date_range: "date_range",
  daterange: "date_range",
  linetooldaterange: "date_range",
  date_and_price_range: "date_and_price_range",
  dateandpricerange: "date_and_price_range",
  linetooldateandpricerange: "date_and_price_range",
  brush: "brush",
  highlighter: "highlighter",
  text: "text",
  anchored_text: "anchored_text",
  note: "note",
  callout: "callout",
  balloon: "balloon",
  price_label: "price_label",
  price_note: "price_note",
  arrow_mark_up: "arrow_up",
  arrow_mark_down: "arrow_down",
  arrow_up: "arrow_up",
  arrow_down: "arrow_down",
  flag: "flag",
  xabcd_pattern: "xabcd_pattern",
  linetool5pointspattern: "xabcd_pattern",
  "5pointspattern": "xabcd_pattern",
  abcd_pattern: "abcd_pattern",
  head_and_shoulders: "head_and_shoulders",
  headandshoulders: "head_and_shoulders",
  linetoolheadandshoulders: "head_and_shoulders",
  triangle_pattern: "triangle_pattern",
  trianglepattern: "triangle_pattern",
  cypher_pattern: "cypher_pattern",
  // Fib / Gann CL class names (getAllShapes) → createMultipointShape ids
  linetooltrendbasedfibextension: "fib_trend_ext",
  trendbasedfibextension: "fib_trend_ext",
  linetoolfibspeedresistancefan: "fib_speed_resist_fan",
  fibspeedresistancefan: "fib_speed_resist_fan",
  linetoolfibtimezone: "fib_timezone",
  linetooltrendbasedfibtime: "fib_trend_time",
  trendbasedfibtime: "fib_trend_time",
  fib_trend_time: "fib_trend_time",
  linetoolfibcircles: "fib_circles",
  linetoolfibspiral: "fib_spiral",
  linetoolfibspeedresistancearcs: "fib_speed_resist_arcs",
  fibspeedresistancearcs: "fib_speed_resist_arcs",
  fib_speed_resist_arcs: "fib_speed_resist_arcs",
  linetoolfibwedge: "fib_wedge",
  fib_wedge: "fib_wedge",
  linetoolgannsquare: "gannbox",
  gannsquare: "gannbox",
  linetoolganncomplex: "gannbox_square",
  ganncomplex: "gannbox_square",
  linetoolgannfixed: "gannbox_fixed",
  gannfixed: "gannbox_fixed",
  linetoolgannfan: "gann_fan",
  gannbox_fan: "gann_fan",
  elliott_impulse_wave: "elliott_impulse_wave",
  linetoolelliottimpulse: "elliott_impulse_wave",
  elliottimpulse: "elliott_impulse_wave",
  elliott_triangle_wave: "elliott_triangle_wave",
  linetoolelliotttriangle: "elliott_triangle_wave",
  elliott_triple_combo: "elliott_triple_combo",
  linetoolelliotttriplecombo: "elliott_triple_combo",
  elliott_correction: "elliott_correction",
  linetoolelliottcorrection: "elliott_correction",
  elliott_double_combo: "elliott_double_combo",
  linetoolelliottdoublecombo: "elliott_double_combo",
};

/** Toolbar modes that are never drawable shape ids for create*. */
const NON_SHAPE_TOOLS = new Set([
  "cursor",
  "dot",
  "eraser",
  "measure",
  "zoom",
  "zoom_in",
  "zoom_out",
]);

export function normalizeShapeName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // Preserve digits (3divers_pattern); collapse spaces/dashes; drop other junk.
  const key = raw
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
  if (!key || NON_SHAPE_TOOLS.has(key)) return null;
  if (SHAPE_ALIASES[key]) return SHAPE_ALIASES[key]!;
  const stripped = key.replace(/^linetool/, "");
  if (!stripped || NON_SHAPE_TOOLS.has(stripped)) return null;
  if (SHAPE_ALIASES[stripped]) return SHAPE_ALIASES[stripped]!;
  // Never invent unknown ids that create* will reject then degrade to trend_line.
  if (
    /^(fib_|gann|long_|short_|pitch|schiff|parallel_|rectangle|ellipse|triangle|channel)/.test(
      stripped,
    )
  ) {
    return stripped;
  }
  if (/^[a-z][a-z0-9_]*$/.test(stripped) && stripped.length > 2 && stripped.includes("_")) {
    return stripped;
  }
  if (/^[a-z][a-z0-9_]*$/.test(key) && key.length > 2 && !key.startsWith("linetool")) {
    return key;
  }
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

/**
 * Keep style + position-level props; drop nested/volatile fields that break create*.
 * profitLevel / stopLevel are required for Long/Short boxes to render fully.
 */
function sanitizeOverrides(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    if (v == null) continue;
    if (typeof v === "function") continue;
    if (/^(symbol|interval|state|points|intervalsVisibilities|ownerSource|currencyId|unitId|symbolSource)/i.test(k)) {
      continue;
    }
    // Allow flat arrays (fib level visibility etc.) but skip huge nested trees.
    if (typeof v === "object" && !Array.isArray(v)) continue;
    if (Array.isArray(v) && v.length > 80) continue;
    out[k] = v;
  }
  return out;
}

/** Minimal overrides that still recreate Long/Short TP–SL boxes. */
function positionOverrides(props: Record<string, unknown>): Record<string, unknown> {
  const keys = [
    "profitLevel",
    "stopLevel",
    "linecolor",
    "profitBackground",
    "stopBackground",
    "profitBackgroundTransparency",
    "stopBackgroundTransparency",
    "linewidth",
    "fontSize",
    "showPriceLabels",
    "showPriceRange",
    "showBarsRange",
    "showDateTimeRange",
    "showQuantity",
    "accountSize",
    "lotSize",
    "risk",
    "riskDisplayMode",
    "qty",
  ];
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (props[k] != null && typeof props[k] !== "object") out[k] = props[k];
  }
  // Defaults if CL has not settled levels yet (still show TP/SL boxes).
  if (out.profitLevel == null) out.profitLevel = 100;
  if (out.stopLevel == null) out.stopLevel = 50;
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
    if (points.length === 0) {
      const price = Number(props.price ?? props.level ?? props.linePrice);
      if (Number.isFinite(price)) {
        points = [{ time: fallbackTime, price }];
      }
    }
    if (points.length === 0) return null;

    const all = chart.getAllShapes();
    const info = all.find((s) => s.id === entityId);
    // Entity name from getAllShapes is authoritative (e.g. LineToolRiskRewardLong).
    const figureId = typeof props.figureId === "string" ? props.figureId : null;
    const fromMeta =
      normalizeShapeName(info?.name) ??
      normalizeShapeName(preferredShape) ??
      normalizeShapeName(typeof props.toolName === "string" ? props.toolName : null) ??
      normalizeShapeName(typeof props.name === "string" ? props.name : null) ??
      normalizeShapeName(typeof props.statName === "string" ? props.statName : null) ??
      normalizeShapeName(figureId);

    // Heuristic fallback only for simple lines — never invent trend_line for
    // RiskReward / Fib when the entity name failed to normalize (one-line bug).
    let shape = fromMeta;
    if (!shape) {
      if (points.length === 1) shape = "horizontal_line";
      else if (points.length === 2 && Math.abs(points[0]!.price - points[1]!.price) < 1e-12) {
        shape = "horizontal_line";
      } else if (points.length === 2 && points[0]!.time === points[1]!.time) {
        shape = "vertical_line";
      } else {
        shape = "trend_line";
      }
    }

    const text = typeof props.text === "string" ? props.text : undefined;
    const overrides = POSITION_SHAPES.has(shape)
      ? positionOverrides(props)
      : sanitizeOverrides(props);

    return { shape, points, overrides, text };
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

function minPointsForShape(shape: string): number {
  if (POSITION_SHAPES.has(shape)) return 1;
  if (shape.startsWith("fib_") || shape.includes("channel") || shape.includes("pitch")) return 2;
  if (shape.includes("pattern") || shape.includes("abcd") || shape.includes("head")) return 3;
  return 1;
}

async function tryCreate(
  chart: IChartWidgetApi,
  snap: ShapeSnapshot,
  withOverrides: boolean,
): Promise<EntityId | null> {
  const overrides = withOverrides ? (snap.overrides as never) : ({} as never);
  const isPosition = POSITION_SHAPES.has(snap.shape);

  // Long/Short: prefer createShape + profitLevel/stopLevel so TP/SL boxes render.
  if (isPosition) {
    const p = snap.points[0]!;
    try {
      const id = await chart.createShape(
        { time: p.time, price: p.price },
        {
          shape: snap.shape as never,
          text: snap.text,
          disableUndo: true,
          overrides: withOverrides ? overrides : (positionOverrides({}) as never),
        },
      );
      if (id) {
        // If we captured extra points (entry/stop/target), apply them.
        if (snap.points.length >= 2) {
          try {
            chart.getShapeById(id).setPoints([...snap.points]);
          } catch {
            /* keep default levels */
          }
        }
        return id;
      }
    } catch {
      /* try multipoint below */
    }
    if (snap.points.length >= 2) {
      try {
        const id = await chart.createMultipointShape([...snap.points], {
          shape: snap.shape as never,
          text: snap.text,
          disableUndo: true,
          overrides,
        });
        if (id) return id;
      } catch {
        /* ignore */
      }
    }
    return null;
  }

  const useSingle =
    SINGLE_POINT_SHAPES.has(snap.shape) || (snap.points.length === 1 && !snap.shape.includes("fib"));

  if (useSingle) {
    const p = snap.points[0]!;
    try {
      const id = await chart.createShape(
        { time: p.time, price: p.price },
        {
          shape: snap.shape as never,
          text: snap.text,
          disableUndo: true,
          overrides,
        },
      );
      if (id) return id;
    } catch {
      /* fall through */
    }
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
  if (snap.points.length < minPointsForShape(snap.shape)) return null;

  const withStyle = await tryCreate(chart, snap, true);
  if (withStyle) return withStyle;

  if (Object.keys(snap.overrides).length > 0) {
    const bare = await tryCreate(chart, snap, false);
    if (bare) return bare;
  }

  // Never collapse Fib / Long-Short / channels into a single trend line.
  if (NO_TRENDLINE_FALLBACK.has(snap.shape) || snap.shape.startsWith("fib_")) {
    return null;
  }

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
  attempts = 16,
  delayMs = 70,
): Promise<ShapeSnapshot | null> {
  let last: ShapeSnapshot | null = null;
  for (let i = 0; i < attempts; i += 1) {
    const snap = readShapeSnapshot(chart, entityId, preferredShape);
    last = snap;
    if (!snap) {
      await new Promise((r) => window.setTimeout(r, delayMs));
      continue;
    }
    const need = minPointsForShape(snap.shape);
    // Positions: wait for profit/stop levels when possible.
    if (POSITION_SHAPES.has(snap.shape)) {
      const hasLevels =
        snap.overrides.profitLevel != null && snap.overrides.stopLevel != null;
      if (snap.points.length >= need && (hasLevels || i >= 4)) return snap;
    } else if (snap.points.length >= need) {
      return snap;
    }
    await new Promise((r) => window.setTimeout(r, delayMs));
  }
  return last ?? readShapeSnapshot(chart, entityId, preferredShape);
}
