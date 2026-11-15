/**
 * Pack / unpack the per-account chart state that must look identical on every PC.
 */

import type { KeyValueStorage, Settings } from "@/application";
import { LAYOUT_STAMP_KEY, sanitizeSettings } from "@/application";
import {
  CURRENT_LAYOUT_KEY,
  isPlaceholderLayoutName,
  mergeLineToolStores,
} from "@/infrastructure/tradingview/local-save-load-adapter";
import {
  USER_SETTINGS_KEY,
  USER_SETTINGS_META_KEY,
  mergeUserSettings,
  readSettingsStamps,
  readUserSettings,
  writeSettingsStamps,
  writeUserSettings,
  type SettingsStamp,
} from "./settings-adapter";

export const PROFILE_BLOB_KEYS = [
  "forge.settings.v1",
  "forge.tv.autosave.v3",
  "forge.tv.autosave.v3.bak",
  "forge.tv.autosave.v3.pane.1",
  "forge.tv.autosave.v3.pane.2",
  "forge.tv.autosave.v3.pane.3",
  "forge.tv.autosave.v3.pane.4",
  "forge.tv.autosave.v3.pane.5",
  "forge.tv.autosave.v3.pane.6",
  "forge.tv.autosave.v3.pane.7",
  "forge.tv.charts",
  CURRENT_LAYOUT_KEY,
  LAYOUT_STAMP_KEY,
  "forge.tv.studyTemplates",
  "forge.tv.drawingTemplates",
  "forge.tv.chartTemplates",
  "forge.tv.lineTools",
  USER_SETTINGS_KEY,
  USER_SETTINGS_META_KEY,
  // Own-account safety PII only — scoped storage + syncKey gate keep it private.
  "forge.auth.safetyProfile.v1",
] as const;

export type ProfileBlobKey = (typeof PROFILE_BLOB_KEYS)[number];

export interface ProfilePayload {
  readonly version: 1;
  readonly keys: Partial<Record<ProfileBlobKey, unknown>>;
}

export interface LocalProfileStamp {
  readonly updatedAt: number;
}

const STAMP_KEY = "forge.profile.sync.stamp.v1";

export function readLocalStamp(storage: KeyValueStorage): number {
  const raw = storage.get<LocalProfileStamp | null>(STAMP_KEY, null);
  return raw && Number.isFinite(raw.updatedAt) ? Number(raw.updatedAt) : 0;
}

export function touchLocalStamp(storage: KeyValueStorage, at = Date.now()): number {
  storage.set(STAMP_KEY, { updatedAt: at } satisfies LocalProfileStamp);
  return at;
}

export function collectProfilePayload(storage: KeyValueStorage): ProfilePayload {
  const keys: Partial<Record<ProfileBlobKey, unknown>> = {};
  for (const key of PROFILE_BLOB_KEYS) {
    if (key === USER_SETTINGS_KEY) {
      keys[key] = readUserSettings(storage);
      continue;
    }
    try {
      const value = storage.get<unknown>(key, undefined);
      if (value !== undefined) keys[key] = value;
    } catch {
      /* ignore */
    }
  }
  return { version: 1, keys };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** Union of drawing templates. The other computer's copy wins when both saved the same name. */
export function mergeDrawingTemplates(local: unknown, remote: unknown): Record<string, Record<string, string>> {
  const left = asRecord(local) ?? {};
  const right = asRecord(remote) ?? {};
  const out: Record<string, Record<string, string>> = {};
  for (const tool of new Set([...Object.keys(left), ...Object.keys(right)])) {
    const localTool = asRecord(left[tool]) ?? {};
    const remoteTool = asRecord(right[tool]) ?? {};
    const templates: Record<string, string> = {};
    for (const name of new Set([...Object.keys(localTool), ...Object.keys(remoteTool)])) {
      const chosen = remoteTool[name] !== undefined ? remoteTool[name] : localTool[name];
      if (typeof chosen === "string") templates[name] = chosen;
    }
    out[tool] = templates;
  }
  return out;
}

function asSettingsMap(value: unknown): Record<string, string> {
  const record = asRecord(value);
  if (!record) return {};
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(record)) {
    if (typeof entry === "string") out[key] = entry;
  }
  return out;
}

const PANE_AUTOSAVE_KEYS = [
  "forge.tv.autosave.v3.pane.1",
  "forge.tv.autosave.v3.pane.2",
  "forge.tv.autosave.v3.pane.3",
  "forge.tv.autosave.v3.pane.4",
  "forge.tv.autosave.v3.pane.5",
  "forge.tv.autosave.v3.pane.6",
  "forge.tv.autosave.v3.pane.7",
] as const;

const LAYOUT_MERGE_KEYS = new Set<string>([
  "forge.settings.v1",
  "forge.tv.charts",
  CURRENT_LAYOUT_KEY,
  LAYOUT_STAMP_KEY,
  ...PANE_AUTOSAVE_KEYS,
]);

interface SavedChartRecord {
  id?: string | number;
  name?: string;
  content?: string;
  symbol?: string;
  resolution?: string;
  timestamp?: number;
}

