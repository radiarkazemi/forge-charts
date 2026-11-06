/**
 * Helpers for Charting Library Style-tab plots on inert (shape-painted) studies.
 * Color / transparency / visibility / linewidth live in `metainfo.styles` so the
 * study dialog Style tab shows the native palette + advanced options.
 */

import { clColor } from "@/features/sessions/runtime";

export interface StudyStylePlotSpec {
  readonly id: string;
  readonly title: string;
  readonly color: string;
  readonly visible?: boolean;
  readonly transparency?: number;
  readonly linewidth?: number;
  /** Hide from legend but keep in Style tab (Sessions pattern). */
  readonly legendHidden?: boolean;
}

export interface StudyStylePlotValues {
  readonly color: string;
  readonly visible: boolean;
  readonly transparency: number;
  readonly linewidth: number;
  /** 0 solid · 1 dotted · 2 dashed */
  readonly linestyle: number;
}

const DEFAULT_STYLE = {
  linestyle: 0,
  linewidth: 2,
  plottype: 0,
  trackPrice: false,
  transparency: 0,
  visible: true,
  display: 0,
} as const;

/** Build `plots` entries (hidden inert + style carriers). */
export function buildStylePlots(specs: readonly StudyStylePlotSpec[]): {
  plots: { id: string; type: "line" }[];
  stylesMeta: Record<string, { title: string; histogramBase: number; isHidden?: boolean }>;
  stylesDefaults: Record<string, Record<string, unknown>>;
} {
  const plots = [
    { id: "plot_hidden", type: "line" as const },
    ...specs.map((s) => ({ id: s.id, type: "line" as const })),
  ];
  const stylesMeta: Record<string, { title: string; histogramBase: number; isHidden?: boolean }> = {
    plot_hidden: { title: "Hidden", histogramBase: 0, isHidden: true },
  };
  const stylesDefaults: Record<string, Record<string, unknown>> = {
    plot_hidden: {
      ...DEFAULT_STYLE,
      linewidth: 1,
      transparency: 100,
      visible: false,
      color: "#000000",
    },
  };
  for (const s of specs) {
    stylesMeta[s.id] = {
      title: s.title,
      histogramBase: 0,
      ...(s.legendHidden === false ? {} : { isHidden: true }),
    };
    stylesDefaults[s.id] = {
      ...DEFAULT_STYLE,
      linewidth: s.linewidth ?? 2,
      transparency: s.transparency ?? 0,
      visible: s.visible !== false,
      color: s.color,
    };
  }
  return { plots, stylesMeta, stylesDefaults };
}

/** NaN fillers so style-carrier plots never draw on the price scale. */
export function stylePlotNaNs(count: number): number[] {
  return Array.from({ length: count }, () => NaN);
}

function readStylesMap(api: { getStyleValues?: () => unknown }): Record<string, unknown> {
  try {
    const raw = api.getStyleValues?.() as Record<string, unknown> | null;
    if (!raw || typeof raw !== "object") return {};
    const nested = raw.styles;
    if (nested && typeof nested === "object") return nested as Record<string, unknown>;
    return raw;
  } catch {
    return {};
  }
}

/** Read one Style-tab plot (color palette + advanced options). */
export function readStylePlot(
  api: { getStyleValues?: () => unknown } | null | undefined,
  plotId: string,
  fallback: StudyStylePlotValues,
): StudyStylePlotValues {
  if (!api) return { ...fallback };
  const styles = readStylesMap(api);
  const looseKey = Object.keys(styles).find(
    (k) => k === plotId || k.endsWith(plotId) || k === `style_${plotId}`,
  );
  const cand = (styles[plotId] ?? (looseKey ? styles[looseKey] : undefined)) as
    | {
        color?: string;
        transparency?: number;
        visible?: boolean;
        linewidth?: number;
        linestyle?: number;
      }
    | undefined;
  if (!cand || typeof cand !== "object") return { ...fallback };

  let color = fallback.color;
  if (typeof cand.color === "string" && cand.color.trim()) {
    const norm = clColor(cand.color, "");
    if (norm) color = norm;
  }
  const transparency =
    typeof cand.transparency === "number" && Number.isFinite(cand.transparency)
      ? Math.max(0, Math.min(100, cand.transparency))
      : fallback.transparency;
  const visible = typeof cand.visible === "boolean" ? cand.visible : fallback.visible;
  const linewidth =
    typeof cand.linewidth === "number" && Number.isFinite(cand.linewidth)
      ? Math.max(1, Math.min(8, Math.round(cand.linewidth)))
      : fallback.linewidth;
  const linestyle =
    typeof cand.linestyle === "number" && Number.isFinite(cand.linestyle)
      ? Math.max(0, Math.min(2, Math.round(cand.linestyle)))
      : fallback.linestyle;

  return { color, visible, transparency, linewidth, linestyle };
}

/** Apply Style-tab transparency (0–100) onto a #RRGGBB / rgba color. */
export function applyTransparency(color: string, transparency: number): string {
  const t = Math.max(0, Math.min(100, transparency));
  if (t <= 0) return color;
  const hex = clColor(color, color);
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return color;
  const n = parseInt(m[1]!, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const a = Math.round((1 - t / 100) * 1000) / 1000;
  return `rgba(${r},${g},${b},${a})`;
}

/** Map Style linewidth (1–8) → marker / label font size. */
export function linewidthToFontSize(linewidth: number, fallback = 13): number {
  if (!(linewidth > 0)) return fallback;
  return Math.max(8, Math.min(28, Math.round(8 + linewidth * 3)));
}
