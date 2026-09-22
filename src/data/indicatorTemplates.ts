import type { ChartSource, IndicatorInstance, IndicatorKind, Interval, LineStyle } from "../engine/types";
import { loadJson, saveJson } from "../persist";

const STORAGE_KEY = "forge.indicatorTemplates";
const ACTIVE_KEY = "forge.activeIndicatorTemplateId";

export type IndicatorTemplateItem = {
  kind: IndicatorKind;
  params: number[];
  visible: boolean;
  color: string;
  lineWidth?: number;
  lineStyle?: LineStyle;
  source?: ChartSource;
  pane?: IndicatorInstance["pane"];
};

export type IndicatorTemplate = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  indicators: IndicatorTemplateItem[];
  /** When both set, auto-apply on matching symbol + interval. */
  bindSymbol: string | null;
  bindInterval: Interval | null;
};

function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function defaultTemplates(): IndicatorTemplate[] {
  const now = Date.now();
  return [
    {
      id: "tpl_ma_default",
      name: "Moving averages",
      createdAt: now,
      updatedAt: now,
      bindSymbol: null,
      bindInterval: null,
      indicators: [
        { kind: "vol", params: [], visible: true, color: "#787b86", pane: "volume" },
        { kind: "sma", params: [20], visible: true, color: "#2962ff", pane: "main" },
        { kind: "ema", params: [50], visible: true, color: "#ff6d00", pane: "main" },
      ],
    },
    {
      id: "tpl_osc_default",
      name: "Oscillators",
      createdAt: now,
      updatedAt: now,
      bindSymbol: null,
      bindInterval: null,
      indicators: [
        { kind: "vol", params: [], visible: true, color: "#787b86", pane: "volume" },
        { kind: "rsi", params: [14], visible: true, color: "#7b1fa2", pane: "rsi" },
        { kind: "macd", params: [12, 26, 9], visible: true, color: "#2962ff", pane: "macd" },
      ],
    },
  ];
}

export function loadTemplates(): IndicatorTemplate[] {
  const saved = loadJson<IndicatorTemplate[] | null>(STORAGE_KEY, null);
  if (!saved?.length) {
    const seeded = defaultTemplates();
    saveJson(STORAGE_KEY, seeded);
    return seeded;
  }
  return saved.map((tpl) => ({
    ...tpl,
    bindSymbol: tpl.bindSymbol ?? null,
    bindInterval: tpl.bindInterval ?? null,
    indicators: Array.isArray(tpl.indicators) ? tpl.indicators : [],
  }));
}

export function saveTemplates(templates: IndicatorTemplate[]): void {
  saveJson(STORAGE_KEY, templates);
}

export function loadActiveTemplateId(): string | null {
  return loadJson<string | null>(ACTIVE_KEY, null);
}

export function saveActiveTemplateId(id: string | null): void {
  saveJson(ACTIVE_KEY, id);
}

export function snapshotIndicators(indicators: IndicatorInstance[]): IndicatorTemplateItem[] {
  return indicators.map((ind) => ({
    kind: ind.kind,
    params: [...ind.params],
    visible: ind.visible,
    color: ind.color,
    lineWidth: ind.lineWidth,
    lineStyle: ind.lineStyle,
    source: ind.source,
    pane: ind.pane,
  }));
}

export function createTemplate(input: {
  name: string;
  indicators: IndicatorInstance[];
  bindSymbol?: string | null;
  bindInterval?: Interval | null;
}): IndicatorTemplate {
  const now = Date.now();
  return {
    id: uid("tpl"),
    name: input.name.trim() || "Untitled template",
    createdAt: now,
    updatedAt: now,
    indicators: snapshotIndicators(input.indicators),
    bindSymbol: input.bindSymbol ?? null,
    bindInterval: input.bindInterval ?? null,
  };
}

export function findBoundTemplate(
  templates: IndicatorTemplate[],
  symbol: string,
  interval: Interval,
): IndicatorTemplate | null {
  return (
    templates.find(
      (tpl) => tpl.bindSymbol === symbol && tpl.bindInterval === interval && tpl.indicators.length > 0,
    ) ?? null
  );
}

export function templateSummary(tpl: IndicatorTemplate): string {
  const kinds = tpl.indicators.map((i) => i.kind.toUpperCase()).join(", ");
  if (tpl.bindSymbol && tpl.bindInterval) {
    return `${kinds || "Empty"} · ${tpl.bindSymbol} · ${tpl.bindInterval}`;
  }
  return kinds || "Empty";
}