interface CurrentLayoutRef {
  id: string | number;
  name: string;
}

function asCharts(value: unknown): SavedChartRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is SavedChartRecord => Boolean(item) && typeof item === "object");
}

function chartContent(chart: SavedChartRecord | undefined): string {
  return typeof chart?.content === "string" ? chart.content.trim() : "";
}

function chartTimestamp(chart: SavedChartRecord | undefined): number {
  const ts = Number(chart?.timestamp);
  return Number.isFinite(ts) ? ts : 0;
}

function namedChart(chart: SavedChartRecord): boolean {
  const name = typeof chart.name === "string" ? chart.name.trim() : "";
  return Boolean(name) && !isPlaceholderLayoutName(name) && chartContent(chart).length > 2;
}

/** Keep every named layout. The same name keeps the newer save, and never an empty body. */
export function mergeSavedCharts(local: unknown, remote: unknown): SavedChartRecord[] {
  const byKey = new Map<string, SavedChartRecord>();
  const take = (chart: SavedChartRecord) => {
    const name = typeof chart.name === "string" ? chart.name.trim().toLowerCase() : "";
    const key = name && !isPlaceholderLayoutName(name)
      ? `name:${name}`
      : chart.id != null
        ? `id:${chart.id}`
        : "";
    if (!key) return;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, chart);
      return;
    }
    const newer = chartTimestamp(chart) >= chartTimestamp(prev) ? chart : prev;
    const older = newer === chart ? prev : chart;
    const content = chartContent(newer).length > 2 ? chartContent(newer) : chartContent(older);
    byKey.set(key, { ...newer, content });
  };
  for (const chart of asCharts(local)) take(chart);
  for (const chart of asCharts(remote)) take(chart);
  return [...byKey.values()];
}

function asCurrentLayout(value: unknown): CurrentLayoutRef | null {
  const record = asRecord(value);
  if (!record || record.id == null || typeof record.name !== "string") return null;
  if (isPlaceholderLayoutName(record.name)) return null;
  return { id: record.id as string | number, name: record.name };
}

export function chooseCurrentLayout(
  local: unknown,
  remote: unknown,
  charts: readonly SavedChartRecord[],
): CurrentLayoutRef | null {
  const findChart = (ref: CurrentLayoutRef | null) =>
    ref
      ? charts.find((chart) => String(chart.id) === String(ref.id) || chart.name === ref.name)
      : undefined;
  const localRef = asCurrentLayout(local);
  const remoteRef = asCurrentLayout(remote);
  const localChart = findChart(localRef);
  const remoteChart = findChart(remoteRef);
  if (remoteRef && remoteChart && (!localRef || !localChart || chartTimestamp(remoteChart) >= chartTimestamp(localChart))) {
    return { id: remoteChart.id ?? remoteRef.id, name: remoteChart.name || remoteRef.name };
  }
  if (localRef && localChart) return { id: localChart.id ?? localRef.id, name: localChart.name || localRef.name };
  const newest = charts
    .filter(namedChart)
    .sort((a, b) => chartTimestamp(b) - chartTimestamp(a))[0];
  return newest && newest.id != null && newest.name ? { id: newest.id, name: newest.name } : null;
}

function readLayoutStamp(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function pickLayoutSettings(local: Settings, remote: Settings, localAt: number, remoteAt: number): Settings {
  if (remoteAt > localAt) return remote;
  if (localAt > remoteAt) return local;
  // Nobody stamped a change. A real multi-chart arrangement beats the default single chart.
  if (local.chartLayout === "s" && remote.chartLayout !== "s") return remote;
  if (remote.chartLayout === "s" && local.chartLayout !== "s") return local;
  return remote;
}

function unionWatchlist(local: readonly string[], remote: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const ticker of [...remote, ...local]) {
    if (!ticker || seen.has(ticker)) continue;
    seen.add(ticker);
    out.push(ticker);
  }
  return out;
}

function parseChartBody(content: string): object | null {
  if (!content || content === "{}" || content === "null") return null;
  try {
    const parsed = JSON.parse(content) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as object) : null;
  } catch {
    return null;
  }
}

/**
 * Bring the saved layout (Mohammad) and the layer arrangement across.
 * Returns true when this computer should reload the chart to show them.
 */
