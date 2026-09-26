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
 */
class LayoutSyncBus {
  private readonly panes = new Map<number, PaneEntry>();
  private flags: LayoutSyncFlags = { ...DEFAULT_LAYOUT_SYNC };
  private locked = false;
  private activeCount = 1;

  setFlags(flags: LayoutSyncFlags): void {
    this.flags = { ...flags };
  }

  getFlags(): LayoutSyncFlags {
    return this.flags;
  }

  setActiveCount(count: number): void {
    this.activeCount = Math.max(1, count);
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
    // Charting Library has no public setCrossHair(time). Mutating visible range
    // to "follow" the cursor causes zoom/pan fighting across panes — skip it.
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
