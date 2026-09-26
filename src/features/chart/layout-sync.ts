import type { Interval } from "@/domain";
import type { ChartController } from "./chart-controller";

export interface LayoutSyncFlags {
  readonly symbol: boolean;
  readonly interval: boolean;
  readonly crosshair: boolean;
  readonly time: boolean;
  readonly dateRange: boolean;
}

export const DEFAULT_LAYOUT_SYNC: LayoutSyncFlags = {
  symbol: false,
  interval: false,
  crosshair: false,
  time: false,
  dateRange: false,
};

interface PaneEntry {
  readonly index: number;
  readonly controller: ChartController;
}

/**
 * Coordinates multi-pane Advanced Charts widgets so layout switches keep
 * widgets alive and SYNC IN LAYOUT behaves like TradingView (best-effort on CL).
 *
 * Drawing tools: only the primary pane shows the left toolbar. Selecting a tool
 * there stores it; focusing any visible pane applies that tool so you can draw
 * on chart 2+ without a second toolbar.
 */
class LayoutSyncBus {
  private readonly panes = new Map<number, PaneEntry>();
  private flags: LayoutSyncFlags = { ...DEFAULT_LAYOUT_SYNC };
  private locked = false;
  private activeCount = 1;
  private activePane = 0;
  private sharedTool: string | null = null;
  private applyingTool = false;

  setFlags(flags: LayoutSyncFlags): void {
    this.flags = { ...flags };
  }

  getFlags(): LayoutSyncFlags {
    return this.flags;
  }

  setActiveCount(count: number): void {
    this.activeCount = Math.max(1, count);
  }

  getActivePane(): number {
    return this.activePane;
  }

  getSharedTool(): string | null {
    return this.sharedTool;
  }

  register(index: number, controller: ChartController): () => void {
    this.panes.set(index, { index, controller });
    return () => {
      const cur = this.panes.get(index);
      if (cur?.controller === controller) this.panes.delete(index);
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
   * Primary toolbar selected a tool — remember it and push onto the focused pane
   * when that pane is not the primary (so secondary charts draw immediately).
   */
  notifyToolSelected(sourceIndex: number, tool: string | null): void {
    if (this.applyingTool) return;
    if (sourceIndex !== 0) return;
    this.sharedTool = tool;
    if (this.activePane > 0 && tool) {
      void this.applyToolToPane(this.activePane, tool);
    }
  }

  /**
   * User focused a chart pane (pointer down). Make it the drawing target and
   * apply the shared tool from the primary toolbar.
   */
  focusPane(paneIndex: number): void {
    if (paneIndex < 0 || paneIndex >= this.activeCount) return;
    this.activePane = paneIndex;
    const tool = this.sharedTool;
    if (tool && paneIndex > 0) {
      void this.applyToolToPane(paneIndex, tool);
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
