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

/**
 * A layout snapshot is taken when the chart is saved. Later color / level edits
 * land on the symbol copy. Refresh the snapshot so it does not keep the old settings.
 */
export function refreshLayoutSnapshots(store: LineToolStore, delta: SerializedLineTools): LineToolStore {
  const deltaSources = delta.sources ?? [];
  const deltaGroups = delta.groups ?? [];
  if (deltaSources.length === 0 && deltaGroups.length === 0) return store;
  const sourceIds = new Map(deltaSources);
  const groupIds = new Map(deltaGroups);
  let changed = false;
  const next: LineToolStore = { ...store };
  for (const [key, bucket] of Object.entries(store)) {
    if (!key.startsWith("layoutsave::")) continue;
    const sources = new Map(bucket.sources ?? []);
    const groups = new Map(bucket.groups ?? []);
    let bucketChanged = false;
    for (const [id, value] of sourceIds) {
      if (!sources.has(id)) continue;
      if (value == null) sources.delete(id);
      else sources.set(id, value);
      bucketChanged = true;
    }
    for (const [id, value] of groupIds) {
      if (!groups.has(id)) continue;
      if (value == null) groups.delete(id);
      else groups.set(id, value);
      bucketChanged = true;
    }
    if (!bucketChanged) continue;
    changed = true;
    next[key] = {
      ...bucket,
      sources: [...sources.entries()],
      groups: [...groups.entries()],
    };
  }
  return changed ? next : store;
}

/**
 * A null entry is a deletion. It wins over the other device's copy, and it is
 * kept so the next sync cannot put that drawing back.
 */
export function mergeLineToolBuckets(
  local: SerializedLineTools | undefined,
  remote: SerializedLineTools | undefined,
): SerializedLineTools {
  const sources = new Map<string, unknown>();
  const groups = new Map<string, unknown>();
  const apply = (bucket: SerializedLineTools | undefined, into: Map<string, unknown>, entries: Array<[string, unknown]> | null | undefined) => {
    if (!bucket) return;
    for (const [id, value] of entries ?? []) {
      if (into.has(id) && into.get(id) == null) continue;
      into.set(id, value == null ? null : value);
    }
  };
  apply(local, sources, local?.sources);
  apply(remote, sources, remote?.sources);
  apply(local, groups, local?.groups);
  apply(remote, groups, remote?.groups);
  const byId = (entries: Array<[string, unknown]>) =>
    entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return {
    sources: byId([...sources.entries()]),
    groups: byId([...groups.entries()]),
    symbol: remote?.symbol || local?.symbol,
  };
}

/** Keep every symbol's drawings from both devices. A deleted drawing stays deleted. */
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

/** Stable id for the user’s primary named layout. The visible name is theirs. */
export const RADIAR_LAYOUT_ID = "radiar-layout";
export const RADIAR_LAYOUT_NAME = "Radiar";

const AUTOSAVE_FLAG = "forge.layout.autosave";
export const CURRENT_LAYOUT_KEY = "forge.layout.current.v1";

/** Names the library invents from the Save button. They must not replace a name the user typed. */
const PLACEHOLDER_LAYOUT =
  /^(save|saved|save layout|layout|untitled|unnamed|new layout|radiar|forge|trader)$/i;

export function isPlaceholderLayoutName(name: string): boolean {
  return !name.trim() || PLACEHOLDER_LAYOUT.test(name.trim());
}

/**
 * The library chart snapshot lives at `charts`. A saved layout sometimes stores
 * that snapshot inside a symbol wrapper (`{ symbol, name, content }`). Passing
 * the wrapper to the widget as `saved_data` leaves the chart blank.
 */
export function libraryChartState(value: unknown): object | null {
  let current = value;
  for (let depth = 0; depth < 3; depth += 1) {
    if (typeof current === "string") {
      const trimmed = current.trim();
      if (!trimmed || trimmed === "{}" || trimmed === "null") return null;
      try {
        current = JSON.parse(trimmed) as unknown;
      } catch {
        return null;
      }
      continue;
    }
    if (!current || typeof current !== "object" || Array.isArray(current)) return null;
    const record = current as Record<string, unknown>;
    if (Array.isArray(record.charts) && record.charts.length > 0) return record;
    if (typeof record.content === "string") {
      current = record.content;
      continue;
    }
    return null;
  }
  return null;
}

interface CurrentLayout {
  readonly id: string | number;
  readonly name: string;
}

/**
 * Implements TradingView's save/load contract on top of `KeyValueStorage`, so
 * layouts, study templates and drawings survive reloads with no backend.
 */
export class LocalSaveLoadAdapter implements IExternalSaveLoadAdapter {
  private onChange: (() => void) | null = null;
  private defaultLayoutName = "Layout";
  private explicitSave = false;

