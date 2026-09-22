import type { KeyValueStorage } from "@/application";
import type {
  ChartData,
  ChartMetaInfo,
  ChartTemplate,
  ChartTemplateContent,
  IExternalSaveLoadAdapter,
  LineToolsAndGroupsLoadRequestContext,
  LineToolsAndGroupsLoadRequestType,
  LineToolsAndGroupsState,
  StudyTemplateData,
  StudyTemplateMetaInfo,
} from "./types";

const KEYS = {
  charts: "forge.tv.charts",
  studyTemplates: "forge.tv.studyTemplates",
  drawingTemplates: "forge.tv.drawingTemplates",
  chartTemplates: "forge.tv.chartTemplates",
  lineTools: "forge.tv.lineTools",
} as const;

type DrawingTemplates = Record<string, Record<string, string>>;
type ChartTemplates = Record<string, ChartTemplateContent>;

/** JSON-friendly shape of `LineToolsAndGroupsState` (which uses `Map`s). */
interface SerializedLineTools {
  sources: Array<[string, unknown]> | null;
  groups: Array<[string, unknown]>;
  symbol?: string;
}

function serializeLineTools(state: LineToolsAndGroupsState): SerializedLineTools {
  return {
    sources: state.sources ? [...state.sources.entries()] : null,
    groups: [...state.groups.entries()],
    symbol: state.symbol,
  };
}

function omitKey<T extends Record<string, unknown>>(record: T, key: string): T {
  return Object.fromEntries(Object.entries(record).filter(([k]) => k !== key)) as T;
}

function deserializeLineTools(data: SerializedLineTools): Partial<LineToolsAndGroupsState> {
  return {
    sources: data.sources ? (new Map(data.sources) as LineToolsAndGroupsState["sources"]) : null,
    groups: new Map(data.groups) as LineToolsAndGroupsState["groups"],
    symbol: data.symbol,
  };
}

/**
 * Implements TradingView's save/load contract on top of `KeyValueStorage`, so
 * layouts, study templates and drawings survive reloads with no backend.
 */
export class LocalSaveLoadAdapter implements IExternalSaveLoadAdapter {
  constructor(private readonly storage: KeyValueStorage) {}

  /* ── chart layouts ─────────────────────────────────────────────────── */

  async getAllCharts(): Promise<ChartMetaInfo[]> {
    return this.charts().map(({ id, name, symbol, resolution, timestamp }) => ({
      id: id!,
      name,
      symbol,
      resolution,
      timestamp,
    }));
  }

  async removeChart(id: string | number): Promise<void> {
    this.storage.set(
      KEYS.charts,
      this.charts().filter((c) => c.id !== id),
    );
  }

  async saveChart(chartData: ChartData): Promise<string | number> {
    const id = chartData.id ?? Date.now().toString(36);
    const record: ChartData = { ...chartData, id, timestamp: Math.round(Date.now() / 1000) };
    this.storage.set(KEYS.charts, [...this.charts().filter((c) => c.id !== id), record]);
    return id;
  }

  async getChartContent(chartId: number | string): Promise<string> {
    const chart = this.charts().find((c) => c.id === chartId);
    if (!chart) throw new Error(`Chart ${chartId} not found`);
    return chart.content;
  }

  /* ── study templates ───────────────────────────────────────────────── */

  async getAllStudyTemplates(): Promise<StudyTemplateMetaInfo[]> {
    return this.studyTemplates().map(({ name }) => ({ name }));
  }

  async removeStudyTemplate({ name }: StudyTemplateMetaInfo): Promise<void> {
    this.storage.set(
      KEYS.studyTemplates,
      this.studyTemplates().filter((t) => t.name !== name),
    );
  }

  async saveStudyTemplate(template: StudyTemplateData): Promise<void> {
    this.storage.set(KEYS.studyTemplates, [...this.studyTemplates().filter((t) => t.name !== template.name), template]);
  }

  async getStudyTemplateContent({ name }: StudyTemplateMetaInfo): Promise<string> {
    const template = this.studyTemplates().find((t) => t.name === name);
    if (!template) throw new Error(`Study template "${name}" not found`);
    return template.content;
  }

  /* ── drawing templates ─────────────────────────────────────────────── */

  async getDrawingTemplates(toolName: string): Promise<string[]> {
    return Object.keys(this.drawingTemplates()[toolName] ?? {});
  }

  async loadDrawingTemplate(toolName: string, templateName: string): Promise<string> {
    const content = this.drawingTemplates()[toolName]?.[templateName];
    if (content === undefined) throw new Error(`Drawing template "${templateName}" not found`);
    return content;
  }

  async removeDrawingTemplate(toolName: string, templateName: string): Promise<void> {
    const all = this.drawingTemplates();
    this.storage.set(KEYS.drawingTemplates, { ...all, [toolName]: omitKey(all[toolName] ?? {}, templateName) });
  }

  async saveDrawingTemplate(toolName: string, templateName: string, content: string): Promise<void> {
    const all = this.drawingTemplates();
    this.storage.set(KEYS.drawingTemplates, { ...all, [toolName]: { ...all[toolName], [templateName]: content } });
  }

  /* ── chart templates (themes) ──────────────────────────────────────── */

  async getChartTemplateContent(templateName: string): Promise<ChartTemplate> {
    return { content: this.chartTemplates()[templateName] };
  }

  async getAllChartTemplates(): Promise<string[]> {
    return Object.keys(this.chartTemplates());
  }

  async saveChartTemplate(newName: string, theme: ChartTemplateContent): Promise<void> {
    this.storage.set(KEYS.chartTemplates, { ...this.chartTemplates(), [newName]: theme });
  }

  async removeChartTemplate(templateName: string): Promise<void> {
    this.storage.set(KEYS.chartTemplates, omitKey(this.chartTemplates(), templateName));
  }

  /* ── drawings per layout ───────────────────────────────────────────── */

  async saveLineToolsAndGroups(
    layoutId: string | undefined,
    chartId: string | number,
    state: LineToolsAndGroupsState,
  ): Promise<void> {
    const all = this.storage.get<Record<string, SerializedLineTools>>(KEYS.lineTools, {});
    this.storage.set(KEYS.lineTools, { ...all, [this.lineToolsKey(layoutId, chartId)]: serializeLineTools(state) });
  }

  async loadLineToolsAndGroups(
    layoutId: string | undefined,
    chartId: string | number,
    _requestType: LineToolsAndGroupsLoadRequestType,
    _context: LineToolsAndGroupsLoadRequestContext,
  ): Promise<Partial<LineToolsAndGroupsState> | null> {
    const all = this.storage.get<Record<string, SerializedLineTools>>(KEYS.lineTools, {});
    const stored = all[this.lineToolsKey(layoutId, chartId)];
    return stored ? deserializeLineTools(stored) : null;
  }

  /* ── internals ─────────────────────────────────────────────────────── */

  private charts(): ChartData[] {
    return this.storage.get<ChartData[]>(KEYS.charts, []);
  }

  private studyTemplates(): StudyTemplateData[] {
    return this.storage.get<StudyTemplateData[]>(KEYS.studyTemplates, []);
  }

  private drawingTemplates(): DrawingTemplates {
    return this.storage.get<DrawingTemplates>(KEYS.drawingTemplates, {});
  }

  private chartTemplates(): ChartTemplates {
    return this.storage.get<ChartTemplates>(KEYS.chartTemplates, {});
  }

  private lineToolsKey(layoutId: string | undefined, chartId: string | number): string {
    return `${layoutId ?? "default"}::${chartId}`;
  }
}
