/** Read and write the chart's own Long / Short position tool. */

export type PositionSide = "long" | "short";

export interface ChartPosition {
  readonly id: string;
  readonly side: PositionSide;
  readonly entry: number;
  readonly stop: number;
  readonly target: number;
  readonly placedAt: number | null;
}

interface ShapePoint {
  readonly time?: number;
  readonly price?: number;
}

interface ShapeApi {
  getPoints: () => ShapePoint[];
  getProperties: () => Record<string, unknown>;
  setPoints: (points: ShapePoint[]) => void;
  setProperties: (props: Record<string, unknown>) => void;
}

export interface PositionChart {
  getAllShapes: () => Array<{ id: string; name: string }>;
  getShapeById: (id: string) => ShapeApi;
  symbolExt?: () => { pricescale?: number; minmov?: number } | null;
  createShape: (
    point: { time: number; price: number },
    options: { shape: string; disableUndo?: boolean; overrides?: Record<string, unknown> },
  ) => Promise<string | null>;
}

export function positionSide(name: string): PositionSide | null {
  const compact = name.toLowerCase().replace(/[^a-z]/g, "");
  if (compact.includes("short")) return "short";
  if (compact.includes("long")) return "long";
  return null;
}

export function minTickOf(chart: Pick<PositionChart, "symbolExt">): number {
  try {
    const ext = chart.symbolExt?.();
    const scale = Number(ext?.pricescale);
    const minmov = Number(ext?.minmov);
    if (Number.isFinite(scale) && scale > 0) {
      const move = Number.isFinite(minmov) && minmov > 0 ? minmov : 1;
      return move / scale;
    }
  } catch {
    /* symbol not ready */
  }
  return 0.01;
}

function num(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** profitLevel / stopLevel are tick counts, the same units the chart stores. */
export function pricesFromLevels(
  side: PositionSide,
  entry: number,
  profitLevel: number,
  stopLevel: number,
  tick: number,
): { stop: number; target: number } {
  const step = tick > 0 ? tick : 0.01;
  const profit = Math.abs(profitLevel) * step;
  const risk = Math.abs(stopLevel) * step;
  if (side === "long") return { stop: entry - risk, target: entry + profit };
  return { stop: entry + risk, target: entry - profit };
}

export function levelsFromPrices(
  side: PositionSide,
  entry: number,
  stop: number,
  target: number,
  tick: number,
): { profitLevel: number; stopLevel: number } {
  const step = tick > 0 ? tick : 0.01;
  const profit = side === "long" ? target - entry : entry - target;
  const risk = side === "long" ? entry - stop : stop - entry;
  return {
    profitLevel: Math.max(1, Math.round(profit / step)),
    stopLevel: Math.max(1, Math.round(risk / step)),
  };
}

export function readPosition(chart: PositionChart, id: string, name?: string): ChartPosition | null {
  try {
    const shape = chart.getShapeById(id);
    const props = shape.getProperties() ?? {};
    const side =
      positionSide(name ?? "") ??
      positionSide(typeof props.name === "string" ? props.name : "") ??
      positionSide(typeof props.toolName === "string" ? props.toolName : "");
    if (!side) return null;
    const entry = num(shape.getPoints()[0]?.price);
    const profitLevel = num(props.profitLevel);
    const stopLevel = num(props.stopLevel);
    if (entry == null || profitLevel == null || stopLevel == null) return null;
    const { stop, target } = pricesFromLevels(side, entry, profitLevel, stopLevel, minTickOf(chart));
    return { id, side, entry, stop, target, placedAt: num(shape.getPoints()[0]?.time) };
  } catch {
    return null;
  }
}

export function readPositions(chart: PositionChart): ChartPosition[] {
  try {
    return chart
      .getAllShapes()
      .map((info) => readPosition(chart, String(info.id), info.name))
      .filter((row): row is ChartPosition => row != null);
  } catch {
    return [];
  }
}

export function writePosition(
  chart: PositionChart,
  id: string,
  side: PositionSide,
  entry: number,
  stop: number,
  target: number,
): void {
  const shape = chart.getShapeById(id);
  const time = shape.getPoints()[0]?.time ?? Math.floor(Date.now() / 1000);
  shape.setPoints([{ time, price: entry }]);
  shape.setProperties(levelsFromPrices(side, entry, stop, target, minTickOf(chart)));
}

export async function createPosition(
  chart: PositionChart,
  side: PositionSide,
  entry: number,
  stop: number,
  target: number,
  time: number,
): Promise<string | null> {
  const id = await chart.createShape(
    { time, price: entry },
    {
      shape: side === "long" ? "long_position" : "short_position",
      disableUndo: false,
      overrides: {
        ...levelsFromPrices(side, entry, stop, target, minTickOf(chart)),
        showPriceLabels: true,
      },
    },
  );
  return id ? String(id) : null;
}
