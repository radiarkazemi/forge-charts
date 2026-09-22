import type { ThemeMode } from "@/application";

/**
 * Design tokens shared by the MUI theme and the TradingView chart overrides so
 * the chart canvas and the surrounding UI always agree on colours.
 */
export interface ThemeTokens {
  readonly background: string;
  readonly surface: string;
  readonly surfaceRaised: string;
  readonly border: string;
  readonly text: string;
  readonly textMuted: string;
  readonly grid: string;
  readonly accent: string;
  readonly up: string;
  readonly down: string;
  readonly volumeUp: string;
  readonly volumeDown: string;
  readonly crosshair: string;
}

export const TOKENS: Readonly<Record<ThemeMode, ThemeTokens>> = {
  dark: {
    background: "#131722",
    surface: "#1e222d",
    surfaceRaised: "#2a2e39",
    border: "#2a2e39",
    text: "#d1d4dc",
    textMuted: "#787b86",
    grid: "rgba(42, 46, 57, 0.6)",
    accent: "#2962ff",
    up: "#26a69a",
    down: "#ef5350",
    volumeUp: "rgba(38, 166, 154, 0.5)",
    volumeDown: "rgba(239, 83, 80, 0.5)",
    crosshair: "#9598a1",
  },
  light: {
    background: "#ffffff",
    surface: "#f8f9fd",
    surfaceRaised: "#e0e3eb",
    border: "#e0e3eb",
    text: "#131722",
    textMuted: "#6a6d78",
    grid: "rgba(224, 227, 235, 0.8)",
    accent: "#2962ff",
    up: "#089981",
    down: "#f23645",
    volumeUp: "rgba(8, 153, 129, 0.5)",
    volumeDown: "rgba(242, 54, 69, 0.5)",
    crosshair: "#9598a1",
  },
};

export const FONT_FAMILY = "'Inter', 'Trebuchet MS', Roboto, Arial, sans-serif";