  constructor(private readonly storage: KeyValueStorage) {}

  /**
   * The name on the layout menu. “Radiar” was the old forced title; a saved
   * chart under that title takes the signed-in name (Mohammad, and so on).
   */
  setDefaultLayoutName(name: string): void {
    const next = name.trim();
    if (!next || isPlaceholderLayoutName(next)) return;
    this.defaultLayoutName = next;
    const chosen = this.readCurrent();
    if (chosen && !isPlaceholderLayoutName(chosen.name)) return;
    try {
      const list = this.charts();
      if (list.some((chart) => chart.name === next && String(chart.id) !== RADIAR_LAYOUT_ID)) return;
      let changed = false;
      const renamed = list.map((chart) => {
        const forced = String(chart.id) === RADIAR_LAYOUT_ID || isPlaceholderLayoutName(chart.name);
        if (!forced || chart.name === next) return chart;
        changed = true;
        return { ...chart, name: next };
      });
      if (changed) this.storage.set(KEYS.charts, renamed);
    } catch {
      /* ignore */
    }
  }

  /** The name the user typed (Mohammad). Survives a refresh; “Save” does not replace it. */
  currentLayoutName(): string {
    const current = this.readCurrent();
    return current && !isPlaceholderLayoutName(current.name) ? current.name : "";
  }

  currentLayoutId(): string | number | undefined {
    return this.readCurrent()?.id;
  }

  /** Remember a name the user chose, and put it back on a chart the library renamed to Save. */
  rememberLayout(name: string): string | number {
    const next = name.trim();
    const current = this.readCurrent();
    const id = current?.id ?? RADIAR_LAYOUT_ID;
    if (!next || isPlaceholderLayoutName(next)) return id;
    this.storage.set(CURRENT_LAYOUT_KEY, { id, name: next } satisfies CurrentLayout);
    try {
      const list = this.charts();
      let changed = false;
      const renamed = list.map((chart) => {
        const mine = String(chart.id) === String(id);
        if (!mine || chart.name === next) return chart;
        changed = true;
        return { ...chart, name: next };
      });
      if (changed) this.storage.set(KEYS.charts, renamed);
    } catch {
      /* ignore */
    }
    return id;
  }

  /**
   * After a refresh the library only restores the candle snapshot, not the layout title.
   * Copy that snapshot into the named chart so Recently used still lists Mohammad.
   */
  ensureNamedLayout(symbol: string, resolution: string): void {
    const current = this.readCurrent();
    if (!current || isPlaceholderLayoutName(current.name)) return;
    const list = this.charts();
    const found = list.find((chart) => String(chart.id) === String(current.id));
    if (found?.content && found.content !== "{}" && found.content !== "null" && found.name === current.name) return;
    const autosave = libraryChartState(this.storage.get<unknown>("forge.tv.autosave.v3", undefined));
    if (!autosave) return;
    let content = "";
    try {
      content = JSON.stringify(autosave);
    } catch {
      return;
    }
    if (content.length < 40 || content === "{}" || content === "null") return;
    const record: ChartData = {
      ...(found ?? {}),
      id: current.id,
      name: current.name,
      symbol: found?.symbol || symbol,
      resolution: (found?.resolution || resolution) as ChartData["resolution"],
      content: found?.content && found.content !== "{}" && found.content !== "null" ? found.content : content,
      timestamp: Math.round(Date.now() / 1000),
    };
    this.storage.set(KEYS.charts, [
      ...list.filter((chart) => String(chart.id) !== String(current.id) && chart.name !== record.name),
      record,
    ]);
  }

  /** The next `saveChart` is a Save / Rename / Copy, not the timer. */
  markExplicitSave(): void {
    this.explicitSave = true;
  }

  isAutosaveEnabled(): boolean {
    return this.storage.get<boolean>(AUTOSAVE_FLAG, true) !== false;
  }

  setAutosaveEnabled(on: boolean): void {
    this.storage.set(AUTOSAVE_FLAG, on);
  }

  /** Fired after drawings change so the account can push them to the other device. */
  setOnChange(listener: (() => void) | null): void {
    this.onChange = listener;
  }

  /* ── chart layouts ─────────────────────────────────────────────────── */

