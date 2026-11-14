/** Shared mobile layout metrics — keep rail / overlays / scrims in sync. */
export const RAIL_WIDTH = 52;
export const RAIL_WIDTH_COMPACT = 44;
/** Near-black top row: profile, symbol, chart type and compare stay put; intervals scroll. */
export const MOBILE_TOP_BAR_HEIGHT = 40;
/** Black footer strip: Date Range · session clock. */
export const MOBILE_CHART_BAR_HEIGHT = 36;
/** The chart workspace has no tab row. Destinations live on the profile menu. */
export const MOBILE_APP_NAV_HEIGHT = 0;
/** Total bottom chrome height. */
export const MOBILE_BOTTOM_BAR_HEIGHT = MOBILE_CHART_BAR_HEIGHT;
export const MOBILE_DOCK_COLLAPSED = 32;

export function railWidth(compact: boolean): number {
  return compact ? RAIL_WIDTH_COMPACT : RAIL_WIDTH;
}
