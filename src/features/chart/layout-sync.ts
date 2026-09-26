import type { Interval } from "@/domain";
import type { EntityId } from "@/infrastructure/tradingview";
import type { ChartController } from "./chart-controller";
import {
  applyShapeSnapshot,
  createShapeFromSnapshot,
  normalizeShapeName,
  readAllShapeSnapshots,
  readShapeSnapshotRetry,
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
  symbol: true,
  interval: false,
  crosshair: false,
  time: false,
  dateRange: false,
  drawings: true,
};

interface PaneEntry {
  readonly index: number;
  readonly controller: ChartController;
  unsubDrawing?: () => void;
  unsubMouse?: () => void;
}

interface DrawingGroup {
  readonly key: string;
  readonly entities: Map<number, EntityId>;
}

/**
 * Multi-pane coordination matching TradingView linked layouts:
 * - blue active pane (mouse_down inside each CL iframe)
 * - one shared drawing tool from primary toolbar
 * - drawings synced by absolute time/price both ways
 * - seed existing drawings onto newly visible panes
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
  private drawTargetPane = 0;
  private seedTimer = 0;

  setFlags(flags: LayoutSyncFlags): void {
    // Always keep drawings ON unless the user explicitly turns them off.
    this.flags = {
      ...DEFAULT_LAYOUT_SYNC,
      ...flags,
      drawings: flags.drawings !== false,
    };
  }

  getFlags(): LayoutSyncFlags {
    return this.flags;
  }

  setActiveCount(count: number): void {
    const prev = this.activeCount;
    this.activeCount = Math.max(1, count);
    if (this.activePane >= this.activeCount) {
      this.focusPane(0);
    }
    if (this.activeCount > prev) {
      this.scheduleSeedFromPrimary();
    }
  }

  getActivePane(): number {
    return this.activePane;
  }

  getSharedTool(): string | null {
    return this.sharedTool;
  }

  subscribeActivePane(listener: (paneIndex: number) => void): () => void {
    this.activeListeners.add(listener);
    listener(this.activePane);
    return () => this.activeListeners.delete(listener);
  }

  register(index: number, controller: ChartController): () => void {
    const prev = this.panes.get(index);
    prev?.unsubDrawing?.();
    prev?.unsubMouse?.();
    const entry: PaneEntry = { index, controller };
    entry.unsubDrawing = controller.onDrawingEvent((entityId, eventType) => {
      void this.onDrawingEvent(index, entityId, eventType);
    });
    // Clicks inside the CL iframe never bubble to React — use library mouse_down.
    entry.unsubMouse = controller.onMouseDown(() => {
      this.focusPane(index);
    });
    this.panes.set(index, entry);
    if (controller.isReady && this.activeCount > 1) {
      this.scheduleSeedFromPrimary();
    }
    return () => {
      const cur = this.panes.get(index);
      if (cur?.controller === controller) {
        cur.unsubDrawing?.();
        cur.unsubMouse?.();
        this.panes.delete(index);
        this.pruneGroupsForPane(index);
      }
    };
  }

  /** Call when a pane's widget becomes ready so we can seed drawings. */
  notifyPaneReady(paneIndex: number): void {
    void paneIndex;
    if (this.activeCount > 1 && this.flags.drawings) {
      this.scheduleSeedFromPrimary();
    }
  }

  reflowVisible(): void {
    for (const { index, controller } of this.panes.values()) {
      if (index >= this.activeCount) continue;
      controller.requestResize();
    }
  }

  notifyToolSelected(sourceIndex: number, tool: string | null): void {
    if (this.applyingTool) return;
    if (sourceIndex !== 0) return;
    this.sharedTool = tool;
    const target =
      this.drawTargetPane > 0 && this.drawTargetPane < this.activeCount
        ? this.drawTargetPane
        : this.activePane;
    if (target > 0 && tool) {
      this.activePane = target;
      this.emitActive();
      void this.applyToolToPane(target, tool);
    }
  }

  focusPane(paneIndex: number): void {
    if (paneIndex < 0 || paneIndex >= this.activeCount) return;
    const changed = this.activePane !== paneIndex;
    this.activePane = paneIndex;
    this.drawTargetPane = paneIndex;
    if (changed) this.emitActive();
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

  private scheduleSeedFromPrimary(): void {
    window.clearTimeout(this.seedTimer);
    this.seedTimer = window.setTimeout(() => {
      void this.seedDrawingsFromPane(0);
    }, 350);
  }

  /** Copy every drawing on `sourceIndex` onto other visible panes (first open / join). */
  private async seedDrawingsFromPane(sourceIndex: number): Promise<void> {
    if (!this.flags.drawings || this.syncingDrawings) return;
    if (this.activeCount < 2) return;
    const source = this.panes.get(sourceIndex);
    if (!source?.controller.isReady) return;
    const chart = source.controller.getWidget()?.activeChart();
    if (!chart) return;

    const snaps = readAllShapeSnapshots(chart);
    if (snaps.length === 0) return;

    this.syncingDrawings = true;
    try {
      const sourceSymbol = this.normalizeSymbol(source.controller.state.get().symbol);
      for (const { id, snap } of snaps) {
        let group = this.entityToGroup.get(String(id));
        if (!group) {
          group = {
            key: `seed-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            entities: new Map([[sourceIndex, id]]),
          };
          this.entityToGroup.set(String(id), group);
          this.groups.push(group);
        } else {
          group.entities.set(sourceIndex, id);
        }

        for (const { index, controller } of this.panes.values()) {
          if (index === sourceIndex || index >= this.activeCount) continue;
          if (!controller.isReady) continue;
          const destSymbol = this.normalizeSymbol(controller.state.get().symbol);
          if (sourceSymbol && destSymbol && sourceSymbol !== destSymbol) continue;
          if (group.entities.has(index)) continue;
          const destChart = controller.getWidget()?.activeChart();
          if (!destChart) continue;
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
        const gi = this.groups.indexOf(group);
        if (gi >= 0) this.groups.splice(gi, 1);
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

    // Selecting a drawing also focuses that pane.
    this.focusPane(paneIndex);

    const source = this.panes.get(paneIndex);
    if (!source?.controller.isReady) return;
    const chart = source.controller.getWidget()?.activeChart();
    if (!chart) return;

    const toolHint =
      normalizeShapeName(source.controller.selectedLineTool()) ??
      normalizeShapeName(this.sharedTool);

    const snap = await readShapeSnapshotRetry(chart, entityId, toolHint);
    if (!snap) return;

    let group = this.entityToGroup.get(idKey);
    if (!group) {
      group = {
        key: `draw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        entities: new Map(),
      };
      this.groups.push(group);
    }
    group.entities.set(paneIndex, entityId);
    this.entityToGroup.set(idKey, group);

    this.syncingDrawings = true;
    try {
      const sourceSymbol = this.normalizeSymbol(source.controller.state.get().symbol);
      for (const { index, controller } of this.panes.values()) {
        if (index === paneIndex || index >= this.activeCount) continue;
        if (!controller.isReady) continue;
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
    return (symbol.includes(":") ? symbol.slice(symbol.lastIndexOf(":") + 1) : symbol).toUpperCase();
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
