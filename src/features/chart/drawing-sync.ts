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
  // Already a SupportedLineTools-style id
  if (/^[a-z0-9_]+$/.test(key) && key.length > 2) return key;
  return null;
}

function sanitizePoints(
  points: ReadonlyArray<{ time?: number; price?: number; channel?: string }>,
): Array<{ time: number; price: number }> {
  const out: Array<{ time: number; price: number }> = [];
  for (const p of points) {
    const time = Number(p.time);
    const price = Number(p.price);
    if (!Number.isFinite(time) || !Number.isFinite(price)) continue;
    out.push({ time: time > 1e12 ? Math.floor(time / 1000) : Math.floor(time), price });
  }
  return out;
}

/** Flatten getProperties() into createMultipointShape overrides (drop nested junk). */
function sanitizeOverrides(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    if (v == null) continue;
    if (typeof v === "object" && !Array.isArray(v)) continue;
    if (typeof v === "function") continue;
    // Skip internal / huge fields
    if (/^(symbol|interval|state|points)/i.test(k)) continue;
    out[k] = v;
  }
  return out;
}

export function readShapeSnapshot(chart: IChartWidgetApi, entityId: EntityId): ShapeSnapshot | null {
  try {
    const shapeApi = chart.getShapeById(entityId);
    const points = sanitizePoints(shapeApi.getPoints() as Array<{ time?: number; price?: number }>);
    if (points.length === 0) return null;
    const props = (shapeApi.getProperties() ?? {}) as Record<string, unknown>;
    const all = chart.getAllShapes();
    const info = all.find((s) => s.id === entityId);
    const shape =
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

export async function createShapeFromSnapshot(
  chart: IChartWidgetApi,
  snap: ShapeSnapshot,
): Promise<EntityId | null> {
  try {
    const id = await chart.createMultipointShape([...snap.points], {
      shape: snap.shape as never,
      text: snap.text,
      disableUndo: true,
      overrides: snap.overrides as never,
    });
    return id ?? null;
  } catch {
    // Fallback: trend_line if shape id rejected
    try {
      const id = await chart.createMultipointShape([...snap.points], {
        shape: "trend_line",
        disableUndo: true,
        overrides: snap.overrides as never,
      });
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
