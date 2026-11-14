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

type LineToolStore = Record<string, SerializedLineTools>;

/** Broker + ticker, so FOREXCOM:XAUUSD does not mix with OANDA:XAUUSD. */
export function drawingSymbolKey(symbol: string | null | undefined): string {
  return (symbol ?? "").trim().toUpperCase();
}

function symbolBucket(symbol: string): string {
  return `symbol::${drawingSymbolKey(symbol)}`;
}

function exchangeOf(symbol: string): string {
  const key = drawingSymbolKey(symbol);
  const colon = key.lastIndexOf(":");
  return colon > 0 ? key.slice(0, colon) : "";
}

function tickerOf(symbol: string): string {
  const key = drawingSymbolKey(symbol);
  const colon = key.lastIndexOf(":");
  return colon >= 0 ? key.slice(colon + 1) : key;
}

/** Same ticker. Two different brokers never match. A missing broker still matches that ticker. */
export function drawingSymbolsMatch(
  stored: string | null | undefined,
  requested: string | null | undefined,
): boolean {
  const left = drawingSymbolKey(stored);
  const right = drawingSymbolKey(requested);
  if (!left || !right) return false;
  if (left === right) return true;
  if (tickerOf(left) !== tickerOf(right)) return false;
  const leftEx = exchangeOf(left);
  const rightEx = exchangeOf(right);
  if (leftEx && rightEx) return leftEx === rightEx;
  return true;
}

/** Keep the broker when either side has it. */
function preferSymbol(toolSymbol: string, stateSymbol: string): string {
  if (exchangeOf(stateSymbol) && !exchangeOf(toolSymbol)) return stateSymbol;
  if (exchangeOf(toolSymbol) && !exchangeOf(stateSymbol)) return toolSymbol;
  return toolSymbol || stateSymbol;
}

function bucketLabel(key: string, bucket: SerializedLineTools): string {
  return drawingSymbolKey(bucket.symbol) || (key.startsWith("symbol::") ? key.slice("symbol::".length) : "");
}

function bucketsForSymbol(all: LineToolStore, want: string): SerializedLineTools[] {
  const hits: Array<{ label: string; bucket: SerializedLineTools }> = [];
  for (const [key, bucket] of Object.entries(all)) {
    const label = bucketLabel(key, bucket);
    if (!label || !drawingSymbolsMatch(label, want)) continue;
    hits.push({ label, bucket });
  }
  if (!exchangeOf(want)) {
    const exchanges = new Set(hits.map((hit) => exchangeOf(hit.label)).filter(Boolean));
    if (exchanges.size > 1) {
      return hits.filter((hit) => !exchangeOf(hit.label)).map((hit) => hit.bucket);
    }
  }
  return hits.map((hit) => hit.bucket);
}

/** Remote nulls delete. Otherwise the later entry wins. Same id from both devices is kept. */
export function mergeLineToolBuckets(
  local: SerializedLineTools | undefined,
  remote: SerializedLineTools | undefined,
): SerializedLineTools {
  const sources = new Map<string, unknown>();
  const groups = new Map<string, unknown>();
  const apply = (bucket: SerializedLineTools | undefined, overwrite: boolean) => {
    if (!bucket) return;
    for (const [id, value] of bucket.sources ?? []) {
      if (value == null) sources.delete(id);
      else if (overwrite || !sources.has(id)) sources.set(id, value);
    }
    for (const [id, value] of bucket.groups ?? []) {
      if (value == null) groups.delete(id);
      else if (overwrite || !groups.has(id)) groups.set(id, value);
    }
  };
  apply(local, true);
  apply(remote, true);
  const byId = (entries: Array<[string, unknown]>) =>
    entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return {
    sources: byId([...sources.entries()]),
    groups: byId([...groups.entries()]),
    symbol: remote?.symbol || local?.symbol,
  };
}

/** Keep every symbol's drawings from both devices. A drawing id only drops when the newer copy says it was deleted. */
export function mergeLineToolStores(local: unknown, remote: unknown): LineToolStore {
  const left = asLineToolStore(local);
  const right = asLineToolStore(remote);
  const out: LineToolStore = {};
  for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
    out[key] = mergeLineToolBuckets(left[key], right[key]);
  }
  return out;
}

