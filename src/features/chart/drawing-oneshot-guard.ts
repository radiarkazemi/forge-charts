/**
 * Decide whether a drawing_event "create" should trigger Cross one-shot reset.
 * Study overlays (Sessions / HTF / …) fire create for every painted shape — if we
 * treat those like user drawings, we lock the toolbar to Cross and kill Text.
 */

import type { EntityId, IChartWidgetApi } from "@/infrastructure/tradingview";
import { isChartPaintBusy } from "./study-paint-gate";
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
    // Raw CL names often look like "LineToolText" / "LineToolAnchoredText".
    const rawName = info?.name != null ? String(info.name) : "";
    if (/text|note|callout|comment|signpost|balloon|price_label|pricelabel/i.test(rawName)) {
      const normalized = normalizeShapeName(rawName);
      if (normalized) return normalized;
      if (/anchored/i.test(rawName)) return "anchored_text";
      if (/note/i.test(rawName)) return "note";
      if (/callout/i.test(rawName)) return "callout";
      return "text";
    }
    const fromName = normalizeShapeName(rawName);
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

/** Text & Notes flyout (and stickers) — create opens an editor; Cross kills it. */
export function isTextMenuDrawingTool(tool: string | null | undefined): boolean {
  if (!tool) return false;
  const key = tool.trim().toLowerCase().replace(/[\s_-]+/g, "");
  return /^(text|anchoredtext|note|anchorednote|callout|comment|pricelabel|pricenote|signpost|balloon|emoji|sticker|icon|flag|linetooltext|linetoolanchoredtext|linetoolnote|linetoolanchorednote|linetoolcallout|linetoolcomment|linetoolpricelabel|linetoolpricenote|linetoolsignpost|linetoolballoon|linetoolemoji|linetoolsticker|linetoolicon|linetoolflag)$/.test(
    key,
  );
}

/**
 * Skip Cross reset when:
 * - studies are mid-paint (createShape storm),
 * - the active/armed tool is still open-ended (Path / Text / …),
 * - the created entity is a text-menu / multipoint shape, or
 * - the entity is a Forge indicator overlay.
 */
export function shouldSkipDrawingOneShot(args: {
  readonly chart: IChartWidgetApi | null | undefined;
  readonly entityId: EntityId | string;
  readonly selectedTool: string | null | undefined;
  readonly sharedTool?: string | null;
  readonly armedTool?: string | null;
}): boolean {
  const { chart, entityId, selectedTool, sharedTool, armedTool } = args;
  // Sessions / HTF / DR paints mark this window — never oneshot during it.
  if (isChartPaintBusy()) return true;
  if (isForgeOverlayDrawing(chart, entityId)) return true;
  if (
    isOpenEndedDrawingTool(selectedTool) ||
    isOpenEndedDrawingTool(sharedTool) ||
    isOpenEndedDrawingTool(armedTool) ||
    isTextMenuDrawingTool(selectedTool) ||
    isTextMenuDrawingTool(sharedTool) ||
    isTextMenuDrawingTool(armedTool)
  ) {
    return true;
  }
  const created = resolveCreatedDrawingTool(
    chart,
    entityId,
    selectedTool ?? sharedTool ?? armedTool,
  );
  if (isOpenEndedDrawingTool(created) || isTextMenuDrawingTool(created)) return true;
  return false;
}
