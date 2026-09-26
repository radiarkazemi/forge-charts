/**
 * Cross-pane drawing sync (TradingView multi-chart): drawings share absolute
 * time + price, so a trend line on 4H appears on the matching 15m candles.
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
  trend_angle: "trend_angle",
  arrow: "arrow",
  extended: "extended",
  horizontal_line: "horizontal_line",
  horz_line: "horizontal_line",
  linetoolhorzline: "horizontal_line",
  horizontal_ray: "horizontal_ray",
  horz_ray: "horizontal_ray",
  linetoolhorzray: "horizontal_ray",
  vertical_line: "vertical_line",
  vert_line: "vertical_line",
  linetoolvertline: "vertical_line",
  cross_line: "cross_line",
  parallel_channel: "parallel_channel",
  flat_bottom: "flat_bottom",
  disjoint_angle: "disjoint_angle",
  rectangle: "rectangle",
  linetoolrectangle: "rectangle",
  rotated_rectangle: "rotated_rectangle",
  ellipse: "ellipse",
  circle: "circle",
  triangle: "triangle",
  polyline: "polyline",
  path: "path",
  fib_retracement: "fib_retracement",
  fibretracement: "fib_retracement",
  linetoolfibretracement: "fib_retracement",
  fib_trend_ext: "fib_trend_ext",
  fib_extension: "fib_trend_ext",
  fib_channel: "fib_channel",
  fib_timezone: "fib_timezone",
  fib_speed_resist_fan: "fib_speed_resist_fan",
  fib_circles: "fib_circles",
  gannbox: "gannbox",
  gannbox_square: "gannbox_square",
  gannbox_fixed: "gannbox_fixed",
  long_position: "long_position",
  short_position: "short_position",
  price_range: "price_range",
  date_range: "date_range",
  date_and_price_range: "date_and_price_range",
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
  abcd_pattern: "abcd_pattern",
  head_and_shoulders: "head_and_shoulders",
  triangle_pattern: "triangle_pattern",
  cypher_pattern: "cypher_pattern",
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
  if (/^[a-z0-9_]+$/.test(key) && key.length > 2) return key;
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

function sanitizeOverrides(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    if (v == null) continue;
    if (typeof v === "object" && !Array.isArray(v)) continue;
    if (typeof v === "function") continue;
    if (/^(symbol|interval|state|points)/i.test(k)) continue;
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
      (points.length >= 2 ? "trend_line" : "horizontal_line");
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

export async function createShapeFromSnapshot(
  chart: IChartWidgetApi,
  snap: ShapeSnapshot,
): Promise<EntityId | null> {
  const overrides = snap.overrides as never;
  const useSingle =
    SINGLE_POINT_SHAPES.has(snap.shape) || (snap.points.length === 1 && snap.shape === "horizontal_line");

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
    try {
      const p = snap.points[0]!;
      const id = await chart.createShape(
        { time: p.time, price: p.price },
        {
          shape: "horizontal_line",
          disableUndo: true,
          overrides,
        },
      );
      return id ?? null;
    } catch {
      return null;
    }
  }
}

export function applyShapeSnapshot(chart: IChartWidgetApi, entityId: EntityId, snap: ShapeSnapshot): void {
  try {
    const shapeApi = chart.getShapeById(entityId);
    shapeApi.setPoints([...snap.points]);
    if (Object.keys(snap.overrides).length > 0) {
      shapeApi.setProperties(snap.overrides);
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
  attempts = 8,
  delayMs = 60,
): Promise<ShapeSnapshot | null> {
  for (let i = 0; i < attempts; i += 1) {
    const snap = readShapeSnapshot(chart, entityId, preferredShape);
    if (snap && snap.points.length > 0) return snap;
    await new Promise((r) => window.setTimeout(r, delayMs));
  }
  return readShapeSnapshot(chart, entityId, preferredShape);
}
