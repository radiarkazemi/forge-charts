/** Shared mobile layout metrics — keep rail / overlays / scrims in sync. */
export const RAIL_WIDTH = 52;
export const RAIL_WIDTH_COMPACT = 44;
/** Faraz-style top row (profile · symbol pill · scrollable TFs). */
export const MOBILE_TOP_BAR_HEIGHT = 44;
/** Chart footer (Date Range · session clock), TradingView mobile. */
export const MOBILE_CHART_BAR_HEIGHT = 36;
/** App tab row (watchlist / chart / trade / alerts / menu). */
export const MOBILE_APP_NAV_HEIGHT = 52;
/** Total bottom chrome height (chart bar + app nav). */
export const MOBILE_BOTTOM_BAR_HEIGHT = MOBILE_CHART_BAR_HEIGHT + MOBILE_APP_NAV_HEIGHT;
export const MOBILE_DOCK_COLLAPSED = 32;

export function railWidth(compact: boolean): number {
  return compact ? RAIL_WIDTH_COMPACT : RAIL_WIDTH;
}
