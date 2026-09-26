import type { Interval } from "@/domain";
import type { EntityId } from "@/infrastructure/tradingview";
import type { ChartController } from "./chart-controller";
import {
  applyShapeSnapshot,
  createShapeFromSnapshot,
  normalizeShapeName,
  readShapeSnapshot,
} from "./drawing-sync";

export interface LayoutSyncFlags {
  readonly symbol: boolean;
  readonly interval: boolean;
  readonly crosshair: boolean;
  readonly time: boolean;
  readonly dateRange: boolean;
  /** Mirror drawings across panes (same time/price — works across TFs). */
  readonly drawings: boolean;
}

export const DEFAULT_LAYOUT_SYNC: LayoutSyncFlags = {
  // Same ticker on every pane (TV multi-chart default for linked layouts).
  symbol: true,
  // Independent intervals so 15m + 4H can sit side by side.
  interval: false,
  crosshair: false,
  time: false,
  dateRange: false,
  // Drawings share absolute time/price across panes (TV behavior in the sample).
  drawings: true,
};

interface PaneEntry {
  readonly index: number;
  readonly controller: ChartController;
  unsubDrawing?: () => void;
}

/** One logical drawing mirrored onto N panes. */
interface DrawingGroup {
  readonly key: string;
  /** paneIndex → entity id on that widget */
  readonly entities: Map<number, EntityId>;
}

/**
 * Coordinates multi-pane Advanced Charts widgets:
 * - SYNC IN LAYOUT (symbol / interval / range)
 * - Shared drawing tool from the primary left toolbar
 * - Drawing sync by absolute time + price (cross-timeframe)
 * - Active pane selection for TV-style blue focus ring
 */
class LayoutSyncBus {
  private readonly panes = new Map<number, PaneEntry>();
  private flags: LayoutSyncFlags = { ...DEFAULT_LAYOUT_SYNC };
  private locked = false;
  private activeCount = 1;
  private activePane = 0;
  private sharedTool: string | null = null;
  private applyingTool = false;
  private syncingDrawings = false;
  private readonly groups: DrawingGroup[] = [];
  private readonly entityToGroup = new Map<string, DrawingGroup>();
  private readonly activeListeners = new Set<(paneIndex: number) => void>();
  /** Last non-toolbar drawing target — restored after picking a tool on pane 0. */
  private drawTargetPane = 0;

  setFlags(flags: LayoutSyncFlags): void {
    this.flags = { ...DEFAULT_LAYOUT_SYNC, ...flags };
  }

  getFlags(): LayoutSyncFlags {
    return this.flags;
  }

  setActiveCount(count: number): void {
    this.activeCount = Math.max(1, count);
    if (this.activePane >= this.activeCount) {
      this.focusPane(0);
    }
  }

  getActivePane(): number {
    return this.activePane;
  }

  getSharedTool(): string | null {
    return this.sharedTool;
  }

  /** React / UI: blue focus ring around the active chart. */
  subscribeActivePane(listener: (paneIndex: number) => void): () => void {
    this.activeListeners.add(listener);
    listener(this.activePane);
    return () => this.activeListeners.delete(listener);
  }

  register(index: number, controller: ChartController): () => void {
    const prev = this.panes.get(index);
    prev?.unsubDrawing?.();
    const entry: PaneEntry = { index, controller };
    entry.unsubDrawing = controller.onDrawingEvent((entityId, eventType) => {
      void this.onDrawingEvent(index, entityId, eventType);
    });
    this.panes.set(index, entry);
    return () => {
      const cur = this.panes.get(index);
      if (cur?.controller === controller) {
        cur.unsubDrawing?.();
        this.panes.delete(index);
        this.pruneGroupsForPane(index);
      }
    };
  }

  /** After CSS layout changes, ask visible panes to reflow. */
  reflowVisible(): void {
    for (const { index, controller } of this.panes.values()) {
      if (index >= this.activeCount) continue;
      controller.requestResize();
    }
  }

  /**
   * Primary toolbar selected a tool — remember it and push onto the focused
   * drawing target (so a 4H pane stays active after you pick Trend Line).
   */
  notifyToolSelected(sourceIndex: number, tool: string | null): void {
    if (this.applyingTool) return;
    if (sourceIndex !== 0) return;
    this.sharedTool = tool;
    const target = this.drawTargetPane > 0 && this.drawTargetPane < this.activeCount
      ? this.drawTargetPane
      : this.activePane;
    if (target > 0 && tool) {
      this.activePane = target;
      this.emitActive();
      void this.applyToolToPane(target, tool);
    }
  }

  /**
   * User focused a chart pane. Make it the drawing target and apply the shared tool.
   */
  focusPane(paneIndex: number): void {
    if (paneIndex < 0 || paneIndex >= this.activeCount) return;
    this.activePane = paneIndex;
    this.drawTargetPane = paneIndex;
    this.emitActive();
    const tool = this.sharedTool;
    if (tool && paneIndex > 0) {
      void this.applyToolToPane(paneIndex, tool);
    }
  }

  private emitActive(): void {
    for (const listener of this.activeListeners) {
      try {
        listener(this.activePane);
      } catch {
        /* ignore */
      }
    }
  }

