import type { ChartLayoutId } from "@/application";

export type { ChartLayoutId };

export interface ChartLayoutChoice {
  readonly id: ChartLayoutId;
  readonly title: string;
  /** Compact SVG glyph for the Select Layout menu (TradingView-style). */
  readonly icon: string;
  readonly paneCount: number;
}

function layoutIcon(paths: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="28" height="28"><rect x="3" y="3" width="22" height="22" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/>${paths}</svg>`;
}

export const CHART_LAYOUT_CHOICES: readonly ChartLayoutChoice[] = [
  {
    id: "s",
    title: "1",
    paneCount: 1,
    icon: layoutIcon(""),
  },
  {
    id: "2h",
    title: "2 · side by side",
    paneCount: 2,
    icon: layoutIcon(`<path d="M14 3v22" stroke="currentColor" stroke-width="1.5"/>`),
  },
  {
    id: "2v",
    title: "2 · stacked",
    paneCount: 2,
    icon: layoutIcon(`<path d="M3 14h22" stroke="currentColor" stroke-width="1.5"/>`),
  },
  {
    id: "3h",
    title: "3 · columns",
    paneCount: 3,
    icon: layoutIcon(
      `<path d="M10.3 3v22M17.7 3v22" stroke="currentColor" stroke-width="1.5"/>`,
    ),
  },
  {
    id: "3v",
    title: "3 · rows",
    paneCount: 3,
    icon: layoutIcon(
      `<path d="M3 10.3h22M3 17.7h22" stroke="currentColor" stroke-width="1.5"/>`,
    ),
  },
  {
    id: "3s",
    title: "3 · stacked",
    paneCount: 3,
    icon: layoutIcon(
      `<path d="M3 10.3h22M3 17.7h22" stroke="currentColor" stroke-width="1.5"/>`,
    ),
  },
  {
    id: "2-1",
    title: "3 · 2 top / 1 bottom",
    paneCount: 3,
    icon: layoutIcon(
      `<path d="M14 3v11M3 14h22" stroke="currentColor" stroke-width="1.5"/>`,
    ),
  },
  {
    id: "1-2",
    title: "3 · 1 top / 2 bottom",
    paneCount: 3,
    icon: layoutIcon(
      `<path d="M3 14h22M14 14v11" stroke="currentColor" stroke-width="1.5"/>`,
    ),
  },
  {
    id: "4",
    title: "4 · grid",
    paneCount: 4,
    icon: layoutIcon(
      `<path d="M14 3v22M3 14h22" stroke="currentColor" stroke-width="1.5"/>`,
    ),
  },
];

/** Max panes kept alive so layout switches never remount widgets. */
export const MAX_CHART_PANES = 4;

export interface ChartLayoutGrid {
  readonly count: number;
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