  async getAllCharts(): Promise<ChartMetaInfo[]> {
    const stored = this.charts();
    const withContent = stored.filter((chart) => chart.content && chart.content !== "{}" && chart.content !== "null");
    const named = withContent.filter((chart) => !isPlaceholderLayoutName(chart.name));
    // “Layout” is the name the Save button invents. Once a real name exists, drop it.
    if (named.length > 0 && named.length < withContent.length) {
      const keep = new Set(named.map((chart) => String(chart.id)));
      this.storage.set(
        KEYS.charts,
        stored.filter((chart) => keep.has(String(chart.id)) || !isPlaceholderLayoutName(chart.name)),
      );
    }
    const visible = named.length > 0 ? named : withContent;
    return visible.map(({ id, name, symbol, resolution, timestamp }) => ({
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
      this.charts().filter((c) => String(c.id) !== String(id)),
    );
  }

  async saveChart(chartData: ChartData): Promise<string | number> {
    const explicit = this.explicitSave;
    this.explicitSave = false;
    const requested = (chartData.name || "").trim();
    const placeholder = isPlaceholderLayoutName(requested);
    const current = this.readCurrent();
    const list = this.charts();
    const existing =
      (chartData.id != null ? list.find((chart) => String(chart.id) === String(chartData.id)) : undefined) ??
      (!explicit && current?.id != null
        ? list.find((chart) => String(chart.id) === String(current.id))
        : undefined) ??
      (!placeholder ? list.find((chart) => chart.name === requested) : undefined);
    const kept =
      (existing && !isPlaceholderLayoutName(existing.name) ? existing.name : "") ||
      (current && !isPlaceholderLayoutName(current.name) ? current.name : "") ||
      (!isPlaceholderLayoutName(this.defaultLayoutName) ? this.defaultLayoutName : "");
    const name = !placeholder ? requested : explicit ? kept || requested || "Layout" : kept || requested || "Layout";
    if (!explicit && !this.isAutosaveEnabled()) {
      return existing?.id ?? chartData.id ?? current?.id ?? name;
    }
    // A copy asks for a new id. Autosave must keep the chart the user already named.
    const id =
      chartData.id ??
      existing?.id ??
      (explicit ? Date.now().toString(36) : current?.id ?? RADIAR_LAYOUT_ID);
    const content = typeof chartData.content === "string" ? chartData.content.trim() : "";
    // Never overwrite a saved layout with an empty payload (a blank chart after a
    // failed history fetch used to wipe indicators and drawings).
    if (!content || content === "{}" || content === "null") {
      if (existing?.content) {
        if (name && name !== existing.name) {
          const renamed: ChartData = { ...existing, id: existing.id ?? id, name, timestamp: Math.round(Date.now() / 1000) };
          this.writeChart(renamed);
          if (!isPlaceholderLayoutName(name)) this.storage.set(CURRENT_LAYOUT_KEY, { id: renamed.id ?? id, name });
        }
        return existing.id ?? id;
      }
      if (!placeholder) this.storage.set(CURRENT_LAYOUT_KEY, { id, name });
      return id;
    }
    const carried = existing as (ChartData & { forgeLayout?: unknown }) | undefined;
    const incoming = chartData as ChartData & { forgeLayout?: unknown };
    const record: ChartData & { forgeLayout?: unknown } = {
      ...chartData,
      id,
      name,
      timestamp: Math.round(Date.now() / 1000),
      // The library autosave does not know about layers. Keep the arrangement
      // that was stored with this named layout.
      forgeLayout: incoming.forgeLayout ?? carried?.forgeLayout,
    };
    this.writeChart(record);
    if (!isPlaceholderLayoutName(name)) {
      this.storage.set(CURRENT_LAYOUT_KEY, { id, name } satisfies CurrentLayout);
    }
    this.rememberLayoutDrawings(id, record.symbol);
    return id;
  }

  async getChartContent(chartId: number | string): Promise<string> {
    const chart = this.charts().find((c) => String(c.id) === String(chartId));
    if (!chart) throw new Error(`Chart ${chartId} not found`);
    const state = libraryChartState(chart.content);
    return state ? JSON.stringify(state) : chart.content;
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
    this.storage.set(KEYS.lineTools, refreshLayoutSnapshots(all, serialized));
    this.onChange?.();
  }

  /**
   * The chart's current drawings are the whole set. Anything missing was deleted
   * and must stay deleted when the account syncs.
   */
  saveFullLineToolsState(state: LineToolsAndGroupsState): Promise<void> {
    if (!state.sources) return Promise.resolve();
    const all = this.lineToolStore();
    const serialized = serializeLineTools(state);
    const bySymbol = new Map<string, SerializedLineTools>();
    for (const [id, value] of serialized.sources ?? []) {
      const fromTool =
        value && typeof value === "object" && "symbol" in value
          ? drawingSymbolKey((value as { symbol?: string }).symbol)
          : "";
      const symbol = preferSymbol(fromTool, drawingSymbolKey(state.symbol));
      if (!symbol) continue;
      const bucket = bySymbol.get(symbol) ?? { sources: [], groups: [], symbol };
      bucket.sources = [...(bucket.sources ?? []), [id, value ?? null]];
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
      bucket.groups = [...(bucket.groups ?? []), [id, value ?? null]];
      bySymbol.set(symbol, bucket);
    }
    const touched = new Set<string>(bySymbol.keys());
    const currentSymbol = drawingSymbolKey(state.symbol);
    if (currentSymbol) touched.add(currentSymbol);
    const removedSources: Array<[string, null]> = [];
    const removedGroups: Array<[string, null]> = [];
    for (const symbol of touched) {
      const key = symbolBucket(symbol);
      const existing = all[key];
      const incoming = bySymbol.get(symbol) ?? { sources: [], groups: [], symbol };
      const sourceIds = new Set((incoming.sources ?? []).map(([id]) => id));
      const groupIds = new Set((incoming.groups ?? []).map(([id]) => id));
      const sources = [...(incoming.sources ?? [])];
      for (const [id, value] of existing?.sources ?? []) {
        if (sourceIds.has(id)) continue;
        const toolSymbol =
          value && typeof value === "object" && "symbol" in value
            ? drawingSymbolKey((value as { symbol?: string }).symbol)
            : "";
        if (toolSymbol && !drawingSymbolsMatch(toolSymbol, symbol)) continue;
        sources.push([id, null]);
        removedSources.push([id, null]);
      }
      const groups = [...(incoming.groups ?? [])];
      for (const [id] of existing?.groups ?? []) {
        if (groupIds.has(id)) continue;
        groups.push([id, null]);
        removedGroups.push([id, null]);
      }
      all[key] = { sources, groups, symbol: incoming.symbol || existing?.symbol || symbol };
    }
    const delta: SerializedLineTools = {
      sources: [...(serialized.sources ?? []), ...removedSources],
      groups: [...(serialized.groups ?? []), ...removedGroups],
      symbol: state.symbol,
    };
    this.storage.set(KEYS.lineTools, refreshLayoutSnapshots(all, delta));
    this.onChange?.();
    return Promise.resolve();
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
      // The layout snapshot is the older copy. The symbol copy has the latest
      // colors, levels and line styles, so it has to be applied last.
      const savedWithLayout = all[`layoutsave::${chartId}`] ?? (layoutId ? all[`layoutsave::${layoutId}`] : undefined);
      if (savedWithLayout) chunks.push(savedWithLayout);
      chunks.push(...bucketsForSymbol(all, want));
    } else if (requestType === "allLineTools") {
      const ranked = Object.entries(all).sort(([a], [b]) => {
        const rank = (key: string) => (key.startsWith("symbol::") ? 2 : key.startsWith("layoutsave::") ? 0 : 1);
        return rank(a) - rank(b);
      });
      chunks.push(...ranked.map(([, bucket]) => bucket));
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
    const groups = (merged.groups ?? []).filter((entry) => entry[1] != null);
    if (!sources.length && !groups.length) return null;
    return deserializeLineTools({ ...merged, sources, groups });
  }

  /* ── internals ─────────────────────────────────────────────────────── */

  private charts(): ChartData[] {
    return this.storage.get<ChartData[]>(KEYS.charts, []);
  }

  private readCurrent(): CurrentLayout | null {
    const raw = this.storage.get<CurrentLayout | null>(CURRENT_LAYOUT_KEY, null);
    if (!raw || raw.id == null || typeof raw.name !== "string") return null;
    return raw;
  }

  private writeChart(record: ChartData): void {
    const id = record.id;
    const dropPlaceholders = !isPlaceholderLayoutName(record.name);
    this.storage.set(KEYS.charts, [
      ...this.charts().filter((chart) => {
        if (String(chart.id) === String(id) || chart.name === record.name) return false;
        if (dropPlaceholders && isPlaceholderLayoutName(chart.name)) return false;
        return true;
      }),
      record,
    ]);
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

  /** Keep the drawings that belonged to this named layout, as well as the symbol copy. */
  private rememberLayoutDrawings(chartId: string | number, symbol: string): void {
    const all = this.lineToolStore();
    const chunks = bucketsForSymbol(all, symbol);
    if (!chunks.length) return;
    const merged = chunks.reduce<SerializedLineTools>(
      (acc, bucket) => mergeLineToolBuckets(acc, bucket),
      { sources: [], groups: [], symbol },
    );
    all[`layoutsave::${chartId}`] = merged;
    this.storage.set(KEYS.lineTools, all);
  }

  private lineToolsKey(layoutId: string | undefined, chartId: string | number): string {
    return `${layoutId ?? "default"}::${chartId}`;
  }

  private lineToolStore(): LineToolStore {
    return asLineToolStore(this.storage.get<unknown>(KEYS.lineTools, {}));
  }
}