  private async applyToolToPane(paneIndex: number, tool: string): Promise<void> {
    const entry = this.panes.get(paneIndex);
    if (!entry?.controller.isReady) return;
    this.applyingTool = true;
    try {
      await entry.controller.selectLineTool(tool);
    } finally {
      this.applyingTool = false;
    }
  }

  notifySymbol(sourceIndex: number, ticker: string): void {
    if (!this.flags.symbol || this.locked) return;
    this.withLock(() => {
      for (const { index, controller } of this.panes.values()) {
        if (index === sourceIndex || index >= this.activeCount) continue;
        controller.setSymbol(ticker);
      }
    });
  }

  notifyInterval(sourceIndex: number, interval: Interval): void {
    if (!this.flags.interval || this.locked) return;
    this.withLock(() => {
      for (const { index, controller } of this.panes.values()) {
        if (index === sourceIndex || index >= this.activeCount) continue;
        controller.setInterval(interval);
      }
    });
  }

  notifyVisibleRange(sourceIndex: number, from: number, to: number): void {
    if ((!this.flags.time && !this.flags.dateRange) || this.locked) return;
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return;
    this.withLock(() => {
      for (const { index, controller } of this.panes.values()) {
        if (index === sourceIndex || index >= this.activeCount) continue;
        void controller.setVisibleRange(from, to);
      }
    });
  }

  notifyCrosshair(sourceIndex: number, time: number): void {
    if (!this.flags.crosshair || this.locked) return;
    void sourceIndex;
    void time;
  }

  private async onDrawingEvent(
    paneIndex: number,
    entityId: EntityId,
    eventType: string,
  ): Promise<void> {
    if (!this.flags.drawings || this.syncingDrawings) return;
    if (paneIndex >= this.activeCount) return;
    if (this.activeCount < 2) return;

    const idKey = String(entityId);

    if (eventType === "remove") {
      const group = this.entityToGroup.get(idKey);
      if (!group) return;
      this.syncingDrawings = true;
      try {
        for (const [p, eid] of group.entities) {
          if (p === paneIndex) continue;
          this.panes.get(p)?.controller.removeEntity(eid);
          this.entityToGroup.delete(String(eid));
        }
        this.groups.splice(this.groups.indexOf(group), 1);
        group.entities.clear();
        this.entityToGroup.delete(idKey);
      } finally {
        this.syncingDrawings = false;
      }
      return;
    }

    if (
      eventType !== "create" &&
      eventType !== "points_changed" &&
      eventType !== "move" &&
      eventType !== "properties_changed"
    ) {
      return;
    }

    const source = this.panes.get(paneIndex);
    if (!source?.controller.isReady) return;
    const chart = source.controller.getWidget()?.activeChart();
    if (!chart) return;

    // Small delay so CL finishes writing points on create
    if (eventType === "create") {
      await new Promise((r) => window.setTimeout(r, 40));
    }

    const snapRaw = readShapeSnapshot(chart, entityId);
    if (!snapRaw) return;
    const toolHint =
      normalizeShapeName(source.controller.selectedLineTool()) ??
      normalizeShapeName(this.sharedTool);
    const snap =
      toolHint && (snapRaw.shape === "trend_line" || snapRaw.shape === "horizontal_line")
        ? { ...snapRaw, shape: toolHint }
        : snapRaw;

    let group = this.entityToGroup.get(idKey);
    if (!group && eventType === "create") {
      group = { key: `draw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, entities: new Map() };
      group.entities.set(paneIndex, entityId);
      this.entityToGroup.set(idKey, group);
      this.groups.push(group);
    }
    if (!group) return;

    this.syncingDrawings = true;
    try {
      const sourceSymbol = this.normalizeSymbol(source.controller.state.get().symbol);
      for (const { index, controller } of this.panes.values()) {
        if (index === paneIndex || index >= this.activeCount) continue;
        if (!controller.isReady) continue;
        // Only mirror onto panes showing the same symbol
        const destSymbol = this.normalizeSymbol(controller.state.get().symbol);
        if (sourceSymbol && destSymbol && sourceSymbol !== destSymbol) continue;

        const existing = group.entities.get(index);
        const destChart = controller.getWidget()?.activeChart();
        if (!destChart) continue;

        if (existing) {
          applyShapeSnapshot(destChart, existing, snap);
        } else {
          const created = await createShapeFromSnapshot(destChart, snap);
          if (created) {
            group.entities.set(index, created);
            this.entityToGroup.set(String(created), group);
          }
        }
      }
    } finally {
      this.syncingDrawings = false;
    }
  }

  private normalizeSymbol(symbol: string): string {
    if (!symbol) return "";
    return symbol.includes(":") ? symbol.slice(symbol.lastIndexOf(":") + 1) : symbol;
  }

  private pruneGroupsForPane(paneIndex: number): void {
    for (const group of [...this.groups]) {
      const eid = group.entities.get(paneIndex);
      if (eid != null) {
        this.entityToGroup.delete(String(eid));
        group.entities.delete(paneIndex);
      }
      if (group.entities.size === 0) {
        const i = this.groups.indexOf(group);
        if (i >= 0) this.groups.splice(i, 1);
      }
    }
  }

  private withLock(fn: () => void): void {
    if (this.locked) return;
    this.locked = true;
    try {
      fn();
    } finally {
      this.locked = false;
    }
  }
}

export const layoutSyncBus = new LayoutSyncBus();