export function mergeAccountLayout(
  storage: KeyValueStorage,
  remoteKeys: Partial<Record<string, unknown>> | null | undefined,
  preferRemoteBase: boolean,
): boolean {
  if (!remoteKeys) return false;
  const layoutSnapshot = () => {
    const settings = asRecord(storage.get("forge.settings.v1", null));
    return {
      layout: settings?.chartLayout ?? null,
      panes: settings?.paneSymbols ?? null,
      current: storage.get(CURRENT_LAYOUT_KEY, null),
      charts: asCharts(storage.get("forge.tv.charts", [])).map((chart) => [chart.id, chart.name, chartTimestamp(chart)]),
    };
  };
  const before = JSON.stringify(layoutSnapshot());
  const charts = mergeSavedCharts(storage.get("forge.tv.charts", []), remoteKeys["forge.tv.charts"]);
  storage.set("forge.tv.charts", charts);
  const chosen = chooseCurrentLayout(
    storage.get(CURRENT_LAYOUT_KEY, null),
    remoteKeys[CURRENT_LAYOUT_KEY],
    charts,
  );
  const previous = asCurrentLayout(storage.get(CURRENT_LAYOUT_KEY, null));
  if (chosen) storage.set(CURRENT_LAYOUT_KEY, chosen);

  const localSettings = sanitizeSettings(storage.get("forge.settings.v1", {}));
  const remoteSettingsRaw = remoteKeys["forge.settings.v1"];
  const remoteSettings = remoteSettingsRaw && typeof remoteSettingsRaw === "object"
    ? sanitizeSettings(remoteSettingsRaw)
    : localSettings;
  const layoutSide = pickLayoutSettings(
    localSettings,
    remoteSettings,
    readLayoutStamp(storage.get(LAYOUT_STAMP_KEY, 0)),
    readLayoutStamp(remoteKeys[LAYOUT_STAMP_KEY]),
  );
  const base = preferRemoteBase ? { ...localSettings, ...remoteSettings } : { ...remoteSettings, ...localSettings };
  const chosenChart = chosen
    ? charts.find((item) => String(item.id) === String(chosen.id) || item.name === chosen.name)
    : undefined;
  const savedLayers = asRecord((chosenChart as { forgeLayout?: unknown } | undefined)?.forgeLayout);
  const merged = sanitizeSettings({
    ...base,
    chartLayout: savedLayers?.chartLayout ?? layoutSide.chartLayout,
    paneSymbols: savedLayers?.paneSymbols ?? layoutSide.paneSymbols,
    layoutSync: savedLayers?.layoutSync ?? layoutSide.layoutSync,
    watchlist: unionWatchlist(localSettings.watchlist, remoteSettings.watchlist),
  });
  storage.set("forge.settings.v1", merged);
  const remoteStamp = readLayoutStamp(remoteKeys[LAYOUT_STAMP_KEY]);
  const localStamp = readLayoutStamp(storage.get(LAYOUT_STAMP_KEY, 0));
  if (remoteStamp > localStamp) storage.set(LAYOUT_STAMP_KEY, remoteStamp);

  const remoteLayoutWins = layoutSide === remoteSettings && remoteSettings !== localSettings;
  for (const key of PANE_AUTOSAVE_KEYS) {
    const remotePane = remoteKeys[key];
    if (remotePane === undefined) continue;
    if (remoteLayoutWins || storage.get(key, undefined) === undefined) storage.set(key, remotePane);
  }

  const currentChanged = !previous || !chosen || String(previous.id) !== String(chosen.id) || previous.name !== chosen.name;
  if (currentChanged && chosen) {
    const body = parseChartBody(chartContent(chosenChart));
    if (body) {
      storage.set("forge.tv.autosave.v3", body);
      storage.set("forge.tv.autosave.v3.bak", body);
    }
  }

  return before !== JSON.stringify(layoutSnapshot());
}

function asStamps(value: unknown): SettingsStamp {
  const record = asRecord(value);
  if (!record) return {};
  const out: SettingsStamp = {};
  for (const [key, entry] of Object.entries(record)) {
    if (typeof entry === "number" && Number.isFinite(entry)) out[key] = entry;
  }
  return out;
}

export function applyProfilePayload(
  storage: KeyValueStorage,
  payload: ProfilePayload | null | undefined,
): void {
  if (!payload || payload.version !== 1 || !payload.keys) return;
  for (const key of PROFILE_BLOB_KEYS) {
    if (!(key in payload.keys)) continue;
    const value = payload.keys[key];
    if (value === undefined) continue;
    if (key === USER_SETTINGS_KEY || key === USER_SETTINGS_META_KEY || LAYOUT_MERGE_KEYS.has(key)) {
      continue;
    }
    try {
      if (key === "forge.tv.lineTools") {
        // Union with this device so a phone trendline is not dropped by a newer computer save.
        storage.set(key, mergeLineToolStores(storage.get(key, {}), value));
        continue;
      }
      if (key === "forge.tv.drawingTemplates") {
        storage.set(key, mergeDrawingTemplates(storage.get(key, {}), value));
        continue;
      }
      storage.set(key, value);
    } catch {
      /* ignore */
    }
  }
  if (USER_SETTINGS_KEY in payload.keys || USER_SETTINGS_META_KEY in payload.keys) {
    const merged = mergeUserSettings(
      readUserSettings(storage),
      asSettingsMap(payload.keys[USER_SETTINGS_KEY]),
      readSettingsStamps(storage),
      asStamps(payload.keys[USER_SETTINGS_META_KEY]),
    );
    writeUserSettings(storage, merged.map);
    writeSettingsStamps(storage, merged.stamps);
  }
  mergeAccountLayout(storage, payload.keys, true);
}
