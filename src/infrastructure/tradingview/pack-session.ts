/**
 * Charting Library treats 1800-1700 / TSE cash hours as wall-clock sessions
 * and reserves empty slots for nights, weekends, and the NY 17:00–18:00
 * break. Live symbol info is 24x7; saved layouts have to match.
 */
export function packLibrarySessionJson(json: string): string {
  if (!json.includes("0900-1230") && !json.includes("1800-1700")) return json;
  return json
    .replaceAll("0900-1230:71234", "24x7")
    .replaceAll("0900-1230", "24x7")
    .replaceAll("1800-1700:123456", "24x7")
    .replaceAll("1800-1700:12345", "24x7")
    .replaceAll("1800-1700", "24x7");
}

export function packSavedChartState(saved: object | undefined): object | undefined {
  if (!saved) return saved;
  try {
    return JSON.parse(packLibrarySessionJson(JSON.stringify(saved))) as object;
  } catch {
    return saved;
  }
}
