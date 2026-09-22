import type { Theme } from "./types";

export type Palette = {
  bg: string;
  panel: string;
  border: string;
  text: string;
  muted: string;
  grid: string;
  axis: string;
  up: string;
  down: string;
  wickUp: string;
  wickDown: string;
  volumeUp: string;
  volumeDown: string;
  cross: string;
  accent: string;
  overlay: string;
  watermark: string;
  fib: string[];
};

export const palettes: Record<Theme, Palette> = {
  dark: {
    bg: "#131722",
    panel: "#1e222d",
    border: "#2a2e39",
    text: "#d1d4dc",
    muted: "#787b86",
    grid: "#2a2e39",
    axis: "#787b86",
    up: "#26a69a",
    down: "#ef5350",
    wickUp: "#26a69a",
    wickDown: "#ef5350",
    volumeUp: "rgba(38, 166, 154, 0.32)",
    volumeDown: "rgba(239, 83, 80, 0.32)",
    cross: "rgba(209, 212, 220, 0.45)",
    accent: "#2962ff",
    overlay: "#2962ff",
    watermark: "rgba(209, 212, 220, 0.06)",
    fib: ["#787b86", "#2962ff", "#26a69a", "#ff9800", "#42a5f5", "#ef5350", "#d1d4dc"],
  },
  light: {
    bg: "#ffffff",
    panel: "#f8f9fd",
    border: "#e0e3eb",
    text: "#131722",
    muted: "#6a6d78",
    grid: "#e0e3eb",
    axis: "#6a6d78",
    up: "#089981",
    down: "#f23645",
    wickUp: "#089981",
    wickDown: "#f23645",
    volumeUp: "rgba(8, 153, 129, 0.28)",
    volumeDown: "rgba(242, 54, 69, 0.28)",
    cross: "rgba(19, 23, 34, 0.4)",
    accent: "#2962ff",
    overlay: "#2962ff",
    watermark: "rgba(19, 23, 34, 0.05)",
    fib: ["#6a6d78", "#2962ff", "#089981", "#ff9800", "#1976d2", "#f23645", "#131722"],
  },
};

export const CHART_FONT = "11px Trebuchet MS, Arial, sans-serif";
export const CHART_FONT_BOLD = "bold 12px Trebuchet MS, Arial, sans-serif";
export const AXIS_FONT = "11px Trebuchet MS, Arial, sans-serif";
