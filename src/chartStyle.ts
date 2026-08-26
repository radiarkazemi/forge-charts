import { palettes } from "./engine/theme";
import type { ChartStyle, Theme } from "./engine/types";

export const CHART_STYLE_KEY = "forge.chartStyle";

export function defaultChartStyle(theme: Theme = "dark"): ChartStyle {
  const p = palettes[theme];
  return {
    upColor: p.up,
    downColor: p.down,
    wickUpColor: p.wickUp,
    wickDownColor: p.wickDown,
    borderUpColor: p.up,
    borderDownColor: p.down,
    showWick: true,
    showBorder: true,
    source: "close",
  };
}

export function chartStyleMatchesTheme(style: ChartStyle, theme: Theme): boolean {
  const d = defaultChartStyle(theme);
  return (
    style.upColor === d.upColor &&
    style.downColor === d.downColor &&
    style.wickUpColor === d.wickUpColor &&
    style.wickDownColor === d.wickDownColor &&
    style.borderUpColor === d.borderUpColor &&
    style.borderDownColor === d.borderDownColor
  );
}
