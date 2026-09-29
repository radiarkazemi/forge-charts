/** Shared mobile layout metrics — keep rail / overlays / scrims in sync. */
export const RAIL_WIDTH = 52;
export const RAIL_WIDTH_COMPACT = 44;
/** @deprecated chart tools moved into MobileForgeShell TF row */
export const MOBILE_CHART_BAR_HEIGHT = 44;
/** App tab row height (matches MobileForgeShell nav). */
export const MOBILE_APP_NAV_HEIGHT = 56;
/** Total bottom chrome (nav only in Forge mobile shell). */
export const MOBILE_BOTTOM_BAR_HEIGHT = MOBILE_APP_NAV_HEIGHT;
export const MOBILE_DOCK_COLLAPSED = 32;

export function railWidth(compact: boolean): number {
  return compact ? RAIL_WIDTH_COMPACT : RAIL_WIDTH;
}
