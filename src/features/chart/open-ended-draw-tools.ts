/**
 * Multipoint tools that fire `drawing_event` "create" on the first click
 * but keep collecting points until the user finishes (double-click / Escape).
 * One-shot Cross reset must NOT run on that early create.
 */

const OPEN_ENDED = new Set([
  "path",
  "polyline",
  "brush",
  "highlighter",
  "linetoolpath",
  "linetoolpolyline",
  "linetoolbrush",
  "linetoolhighlighter",
]);

/** True when the active (or hinted) line tool is still collecting points. */
export function isOpenEndedDrawingTool(tool: string | null | undefined): boolean {
  if (!tool) return false;
  const key = tool.trim().toLowerCase().replace(/[\s-]+/g, "");
  if (OPEN_ENDED.has(key)) return true;
  const stripped = key.replace(/^linetool/, "");
  return OPEN_ENDED.has(stripped);
}
