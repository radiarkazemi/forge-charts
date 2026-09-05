import { loadJson, saveJson } from "../persist";
import type { CanvasSettings, ChartStyle, ChartType, Theme } from "../engine/types";

export type SettingsTemplate = {
  id: string;
  name: string;
  updatedAt: number;
  chartStyle: ChartStyle;
  canvas: CanvasSettings;
  chartType?: ChartType;
  logScale?: boolean;
  percentScale?: boolean;
  indexedScale?: boolean;
  theme?: Theme;
};

const KEY = "forge.settingsTemplates";

export function loadSettingsTemplates(): SettingsTemplate[] {
  return loadJson<SettingsTemplate[]>(KEY, []);
}

export function saveSettingsTemplate(tpl: SettingsTemplate): void {
  const rows = loadSettingsTemplates().filter((r) => r.id !== tpl.id);
  saveJson(KEY, [tpl, ...rows]);
}

export function deleteSettingsTemplate(id: string): void {
  saveJson(
    KEY,
    loadSettingsTemplates().filter((r) => r.id !== id),
  );
}
