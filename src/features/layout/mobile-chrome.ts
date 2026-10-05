/** Shared mobile layout metrics — keep rail / overlays / scrims in sync. */
export const RAIL_WIDTH = 52;
export const RAIL_WIDTH_COMPACT = 44;
/** Chart tools row (symbol / interval / draw / indicators / more). */
export const MOBILE_CHART_BAR_HEIGHT = 44;
/** App tab row (watchlist / chart / trade / alerts / menu). */
export const MOBILE_APP_NAV_HEIGHT = 52;
/** Total bottom chrome height (chart bar + app nav). */
export const MOBILE_BOTTOM_BAR_HEIGHT = MOBILE_CHART_BAR_HEIGHT + MOBILE_APP_NAV_HEIGHT;
export const MOBILE_DOCK_COLLAPSED = 32;

export function railWidth(compact: boolean): number {
  return compact ? RAIL_WIDTH_COMPACT : RAIL_WIDTH;
}
