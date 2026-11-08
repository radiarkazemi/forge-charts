/**
 * Tools that must NOT one-shot-reset to Cross on the first `drawing_event` "create".
 *
 * - Path / Polyline / Brush: still collecting points after first click.
 * - Text menu (Text, Note, Callout, …): create opens an editor; switching to
 *   Cross mid-edit cancels the tool so text never sticks.
 */

const DEFER_ONE_SHOT = new Set([
  // Multipoint strokes
  "path",
  "polyline",
  "brush",
  "highlighter",
  "linetoolpath",
  "linetoolpolyline",
  "linetoolbrush",
  "linetoolhighlighter",
  // Text menu
  "text",
  "anchored_text",
  "note",
  "anchored_note",
  "callout",
  "comment",
  "price_label",
  "price_note",
  "signpost",
  "balloon",
  "emoji",
  "sticker",
  "icon",
  "flag",
  "linetooltext",
  "linetoolanchoredtext",
  "linetoolnote",
  "linetoolanchorednote",
  "linetoolcallout",
  "linetoolcomment",
  "linetoolpricelabel",
  "linetoolpricenote",
  "linetoolsignpost",
  "linetoolballoon",
  "linetoolemoji",
  "linetoolsticker",
  "linetoolicon",
  "linetoolflag",
]);

function normalizeToolKey(tool: string): string {
  return tool.trim().toLowerCase().replace(/[\s-]+/g, "");
}

/** True when Cross reset would cut off an in-progress text/multipoint tool. */
export function isOpenEndedDrawingTool(tool: string | null | undefined): boolean {
  if (!tool) return false;
  const key = normalizeToolKey(tool);
  if (DEFER_ONE_SHOT.has(key)) return true;
  const stripped = key.replace(/^linetool/, "");
  return DEFER_ONE_SHOT.has(stripped);
}

/** Text flyout tools (for audits / tests). */
export const TEXT_MENU_TOOLS = [
  "text",
  "anchored_text",
  "note",
  "anchored_note",
  "callout",
  "comment",
  "price_label",
  "price_note",
  "signpost",
] as const;
