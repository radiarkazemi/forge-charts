/**
 * Decide whether a drawing_event "create" should trigger Cross one-shot reset.
 * Study overlays (Sessions / HTF / …) fire create for every painted shape — if we
 * treat those like user drawings, we lock the toolbar to Cross and kill Text.
 */

import type { EntityId, IChartWidgetApi } from "@/infrastructure/tradingview";
import { isOpenEndedDrawingTool } from "./open-ended-draw-tools";
import { normalizeShapeName } from "./drawing-sync";

/** True for indicator-painted shapes that must never drive toolbar oneshot. */
export function isForgeOverlayDrawing(
  chart: IChartWidgetApi | null | undefined,
  entityId: EntityId | string | null | undefined,
): boolean {
  if (!chart || entityId == null) return false;
  try {
    const api = chart.getShapeById(entityId as EntityId);
    if (typeof api.isSelectionEnabled === "function" && api.isSelectionEnabled() === false) {
      return true;
    }
    if (typeof api.isUserEditEnabled === "function" && api.isUserEditEnabled() === false) {
      return true;
    }
    if (typeof api.isSavingEnabled === "function" && api.isSavingEnabled() === false) {
      return true;
    }
    const props = (api.getProperties?.() ?? {}) as Record<string, unknown>;
    if (props.ownerStudyId != null && String(props.ownerStudyId).length > 0) return true;
    if (props.disableSelection === true || props.disableSave === true) return true;
    if (props.lock === true || props.locked === true) return true;
  } catch {
    /* shape may already be gone */
  }
  return false;
}

/** Best-effort shape/tool id for an entity (LineToolText → text). */
export function resolveCreatedDrawingTool(
  chart: IChartWidgetApi | null | undefined,
  entityId: EntityId | string | null | undefined,
  preferredTool?: string | null,
): string | null {
  if (preferredTool && isOpenEndedDrawingTool(preferredTool)) return preferredTool;
  if (!chart || entityId == null) return preferredTool ?? null;
  try {
    const all = chart.getAllShapes?.() ?? [];
    const info = all.find((s) => String(s.id) === String(entityId));
    const fromName = normalizeShapeName(info?.name);
    if (fromName) return fromName;
    const api = chart.getShapeById(entityId as EntityId);
    const props = (api.getProperties?.() ?? {}) as Record<string, unknown>;
    return (
      normalizeShapeName(typeof props.toolName === "string" ? props.toolName : null) ??
      normalizeShapeName(typeof props.name === "string" ? props.name : null) ??
      preferredTool ??
      null
    );
  } catch {
    return preferredTool ?? null;
  }
}

/**
 * Skip Cross reset when:
 * - the active tool is still open-ended (Path / Text / …), or
 * - the created entity is a text-menu / multipoint shape, or
 * - the entity is a Forge indicator overlay.
 */
export function shouldSkipDrawingOneShot(args: {
  readonly chart: IChartWidgetApi | null | undefined;
  readonly entityId: EntityId | string;
  readonly selectedTool: string | null | undefined;
  readonly sharedTool?: string | null;
}): boolean {
  const { chart, entityId, selectedTool, sharedTool } = args;
  if (isForgeOverlayDrawing(chart, entityId)) return true;
  if (isOpenEndedDrawingTool(selectedTool) || isOpenEndedDrawingTool(sharedTool)) return true;
  const created = resolveCreatedDrawingTool(chart, entityId, selectedTool ?? sharedTool);
  if (isOpenEndedDrawingTool(created)) return true;
  return false;
}
