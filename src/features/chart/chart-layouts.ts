import type { ChartLayoutId } from "@/application";

export type { ChartLayoutId };

export interface ChartLayoutChoice {
  readonly id: ChartLayoutId;
  readonly title: string;
}

export const CHART_LAYOUT_CHOICES: readonly ChartLayoutChoice[] = [
  { id: "s", title: "1 chart" },
  { id: "2h", title: "2 charts — side by side" },
  { id: "2v", title: "2 charts — stacked" },
  { id: "3s", title: "3 charts — stacked" },
  { id: "3h", title: "3 charts — columns" },
  { id: "3v", title: "3 charts — rows" },
  { id: "2-1", title: "3 charts — 2 top / 1 bottom" },
  { id: "1-2", title: "3 charts — 1 top / 2 bottom" },
  { id: "4", title: "4 charts — grid" },
];

export interface ChartLayoutGrid {
  readonly count: number;
  /** CSS grid-template-areas rows, e.g. `"a b" / "c c"`. */
  readonly areas: string;
  readonly columns: string;
  readonly rows: string;
}

const GRIDS: Record<ChartLayoutId, ChartLayoutGrid> = {
  s: { count: 1, areas: `"a"`, columns: "1fr", rows: "1fr" },
  "2h": { count: 2, areas: `"a b"`, columns: "1fr 1fr", rows: "1fr" },
  "2v": { count: 2, areas: `"a" "b"`, columns: "1fr", rows: "1fr 1fr" },
  "3s": { count: 3, areas: `"a" "b" "c"`, columns: "1fr", rows: "1fr 1fr 1fr" },
  "3h": { count: 3, areas: `"a b c"`, columns: "1fr 1fr 1fr", rows: "1fr" },
  "3v": { count: 3, areas: `"a" "b" "c"`, columns: "1fr", rows: "1fr 1fr 1fr" },
  "2-1": { count: 3, areas: `"a b" "c c"`, columns: "1fr 1fr", rows: "1fr 1fr" },
  "1-2": { count: 3, areas: `"a a" "b c"`, columns: "1fr 1fr", rows: "1fr 1fr" },
  "4": { count: 4, areas: `"a b" "c d"`, columns: "1fr 1fr", rows: "1fr 1fr" },
};

const AREA_NAMES = ["a", "b", "c", "d"] as const;

export function getChartLayoutGrid(id: ChartLayoutId): ChartLayoutGrid {
  return GRIDS[id] ?? GRIDS.s;
}

export function chartPaneArea(index: number): string {
  return AREA_NAMES[index] ?? "a";
}

export function isChartLayoutId(value: unknown): value is ChartLayoutId {
  return typeof value === "string" && value in GRIDS;
}
