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
  /** Canonical create* shape id (e.g. long_position) — used to detect bad mirrors. */
  shape?: string;
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
  /** Entity ids created as mirrors — ignore their create events to avoid loops. */
  private readonly mirrorIds = new Set<string>();
  private readonly activeListeners = new Set<(paneIndex: number) => void>();
  private readonly paneStateListeners = new Set<(state: { pane: number; symbol: string; interval: Interval }) => void>();
  private drawTargetPane = 0;
  private seedTimer = 0;
  /** Last intentionally-applied interval per pane (for header routing). */
  private readonly paneIntervals = new Map<number, Interval>();
  private readonly paneSymbols = new Map<number, string>();
  /** Pane focused before the latest focusPane (header clicks often re-focus 0). */
  private priorChartPane = 0;
  private lastFocusAtMs = 0;
  /** Last pane the user clicked on the plot (not header/toolbar). */
  private plotFocusPane = 0;
  private plotFocusAtMs = 0;
  /**
   * After a header intercept routes TF to a secondary pane, CL may still mutate
   * pane 0 — snap it back to this value for a short window.
   */
  private primaryIntervalGuard: Interval | null = null;
  private primaryIntervalGuardUntil = 0;
  private primarySymbolGuard: string | null = null;
  private primarySymbolGuardUntil = 0;
  /** Ignore primary onIntervalChanged echoes while we force-restore pane 0. */
  private ignoringPrimaryInterval = false;
  private ignorePrimaryIntervalTimer = 0;
  private restorePrimaryTimer = 0;

  setFlags(flags: LayoutSyncFlags): void {
    // Always keep drawings ON unless the user explicitly turns them off.
    // Interval sync stays OFF unless the user turns it on (independent TFs).
    this.flags = {
      ...DEFAULT_LAYOUT_SYNC,
      ...flags,
      interval: flags.interval === true,
      drawings: flags.drawings !== false,
    };
  }

  getFlags(): LayoutSyncFlags {
    return this.flags;
  }

  getActiveCount(): number {
    return this.activeCount;
  }

  setActiveCount(count: number): void {
    const prev = this.activeCount;
    this.activeCount = Math.max(1, count);
    if (this.activePane >= this.activeCount) {
      this.focusPane(0);
    }
    if (this.activeCount > prev) {
      // New panes join the layout — clone primary symbol + drawings.
      this.clonePrimarySymbolToNewPanes(prev);
      this.scheduleSeedFromPrimary();
    }
  }

  getActivePane(): number {
    return this.activePane;
  }

  /** Pane that should receive shared-header actions (TV active chart). */
  getHeaderTargetPane(): number {
    return this.headerTargetPane();
  }

  getSharedTool(): string | null {
    return this.sharedTool;
  }

  subscribeActivePane(listener: (paneIndex: number) => void): () => void {
    this.activeListeners.add(listener);
    listener(this.activePane);
    return () => this.activeListeners.delete(listener);
  }

  subscribeActivePaneState(
    listener: (state: { pane: number; symbol: string; interval: Interval }) => void,
  ): () => void {
    this.paneStateListeners.add(listener);
    listener({
      pane: this.activePane,
      symbol: this.getPaneState(this.activePane).symbol,
      interval: this.getPaneState(this.activePane).interval,
    });
    return () => this.paneStateListeners.delete(listener);
  }

  getPaneState(paneIndex: number): { symbol: string; interval: Interval } {
    const entry = this.panes.get(paneIndex);
    const st = entry?.controller.state.get();
    return {
      symbol: this.paneSymbols.get(paneIndex) ?? st?.symbol ?? "",
      interval: this.paneIntervals.get(paneIndex) ?? st?.interval ?? "15",
    };
  }

  /** Change only one pane’s interval (never broadcasts unless Interval sync is ON). */
  setPaneInterval(paneIndex: number, interval: Interval): void {
    const entry = this.panes.get(paneIndex);
    if (!entry?.controller.isReady) return;
    this.withLock(() => {
      entry.controller.setInterval(interval);
      this.paneIntervals.set(paneIndex, interval);
    });
    if (paneIndex === this.activePane) this.emitPaneState();
    if (this.flags.interval === true) {
      this.notifyInterval(paneIndex, interval);
    }
  }

  /** Change only the selected pane’s interval (never broadcasts unless Interval sync is ON). */
  setActivePaneInterval(interval: Interval): void {
    this.setPaneInterval(this.activePane, interval);
  }

  /**
   * Header TF click (TV layers): apply to the active chart only.
   * Interval sync ON → every visible pane. Otherwise only the focused pane.
   * When the focused pane is secondary, guard pane 0 against accidental CL mutation.
   */
  applyHeaderInterval(interval: Interval): void {
    const multi = this.activeCount > 1;
    const syncOn = this.flags.interval === true;
    const target = this.headerTargetPane();

    if (!multi || syncOn) {
      this.setPaneInterval(0, interval);
      return;
    }

    if (target === 0) {
      this.setPaneInterval(0, interval);
      return;
    }

    if (this.activePane !== target) {
      this.activePane = target;
      this.drawTargetPane = target;
      this.emitActive();
      this.emitPaneState();
    }

    const keep = this.paneIntervals.get(0) ?? this.panes.get(0)?.controller.state.get().interval ?? "15";
    this.armPrimaryIntervalGuard(keep);
    this.setPaneInterval(target, interval);
    // CL often still mutates pane 0 from the same click — pin it back.
    if (keep !== interval) this.forceRestorePrimaryInterval(keep);
  }

  /** Change only the selected pane’s symbol (broadcast only when Symbol sync is ON). */
  setActivePaneSymbol(ticker: string): void {
    const active = this.activePane;
    const entry = this.panes.get(active);
    if (!entry?.controller.isReady) return;
    this.withLock(() => {
      entry.controller.setSymbol(ticker);
      this.paneSymbols.set(active, ticker);
    });
    this.emitPaneState();
    if (this.flags.symbol) {
      this.notifySymbol(active, ticker);
    }
  }

  openIndicatorsOnActive(): void {
    const target = this.headerTargetPane();
    if (target !== this.activePane && target < this.activeCount) {
      this.focusPane(target);
    }
    // CL may still open the dialog on the primary widget from the shared header
    // click — close it, then open on the active chart (TV layers).
    if (target > 0) {
      this.panes.get(0)?.controller.closePopupsAndDialogs();
      window.setTimeout(() => {
        this.panes.get(0)?.controller.closePopupsAndDialogs();
        this.panes.get(target)?.controller.openIndicators();
      }, 0);
      window.setTimeout(() => this.panes.get(0)?.controller.closePopupsAndDialogs(), 40);
    }
    this.panes.get(target)?.controller.openIndicators();
  }

  openSymbolSearchOnActive(): void {
    const target = this.headerTargetPane();
    if (target !== this.activePane && target < this.activeCount) {
      this.focusPane(target);
    }
    if (this.activeCount > 1 && this.flags.symbol !== true && target > 0) {
      const keep = this.paneSymbols.get(0) ?? this.panes.get(0)?.controller.state.get().symbol ?? "";
      if (keep) {
        this.primarySymbolGuard = keep;
        this.primarySymbolGuardUntil = Date.now() + 2500;
      }
    }
    if (target > 0) {
      this.panes.get(0)?.controller.closePopupsAndDialogs();
      window.setTimeout(() => {
        this.panes.get(0)?.controller.closePopupsAndDialogs();
        this.panes.get(target)?.controller.openSymbolSearch();
      }, 0);
      window.setTimeout(() => this.panes.get(0)?.controller.closePopupsAndDialogs(), 40);
    }
    this.panes.get(target)?.controller.openSymbolSearch();
  }

  undoOnActive(): void {
    this.panes.get(this.activePane)?.controller.undo();
  }

  redoOnActive(): void {
    this.panes.get(this.activePane)?.controller.redo();
  }

  openChartPropertiesOnActive(): void {
    this.panes.get(this.activePane)?.controller.openChartProperties();
  }

  takeScreenshotOnActive(): void {
    this.panes.get(this.activePane)?.controller.takeScreenshot();
  }

  private emitPaneState(): void {
    const st = this.getPaneState(this.activePane);
    for (const listener of this.paneStateListeners) {
      try {
        listener({ pane: this.activePane, ...st });
      } catch {
        /* ignore */
      }
    }
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
    entry.unsubMouse = controller.onMouseDown((params) => {
      // Primary widget owns the shared header + left toolbar. Clicks there must
      // NOT steal the active layer (TV: header drives whichever chart is selected).
      if (index === 0) {
        const y = params?.clientY ?? 0;
        const x = params?.clientX ?? 0;
        if (y < 52 || x < 56) return;
      }
      this.focusPaneFromPlot(index);
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
    const entry = this.panes.get(paneIndex);
    if (entry) {
      const st = entry.controller.state.get();
      this.paneIntervals.set(paneIndex, st.interval);
      this.paneSymbols.set(paneIndex, st.symbol);
    }
    if (this.activeCount > 1 && this.flags.drawings) {
      this.scheduleSeedFromPrimary();
    }
    // Secondary panes that just became ready: match primary symbol immediately.
    if (paneIndex > 0 && this.activeCount > 1 && this.flags.symbol) {
      const primary = this.panes.get(0);
      const ticker = primary?.controller.state.get().symbol;
      if (ticker && entry) {
        const bare = this.normalizeSymbol(entry.controller.state.get().symbol);
        if (bare !== this.normalizeSymbol(ticker)) {
          this.withLock(() => entry.controller.setSymbol(ticker));
        }
      }
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
    // Cursor / eraser: mirror to all panes. Drawing tools: only the active draw target.
    if (!tool || tool === "cursor" || tool === "arrow_cursor" || tool === "dot") {
      for (const { index } of this.panes.values()) {
        if (index === 0 || index >= this.activeCount) continue;
        void this.applyToolToPane(index, tool ?? "cursor");
      }
      return;
    }
    const target =
      this.drawTargetPane > 0 && this.drawTargetPane < this.activeCount
        ? this.drawTargetPane
        : this.activePane;
    if (target > 0) {
      this.activePane = target;
      this.emitActive();
      void this.applyToolToPane(target, tool);
    }
  }

  focusPane(paneIndex: number): void {
    if (paneIndex < 0 || paneIndex >= this.activeCount) return;
    const changed = this.activePane !== paneIndex;
    if (changed) {
      this.priorChartPane = this.activePane;
      this.lastFocusAtMs = Date.now();
    }
    this.activePane = paneIndex;
    this.drawTargetPane = paneIndex;
    if (changed) {
      this.emitActive();
      this.emitPaneState();
    }
    const tool = this.sharedTool;
    // Only re-apply an active drawing tool (not cursor) when focusing a secondary pane.
    if (tool && tool !== "cursor" && tool !== "arrow_cursor" && paneIndex > 0) {
      void this.applyToolToPane(paneIndex, tool);
    }
  }

  /** User clicked a chart plot — this is the authoritative active layer. */
  focusPaneFromPlot(paneIndex: number): void {
    this.plotFocusPane = paneIndex;
    this.plotFocusAtMs = Date.now();
    this.focusPane(paneIndex);
  }

  /**
   * Pane that should receive header TF/symbol changes.
   * Prefer the last plot the user clicked; only fall back to the short
   * header-steal heuristic when there is no recent plot focus.
   */
  private headerTargetPane(): number {
    if (this.activeCount < 2) return 0;
    // Explicit plot click wins for several seconds (covers TF click after select).
    if (
      this.plotFocusAtMs > 0 &&
      Date.now() - this.plotFocusAtMs < 8000 &&
      this.plotFocusPane >= 0 &&
      this.plotFocusPane < this.activeCount
    ) {
      return this.plotFocusPane;
    }
    // Very tight race: accidental focus to 0 in the same gesture as a header TF.
    if (
      this.activePane === 0 &&
      this.priorChartPane > 0 &&
      this.priorChartPane < this.activeCount &&
      Date.now() - this.lastFocusAtMs < 200
    ) {
      return this.priorChartPane;
    }
    return this.activePane;
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

  /**
   * Primary CL header interval change (safety net).
   * Prefer `applyHeaderInterval` via capture-phase intercept so CL never mutates
   * pane 0. If a change still lands here, route like TradingView layers:
   * Interval sync OFF → only the active pane; restore pane 0 when needed.
   */
  handlePrimaryIntervalChanged(interval: Interval, previous?: Interval): void {
    if (this.locked || this.ignoringPrimaryInterval) {
      this.paneIntervals.set(0, interval);
      return;
    }

    const multi = this.activeCount > 1;
    const syncOn = this.flags.interval === true;

    // Intercept already applied TF to a secondary pane — undo CL's pane-0 mutation.
    if (
      multi &&
      !syncOn &&
      this.primaryIntervalGuard &&
      Date.now() < this.primaryIntervalGuardUntil &&
      this.primaryIntervalGuard !== interval
    ) {
      this.forceRestorePrimaryInterval(this.primaryIntervalGuard);
      return;
    }

    const target = this.headerTargetPane();

    // Sync ON → every visible pane follows the header.
    if (multi && syncOn) {
      this.paneIntervals.set(0, interval);
      this.notifyInterval(0, interval);
      return;
    }

    // Target is the primary chart — native CL change is already correct.
    if (!multi || target === 0) {
      this.paneIntervals.set(0, interval);
      return;
    }

    // Target is another pane: apply TF there only, snap primary back.
    if (this.activePane !== target) {
      this.activePane = target;
      this.drawTargetPane = target;
      this.emitActive();
      this.emitPaneState();
    }
    const restoreTo =
      (this.primaryIntervalGuard && Date.now() < this.primaryIntervalGuardUntil
        ? this.primaryIntervalGuard
        : null) ||
      previous ||
      this.paneIntervals.get(0) ||
      "15";

    this.armPrimaryIntervalGuard(restoreTo);
    // Only push to the target if it isn't already on this TF (avoid clobbering).
    const targetInterval = this.paneIntervals.get(target) ?? this.panes.get(target)?.controller.state.get().interval;
    if (targetInterval !== interval) {
      this.setPaneInterval(target, interval);
    }

    if (restoreTo !== interval) {
      this.forceRestorePrimaryInterval(restoreTo);
    } else {
      this.paneIntervals.set(0, restoreTo);
    }
  }

  /**
   * Primary CL header symbol change — same routing rules as interval.
   */
  handlePrimarySymbolChanged(ticker: string, previous?: string): void {
    if (this.locked) {
      this.paneSymbols.set(0, ticker);
      return;
    }

    const multi = this.activeCount > 1;
    const syncOn = this.flags.symbol === true;

    if (
      multi &&
      !syncOn &&
      this.primarySymbolGuard &&
      Date.now() < this.primarySymbolGuardUntil &&
      this.normalizeSymbol(this.primarySymbolGuard) !== this.normalizeSymbol(ticker)
    ) {
      const keep = this.primarySymbolGuard;
      const primary = this.panes.get(0);
      if (primary?.controller.isReady) {
        this.withLock(() => {
          primary.controller.restoreSymbol(keep);
          this.paneSymbols.set(0, keep);
        });
      } else {
        this.paneSymbols.set(0, keep);
      }
      return;
    }

    const target = this.headerTargetPane();

    if (multi && syncOn) {
      this.paneSymbols.set(0, ticker);
      this.notifySymbol(0, ticker);
      return;
    }

    if (!multi || target === 0) {
      this.paneSymbols.set(0, ticker);
      return;
    }

    if (this.activePane !== target) {
      this.activePane = target;
      this.drawTargetPane = target;
      this.emitActive();
    }
    const restoreTo =
      (this.primarySymbolGuard && Date.now() < this.primarySymbolGuardUntil
        ? this.primarySymbolGuard
        : null) ||
      previous ||
      this.paneSymbols.get(0) ||
      "";

    // Guard before set — openSymbolSearch on secondary may still race with pane 0.
    if (restoreTo) {
      this.primarySymbolGuard = restoreTo;
      this.primarySymbolGuardUntil = Date.now() + 1200;
    }
    this.setActivePaneSymbol(ticker);

    const primary = this.panes.get(0);
    if (primary?.controller.isReady && restoreTo && restoreTo !== ticker) {
      this.withLock(() => {
        primary.controller.restoreSymbol(restoreTo);
        this.paneSymbols.set(0, restoreTo);
      });
    } else if (restoreTo) {
      this.paneSymbols.set(0, restoreTo);
    }
  }

  /** After one drawing completes, return every pane to the Cross tool. */
  async resetToolsToCursor(): Promise<void> {
    this.sharedTool = "cursor";
    this.applyingTool = true;
    try {
      for (const { index, controller } of this.panes.values()) {
        if (index >= this.activeCount || !controller.isReady) continue;
        await controller.selectLineTool("cursor");
      }
    } finally {
      this.applyingTool = false;
    }
  }

  recordPaneInterval(paneIndex: number, interval: Interval): void {
    this.paneIntervals.set(paneIndex, interval);
  }

  recordPaneSymbol(paneIndex: number, ticker: string): void {
    this.paneSymbols.set(paneIndex, ticker);
  }

  notifySymbol(sourceIndex: number, ticker: string): void {
    this.paneSymbols.set(sourceIndex, ticker);
    if (!this.flags.symbol || this.locked) return;
    this.withLock(() => {
      for (const { index, controller } of this.panes.values()) {
        if (index === sourceIndex || index >= this.activeCount) continue;
        controller.setSymbol(ticker);
        this.paneSymbols.set(index, ticker);
      }
    });
  }

  notifyInterval(sourceIndex: number, interval: Interval): void {
    this.paneIntervals.set(sourceIndex, interval);
    // Strict check — never mirror TF unless the user turned Interval sync ON.
    if (this.flags.interval !== true || this.locked) return;
    this.withLock(() => {
      for (const { index, controller } of this.panes.values()) {
        if (index === sourceIndex || index >= this.activeCount) continue;
        controller.setInterval(interval);
        this.paneIntervals.set(index, interval);
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

  private clonePrimarySymbolToNewPanes(fromIndex: number): void {
    if (!this.flags.symbol) return;
    const primary = this.panes.get(0);
    const ticker = primary?.controller.state.get().symbol;
    if (!ticker) return;
    this.withLock(() => {
      for (const { index, controller } of this.panes.values()) {
        if (index <= fromIndex || index >= this.activeCount) continue;
        controller.setSymbol(ticker);
        this.paneSymbols.set(index, ticker);
      }
    });
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
            this.mirrorIds.add(String(created));
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
    const idKey = String(entityId);
    const shouldResetTool =
      eventType === "create" && !this.applyingTool && !this.mirrorIds.has(idKey);

    // Single-pane (or drawings sync off): still return to Cross after one use.
    if (this.activeCount < 2 || !this.flags.drawings) {
      if (shouldResetTool) await this.resetToolsToCursor();
      return;
    }

    if (this.syncingDrawings) return;
    if (paneIndex >= this.activeCount) return;

    // Ignore events from shapes we created as mirrors (prevents sync loops / UI lock).
    if (this.mirrorIds.has(idKey)) {
      if (eventType === "remove") this.mirrorIds.delete(idKey);
      else return;
    }

    if (eventType === "remove") {
      const group = this.entityToGroup.get(idKey);
      if (!group) return;
      this.syncingDrawings = true;
      try {
        for (const [p, eid] of group.entities) {
          if (p === paneIndex) continue;
          this.mirrorIds.add(String(eid));
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
      if (shouldResetTool) await this.resetToolsToCursor();
      return;
    }

    // Selecting a drawing also focuses that pane.
    this.focusPane(paneIndex);

    const source = this.panes.get(paneIndex);
    if (!source?.controller.isReady) {
      if (shouldResetTool) await this.resetToolsToCursor();
      return;
    }
    const chart = source.controller.getWidget()?.activeChart();
    if (!chart) {
      if (shouldResetTool) await this.resetToolsToCursor();
      return;
    }

    // Capture tool hint before we reset to Cross.
    const toolHint =
      normalizeShapeName(source.controller.selectedLineTool()) ??
      normalizeShapeName(this.sharedTool);

    const snap = await readShapeSnapshotRetry(chart, entityId, toolHint);
    if (!snap) {
      if (shouldResetTool) await this.resetToolsToCursor();
      return;
    }

    let group = this.entityToGroup.get(idKey);
    if (!group) {
      group = {
        key: `draw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        entities: new Map(),
      };
      this.groups.push(group);
    }
    group.entities.set(paneIndex, entityId);
    group.shape = snap.shape;
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
          // If an earlier sync created a wrong type (e.g. trend_line for Long),
          // remove and recreate with the correct full shape.
          let peerShape: string | null = null;
          try {
            const peerInfo = destChart.getAllShapes().find((s) => s.id === existing);
            peerShape = normalizeShapeName(peerInfo?.name);
          } catch {
            /* ignore */
          }
          const wrongType =
            peerShape != null &&
            peerShape !== snap.shape &&
            (snap.shape === "long_position" ||
              snap.shape === "short_position" ||
              snap.shape.startsWith("fib_") ||
              peerShape === "trend_line" ||
              peerShape === "horizontal_line");

          if (wrongType) {
            this.mirrorIds.add(String(existing));
            try {
              destChart.removeEntity(existing);
            } catch {
              /* ignore */
            }
            this.entityToGroup.delete(String(existing));
            group.entities.delete(index);
            const created = await createShapeFromSnapshot(destChart, snap);
            if (created) {
              this.mirrorIds.add(String(created));
              group.entities.set(index, created);
              this.entityToGroup.set(String(created), group);
            }
          } else {
            this.mirrorIds.add(String(existing));
            applyShapeSnapshot(destChart, existing, snap);
          }
        } else {
          const created = await createShapeFromSnapshot(destChart, snap);
          if (created) {
            this.mirrorIds.add(String(created));
            group.entities.set(index, created);
            this.entityToGroup.set(String(created), group);
          }
        }
      }
    } finally {
      this.syncingDrawings = false;
    }

    if (shouldResetTool) await this.resetToolsToCursor();
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

  private armPrimaryIntervalGuard(keep: Interval): void {
    this.primaryIntervalGuard = keep;
    this.primaryIntervalGuardUntil = Date.now() + 2000;
  }

  /**
   * CL setResolution is async and can finish after our first restore.
   * Retry with ignore-flag so restore echoes don't re-route to the active pane.
   */
  private forceRestorePrimaryInterval(interval: Interval): void {
    const primary = this.panes.get(0);
    if (!primary?.controller.isReady) {
      this.paneIntervals.set(0, interval);
      return;
    }

    this.ignoringPrimaryInterval = true;
    window.clearTimeout(this.ignorePrimaryIntervalTimer);
    this.ignorePrimaryIntervalTimer = window.setTimeout(() => {
      this.ignoringPrimaryInterval = false;
    }, 2000);

    window.clearTimeout(this.restorePrimaryTimer);
    const delays = [0, 30, 80, 160, 320, 640];
    let step = 0;

    const tick = () => {
      const entry = this.panes.get(0);
      if (!entry?.controller.isReady) return;
      this.locked = true;
      try {
        entry.controller.restoreInterval(interval);
        this.paneIntervals.set(0, interval);
      } finally {
        this.locked = false;
      }

      const current = entry.controller.state.get().interval;
      const widgetRes = (() => {
        try {
          return entry.controller.getWidget()?.activeChart().resolution() as Interval | undefined;
        } catch {
          return undefined;
        }
      })();
      const ok = current === interval && (widgetRes == null || widgetRes === interval);
      step += 1;
      if (ok || step >= delays.length) return;
      this.restorePrimaryTimer = window.setTimeout(tick, delays[step]!);
    };

    tick();
  }
}

export const layoutSyncBus = new LayoutSyncBus();
