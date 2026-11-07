/**
 * Chart watermark — AG FX-style title + subtitle overlay (Trading Handbook branding).
 * Screen-anchored (does not scroll with bars). State is published by useWatermarkStudy.
 */

export type WatermarkVAlign = "top" | "middle" | "bottom";
export type WatermarkHAlign = "left" | "center" | "right";

export interface WatermarkInputs {
  readonly title: string;
  readonly subtitle: string;
  readonly showTitle: boolean;
  readonly showSubtitle: boolean;
  readonly showSymbolInfo: boolean;
  readonly vertPos: WatermarkVAlign;
  readonly horzPos: WatermarkHAlign;
  readonly symbolVertPos: WatermarkVAlign;
  readonly titleSize: number;
  readonly subtitleSize: number;
  readonly symbolSize: number;
  readonly titleBold: boolean;
  readonly subtitleBold: boolean;
  readonly letterSpacing: number;
  readonly lineGap: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly titleColor: string;
  readonly subtitleColor: string;
  readonly symbolColor: string;
  readonly titleTransparency: number;
  readonly subtitleTransparency: number;
  readonly symbolTransparency: number;
}

export const WATERMARK_DEFAULTS: WatermarkInputs = {
  title: "Forge Charts",
  subtitle: "PATIENCE | FRACTAL | LIQUIDITY",
  showTitle: true,
  showSubtitle: true,
  showSymbolInfo: false,
  vertPos: "top",
  horzPos: "center",
  symbolVertPos: "bottom",
  titleSize: 28,
  subtitleSize: 14,
  symbolSize: 12,
  titleBold: true,
  subtitleBold: false,
  letterSpacing: 0.06,
  lineGap: 6,
  offsetX: 0,
  offsetY: 12,
  /** Defaults suit dark chart themes; Style tab can switch for light. */
  titleColor: "#D1D4DC",
  subtitleColor: "#9598A1",
  symbolColor: "#787B86",
  titleTransparency: 20,
  subtitleTransparency: 30,
  symbolTransparency: 35,
};

export interface WatermarkOverlayState extends WatermarkInputs {
  readonly symbolLabel: string;
  readonly visible: boolean;
}

type Listener = () => void;

let overlayState: WatermarkOverlayState | null = null;
const listeners = new Set<Listener>();

export function publishWatermarkOverlay(state: WatermarkOverlayState | null): void {
  overlayState = state;
  for (const l of listeners) l();
}

export function getWatermarkOverlay(): WatermarkOverlayState | null {
  return overlayState;
}

export function subscribeWatermarkOverlay(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Apply CL transparency (0–100, higher = more transparent) to a hex/rgb color. */
export function withTransparency(color: string, transparency: number): string {
  const t = Math.max(0, Math.min(100, transparency));
  const alpha = 1 - t / 100;
  const hex = color.trim();
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (m) {
    const n = parseInt(m[1]!, 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
  }
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(hex);
  if (rgb) {
    return `rgba(${rgb[1]},${rgb[2]},${rgb[3]},${alpha.toFixed(3)})`;
  }
  return color;
}