function asLineToolStore(value: unknown): LineToolStore {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as LineToolStore;
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

/** Stable id for the user’s primary named layout. */
export const RADIAR_LAYOUT_ID = "radiar-layout";
export const RADIAR_LAYOUT_NAME = "Radiar";

/**
 * Implements TradingView's save/load contract on top of `KeyValueStorage`, so
 * layouts, study templates and drawings survive reloads with no backend.
 */
export class LocalSaveLoadAdapter implements IExternalSaveLoadAdapter {
  private onChange: (() => void) | null = null;

  constructor(private readonly storage: KeyValueStorage) {
    this.ensureRadiarLayoutMeta();
  }

  /** Fired after drawings change so the account can push them to the other device. */
  setOnChange(listener: (() => void) | null): void {
    this.onChange = listener;
  }

  /** Ensure a named “Radiar” layout always exists in Open layout… */
  private ensureRadiarLayoutMeta(): void {
    try {
      const list = this.charts();
      if (list.some((c) => c.id === RADIAR_LAYOUT_ID || c.name === RADIAR_LAYOUT_NAME)) return;
      const record: ChartData = {
        id: RADIAR_LAYOUT_ID,
        name: RADIAR_LAYOUT_NAME,
        symbol: "XAUUSD",
        resolution: "15" as never,
        content: "",
        timestamp: Math.round(Date.now() / 1000),
      };
      this.storage.set(KEYS.charts, [...list, record]);
    } catch {
      /* ignore */
    }
  }

  /* ── chart layouts ─────────────────────────────────────────────────── */

  async getAllCharts(): Promise<ChartMetaInfo[]> {
    this.ensureRadiarLayoutMeta();
    return this.charts().map(({ id, name, symbol, resolution, timestamp }) => ({
      id: id!,
      name,
      symbol,
      resolution,
      timestamp,
    }));
  }

  async removeChart(id: string | number): Promise<void> {
    // Never delete the Radiar layout slot.
    if (String(id) === RADIAR_LAYOUT_ID) return;
    this.storage.set(
      KEYS.charts,
      this.charts().filter((c) => c.id !== id),
    );
  }

  async saveChart(chartData: ChartData): Promise<string | number> {
    const name = (chartData.name || "").trim() || RADIAR_LAYOUT_NAME;
    const preferRadiar = name.toLowerCase() === "radiar" || !chartData.id;
    const id = preferRadiar ? RADIAR_LAYOUT_ID : (chartData.id ?? Date.now().toString(36));
    const content = typeof chartData.content === "string" ? chartData.content.trim() : "";
    // Never overwrite a saved layout / template with an empty payload (blank chart
    // after a failed history fetch used to wipe study templates + drawings).
    if (!content || content === "{}" || content === "null") {
      const existing = this.charts().find((c) => c.id === id || c.name === (preferRadiar ? RADIAR_LAYOUT_NAME : name));
      if (existing?.content) return existing.id ?? id;
    }
    const record: ChartData = {
      ...chartData,
      id,
      name: preferRadiar ? RADIAR_LAYOUT_NAME : name,
      timestamp: Math.round(Date.now() / 1000),
    };
    this.storage.set(KEYS.charts, [...this.charts().filter((c) => c.id !== id && c.name !== record.name), record]);
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
    const content = typeof template.content === "string" ? template.content.trim() : "";
    if (!content || content === "{}" || content === "null") return;
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
    const all = this.lineToolStore();
    const serialized = serializeLineTools(state);
    const bySymbol = new Map<string, SerializedLineTools>();
    const looseSources: Array<[string, unknown]> = [];
    for (const [id, value] of serialized.sources ?? []) {
      const fromTool =
        value && typeof value === "object" && "symbol" in value
          ? drawingSymbolKey((value as { symbol?: string }).symbol)
          : "";
      const symbol = preferSymbol(fromTool, drawingSymbolKey(state.symbol));
      if (!symbol) {
        looseSources.push([id, value]);
        continue;
      }
      const stamped =
        value && typeof value === "object" && drawingSymbolKey((value as { symbol?: string }).symbol) !== symbol
          ? { ...(value as Record<string, unknown>), symbol }
          : value;
      const bucket = bySymbol.get(symbol) ?? { sources: [], groups: [], symbol };
      bucket.sources = [...(bucket.sources ?? []), [id, stamped]];
      bySymbol.set(symbol, bucket);
    }
    for (const [id, value] of serialized.groups ?? []) {
      const fromGroup =
        value && typeof value === "object" && "symbol" in value
          ? drawingSymbolKey((value as { symbol?: string }).symbol)
          : "";
      const symbol = preferSymbol(fromGroup, drawingSymbolKey(state.symbol));
      if (!symbol) continue;
      const bucket = bySymbol.get(symbol) ?? { sources: [], groups: [], symbol };
      bucket.groups = [...(bucket.groups ?? []), [id, value]];
      bySymbol.set(symbol, bucket);
    }
    if (bySymbol.size === 0) {
      const key = this.lineToolsKey(layoutId, chartId);
      all[key] = mergeLineToolBuckets(all[key], {
        ...serialized,
        sources: looseSources.length ? looseSources : serialized.sources,
      });
    } else {
      for (const [symbol, delta] of bySymbol) {
        const key = symbolBucket(symbol);
        all[key] = mergeLineToolBuckets(all[key], delta);
      }
      if (looseSources.length) {
        const key = this.lineToolsKey(layoutId, chartId);
        all[key] = mergeLineToolBuckets(all[key], { sources: looseSources, groups: [], symbol: state.symbol });
      }
    }
    this.storage.set(KEYS.lineTools, all);
    this.onChange?.();
  }

  async loadLineToolsAndGroups(
    layoutId: string | undefined,
    chartId: string | number,
    requestType: LineToolsAndGroupsLoadRequestType,
    context: LineToolsAndGroupsLoadRequestContext,
  ): Promise<Partial<LineToolsAndGroupsState> | null> {
    // Indicator-pane drawings are not the trendline on the symbol. Returning them
    // here would paint the same line twice.
    if (requestType === "studiesLineTools") return null;
    const all = this.lineToolStore();
    const want = drawingSymbolKey(context.symbol);
    const chunks: SerializedLineTools[] = [];
    if (requestType === "lineToolsWithoutSymbol") {
      for (const bucket of Object.values(all)) {
        const sources = (bucket.sources ?? []).filter((entry) => {
          const value = entry[1];
          if (!value || typeof value !== "object") return false;
          return !drawingSymbolKey((value as { symbol?: string }).symbol);
        });
        if (sources.length) chunks.push({ ...bucket, sources });
      }
    } else if (want) {
      chunks.push(...bucketsForSymbol(all, want));
    } else if (requestType === "allLineTools") {
      chunks.push(...Object.values(all));
    } else if (requestType === "mainSeriesLineTools") {
      const symbolBuckets = Object.entries(all).filter(([key]) => key.startsWith("symbol::"));
      const only = symbolBuckets.length === 1 ? symbolBuckets[0]?.[1] : undefined;
      if (only) chunks.push(only);
    } else {
      const legacy = all[this.lineToolsKey(layoutId, chartId)];
      if (legacy) chunks.push(legacy);
    }
    const merged = chunks.reduce<SerializedLineTools>(
      (acc, bucket) => mergeLineToolBuckets(acc, bucket),
      { sources: [], groups: [] },
    );
    const sources = (merged.sources ?? []).filter((entry) => {
      const value = entry[1];
      if (value == null) return false;
      if (!want || requestType === "allLineTools") return true;
      if (!value || typeof value !== "object") return false;
      const symbol = drawingSymbolKey((value as { symbol?: string }).symbol || merged.symbol);
      return !symbol || drawingSymbolsMatch(symbol, want);
    });
    if (!sources.length && !(merged.groups ?? []).length) return null;
    return deserializeLineTools({ ...merged, sources });
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

  private lineToolStore(): LineToolStore {
    return asLineToolStore(this.storage.get<unknown>(KEYS.lineTools, {}));
  }
}
