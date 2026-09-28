/** Shared mobile layout metrics — keep rail / overlays / scrims in sync. */
export const RAIL_WIDTH = 52;
export const RAIL_WIDTH_COMPACT = 44;
export const MOBILE_BOTTOM_BAR_HEIGHT = 56;
export const MOBILE_DOCK_COLLAPSED = 32;

export function railWidth(compact: boolean): number {
  return compact ? RAIL_WIDTH_COMPACT : RAIL_WIDTH;
}
