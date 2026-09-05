import { loadJson, saveJson } from "../persist";
import type { CanvasSettings, ChartStyle, ChartType, Drawing, IndicatorInstance, Interval } from "../engine/types";
import type { LayoutArrangement } from "../ui/LayoutMenu";

/** Full per-pane chart state (TV-style chart layout contents). */
export type PaneProfile = {
  symbol: string;
  interval: Interval;
  chartType: ChartType;
  chartStyle?: Partial<ChartStyle>;
  canvas?: Partial<CanvasSettings>;
  indicators: IndicatorInstance[];
  drawings: Drawing[];
  viewCount?: number;
  viewEnd?: number;
  followLive?: boolean;
  logScale?: boolean;
  percentScale?: boolean;
  theme?: "dark" | "light";
};

export type WorkspaceProfile = {
  version: 1;
  name: string;
  updatedAt: number;
  arrangement: LayoutArrangement;
  activePane: number;
  syncCrosshair: boolean;
  syncInterval: boolean;
  syncSymbol: boolean;
  panes: PaneProfile[];
};

const WORKSPACE_KEY = "forge.workspaceProfile";
const WORKSPACE_LIST_KEY = "forge.workspaceProfiles";
const ACTIVE_WORKSPACE_KEY = "forge.activeWorkspaceId";

export type NamedWorkspace = WorkspaceProfile & { id: string };

export function loadWorkspaceProfile(): WorkspaceProfile | null {
  return loadJson<WorkspaceProfile | null>(WORKSPACE_KEY, null);
}

export function saveWorkspaceProfile(profile: WorkspaceProfile): void {
  saveJson(WORKSPACE_KEY, { ...profile, updatedAt: Date.now() });
}

export function loadNamedWorkspaces(): NamedWorkspace[] {
  return loadJson<NamedWorkspace[]>(WORKSPACE_LIST_KEY, []);
}

export function saveNamedWorkspaces(rows: NamedWorkspace[]): void {
  saveJson(WORKSPACE_LIST_KEY, rows);
}

export function loadActiveWorkspaceId(): string | null {
  return loadJson<string | null>(ACTIVE_WORKSPACE_KEY, null);
}

export function saveActiveWorkspaceId(id: string | null): void {
  saveJson(ACTIVE_WORKSPACE_KEY, id);
}

export function upsertNamedWorkspace(profile: WorkspaceProfile, id?: string): NamedWorkspace {
  const rows = loadNamedWorkspaces();
  const nextId = id ?? `ws_${Math.random().toString(36).slice(2, 9)}`;
  const named: NamedWorkspace = { ...profile, id: nextId, updatedAt: Date.now() };
  const next = [named, ...rows.filter((r) => r.id !== nextId)];
  saveNamedWorkspaces(next);
  saveActiveWorkspaceId(nextId);
  saveWorkspaceProfile(named);
  return named;
}

export function deleteNamedWorkspace(id: string): void {
  const next = loadNamedWorkspaces().filter((r) => r.id !== id);
  saveNamedWorkspaces(next);
  if (loadActiveWorkspaceId() === id) saveActiveWorkspaceId(next[0]?.id ?? null);
}

export function exportWorkspaceJson(profile: WorkspaceProfile): string {
  return JSON.stringify(profile, null, 2);
}

export function importWorkspaceJson(raw: string): WorkspaceProfile | null {
  try {
    const parsed = JSON.parse(raw) as WorkspaceProfile;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.panes)) return null;
    return parsed;
  } catch {
    return null;
  }
}
