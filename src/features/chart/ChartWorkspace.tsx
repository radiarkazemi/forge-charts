import Box from "@mui/material/Box";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useServices } from "@/app/use-services";
import type { ChartLayoutId } from "@/application";
import { useStore } from "@/shared/hooks/useStore";
import { BarReplayToolbar } from "./bar-replay/BarReplayToolbar";
import {
  clipPathExcludingHoles,
  defaultSplitEdges,
  mountFullWidthNavbar,
  paneRectInWorkspace,
  RESIZABLE_LAYOUTS,
  sanitizeSplitEdges,
  watchFavoriteToolbar,
  watchPrimaryMenusOpen,
  type ChromeInsets,
  type MenuHoleRect,
  type PaneSplitEdges,
} from "./chart-layout-geometry";
import { getChartLayoutGrid, MAX_CHART_PANES, phoneChartLayout } from "./chart-layouts";
import { layoutSyncBus } from "./layout-sync";
import { TradingViewChart } from "./TradingViewChart";
import { mountTvLayersHeader, syncHeaderChromeRetry } from "./tv-layers-header";

interface ChartWorkspaceProps {
  readonly onCreateAlert: () => void;
  readonly onOpenProfile: () => void;
}

const DEFAULT_CHROME: ChromeInsets = { headerHeight: 38, leftToolbarWidth: 52, priceAxisWidth: 56 };

function isVerticalSplit(layout: ChartLayoutId): boolean {
  return layout === "2h" || layout === "3h" || layout === "4h";
}

function isFullscreenButton(target: EventTarget | null): boolean {
  const node = target as Element | null;
  if (!node || typeof node.closest !== "function") return false;
  const button = node.closest("button, [role='button']");
  if (!button) return false;
  const id = button.id || "";
  const name = button.getAttribute("data-name") || "";
  const label = `${button.getAttribute("aria-label") || ""} ${button.getAttribute("title") || ""} ${button.getAttribute("data-tooltip") || ""}`;
  return id === "header-toolbar-fullscreen" || name === "header-toolbar-fullscreen" || /full\s*screen/i.test(label);
}

/** Drop a stuck crosshair in every pane except `keepIndex` (-1 clears all). */
function releaseOtherChartPointers(root: HTMLElement | null, keepIndex: number): void {
  if (!root) return;
  const iframes = root.querySelectorAll("iframe");
  iframes.forEach((iframe, index) => {
    if (index === keepIndex) return;
    const doc = iframe.contentDocument;
    if (!doc) return;
    const nodes = doc.querySelectorAll(
      ".chart-gui-wrapper, .chart-container, .chart-markup-table, .pane, canvas, body",
    );
    nodes.forEach((target) => {
      for (const type of ["pointerleave", "pointerout", "pointercancel", "mouseleave", "mouseout"]) {
        target.dispatchEvent(new Event(type, { bubbles: true }));
      }
      target.dispatchEvent(
        new MouseEvent("mousemove", { bubbles: true, clientX: -10000, clientY: -10000 }),
      );
    });
  });
  layoutSyncBus.releaseCrosshair(keepIndex);
}

/**
 * Multi-chart workspace under the original Charting Library top navbar.
 *
 * Advanced Charts cannot natively setLayout(2h) — only layout "s" ships.
 * We keep the unchanged primary CL header full-bleed, clip its plot to pane 0,
 * and layer headerless secondary widgets in the remaining slots underneath.
 */
export function ChartWorkspace({ onCreateAlert, onOpenProfile }: ChartWorkspaceProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"), { noSsr: true });
  const { settings, barReplay } = useServices();
  const storedLayout = useStore(settings.settings, (s) => s.chartLayout ?? "s");
  // Phone: one chart, or the stacked 2 / stacked 3. Side-by-side grids stay on the desktop.
  const chartLayout = isMobile ? phoneChartLayout(storedLayout) : storedLayout;
  const paneSymbols = useStore(settings.settings, (s) => (Array.isArray(s.paneSymbols) ? s.paneSymbols : []));
  const lastSymbol = useStore(settings.settings, (s) => s.lastSymbol || "XAUUSD");
  const lastInterval = useStore(settings.settings, (s) => s.lastInterval || "15");
  const layoutSync = useStore(settings.settings, (s) => s.layoutSync);
  const replayActive = useStore(barReplay.state, (s) => s.active);
  const grid = getChartLayoutGrid(chartLayout ?? "s");
  const multi = grid.count > 1;
  const layoutId = chartLayout ?? "s";
  const [activePane, setActivePane] = useState(0);
  const [chrome, setChrome] = useState<ChromeInsets>(DEFAULT_CHROME);
  const [workspaceSize, setWorkspaceSize] = useState({ width: 0, height: 0 });
  const [splitEdges, setSplitEdges] = useState<number[]>(() => defaultSplitEdges(layoutId));
  const [draggingEdge, setDraggingEdge] = useState<number | null>(null);
  /**
   * Header menus live inside the primary iframe. We never raise that iframe above
   * layers (transparent iframe still occludes siblings). Instead secondaries get
   * pointer-events:none + a clip-path hole around the open menu.
   */
  const [menusOpen, setMenusOpen] = useState(false);
  const [menuHole, setMenuHole] = useState<MenuHoleRect | null>(null);
  const [favHole, setFavHole] = useState<MenuHoleRect | null>(null);
  /** One chart filling the workspace. Null is the multi-pane grid. */
  const [maximizedPane, setMaximizedPane] = useState<number | null>(null);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const primaryHostRef = useRef<HTMLDivElement | null>(null);
  const layoutRef = useRef<ChartLayoutId>(layoutId);
  const splitEdgesRef = useRef<PaneSplitEdges>(splitEdges);
  const activePaneRef = useRef(0);
  const maximizedPaneRef = useRef<number | null>(null);
  layoutRef.current = layoutId;
  splitEdgesRef.current = splitEdges;
  activePaneRef.current = activePane;
  maximizedPaneRef.current = maximizedPane;

  // Reset dividers when the layout shape changes.
  useEffect(() => {
    setSplitEdges(defaultSplitEdges(layoutId));
    setMaximizedPane(null);
  }, [layoutId]);

  useEffect(() => {
    // Independent timeframes by default — Interval sync only when explicitly true.
    layoutSyncBus.setFlags({
      symbol: layoutSync?.symbol !== false,
      interval: layoutSync?.interval === true,
      crosshair: layoutSync?.crosshair === true,
      time: layoutSync?.time === true,
      dateRange: layoutSync?.dateRange === true,
      drawings: layoutSync?.drawings !== false,
      indicators: layoutSync?.indicators === true,
    });
  }, [layoutSync]);

  // Symbol sync ON + multipane: push primary ticker to every pane so a stale
  // NAS100 header / XAUUSD left pane cannot diverge after layout reload.
  useEffect(() => {
    if (!multi || layoutSync?.symbol === false) return;
    const timers = [400, 1200].map((ms) =>
      window.setTimeout(() => {
        const ticker =
          layoutSyncBus.getPaneState(0).symbol ||
          settings.settings.get().paneSymbols[0] ||
          settings.settings.get().lastSymbol ||
          "XAUUSD";
        if (!ticker) return;
        layoutSyncBus.notifySymbol(0, ticker);
        for (let i = 0; i < grid.count; i += 1) {
          settings.setPaneSymbol(i, ticker);
        }
      }, ms),
    );
    return () => {
      for (const t of timers) window.clearTimeout(t);
    };
    // Intentionally omit paneSymbols — setPaneSymbol would retrigger a loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- layout/sync only
  }, [multi, layoutId, layoutSync?.symbol, grid.count, settings]);

  useEffect(() => {
    layoutSyncBus.setActiveCount(grid.count);
    // Reflow every visible pane after layout paint — panes 2–3 often stay at 1×1
    // until a real resize hits their iframe (tools/hit-test then fail on those layers).
    const delays = [50, 150, 400, 900, 1600];
    const timers = delays.map((ms) => window.setTimeout(() => layoutSyncBus.reflowVisible(), ms));
    return () => {
      for (const t of timers) window.clearTimeout(t);
    };
  }, [chartLayout, grid.count, workspaceSize.width, workspaceSize.height, splitEdges]);

  useEffect(() => layoutSyncBus.subscribeActivePane(setActivePane), []);

  useEffect(() => {
    const el = workspaceRef.current;
    if (!el) return;
    const measure = () => {
      setWorkspaceSize({ width: el.clientWidth, height: el.clientHeight });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /**
   * The header fullscreen button asks the library to fullscreen the primary iframe.
   * In a multi-chart layout that request is cancelled at once, so the chart snaps
   * back. Keep the chosen chart large inside the workspace instead, and let the
   * same button restore the grid.
   */
  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) return;

    const reflow = () => {
      const measure = () => {
        setWorkspaceSize({
          width: workspace.clientWidth,
          height: workspace.clientHeight,
        });
      };
      measure();
      layoutSyncBus.reflowVisible();
      window.setTimeout(measure, 50);
      window.setTimeout(() => layoutSyncBus.reflowVisible(), 80);
      window.setTimeout(() => layoutSyncBus.reflowVisible(), 250);
      window.setTimeout(() => layoutSyncBus.reflowVisible(), 600);
    };

    const onFsChange = () => {
      const fsEl = document.fullscreenElement;
      // Never turn a cancelled browser fullscreen into another maximize.
      // That second write is why one press took three clicks to undo.
      if (multi && fsEl && workspace.contains(fsEl)) {
        void document.exitFullscreen?.().catch(() => undefined);
        return;
      }
      reflow();
    };

    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("webkitfullscreenchange", onFsChange as EventListener);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("webkitfullscreenchange", onFsChange as EventListener);
    };
  }, [multi]);

  useEffect(() => {
    if (!multi) return;
    const timers = [0, 80, 240, 600].map((ms) =>
      window.setTimeout(() => {
        window.dispatchEvent(new Event("resize"));
        layoutSyncBus.reflowVisible();
      }, ms),
    );
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [maximizedPane, multi]);

  useEffect(() => {
    if (!multi) return;
    const host = primaryHostRef.current;
    if (!host) return;

    const toggle = () => {
      setMaximizedPane((current) => {
        const next = current == null ? activePaneRef.current : null;
        maximizedPaneRef.current = next;
        return next;
      });
    };

    let doc: Document | null = null;
    const keyDocs = new Set<Document>();
    const patched = new Set<Window>();
    let toggling = false;
    const press = () => {
      if (toggling) return;
      toggling = true;
      window.setTimeout(() => {
        toggling = false;
      }, 500);
      toggle();
    };
    const elementProto = (win: Window) =>
      (win as unknown as { Element?: { prototype: Element & { __forgeFsBlocked?: boolean; __forgeFsOrig?: typeof Element.prototype.requestFullscreen } } }).Element?.prototype;
    const swallowFullscreen = (win: Window) => {
      const proto = elementProto(win);
      if (!proto || proto.__forgeFsBlocked) return;
      proto.__forgeFsOrig = proto.requestFullscreen;
      // Shift+F calls this. Expand the selected chart instead of the browser.
      proto.requestFullscreen = function requestFullscreen(this: Element) {
        const win = this.ownerDocument?.defaultView;
        const frames = [...(workspaceRef.current?.querySelectorAll("iframe") ?? [])];
        const index = frames.findIndex((frame) => frame.contentWindow === win);
        if (index >= 0) {
          activePaneRef.current = index;
          layoutSyncBus.focusPaneFromPlot(index);
        }
        press();
        return Promise.resolve();
      };
      proto.__forgeFsBlocked = true;
      patched.add(win);
    };
    const onKey = (event: KeyboardEvent) => {
      if (!event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key !== "f" && event.key !== "F") return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      event.preventDefault();
      event.stopPropagation();
      const node = event.currentTarget as Document | null;
      const fromDoc = node && node.nodeType === 9 ? node.defaultView : null;
      const win = fromDoc ?? event.view ?? null;
      const frames = [...(workspaceRef.current?.querySelectorAll("iframe") ?? [])];
      const index = frames.findIndex((frame) => frame.contentWindow === win);
      if (index >= 0) {
        activePaneRef.current = index;
        layoutSyncBus.focusPaneFromPlot(index);
      }
      press();
    };
    const onPress = (event: Event) => {
      if (!isFullscreenButton(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      if (typeof (event as Event & { stopImmediatePropagation?: () => void }).stopImmediatePropagation === "function") {
        (event as Event & { stopImmediatePropagation: () => void }).stopImmediatePropagation();
      }
      press();
    };
    const pressEvents = ["pointerdown", "mousedown", "pointerup", "mouseup", "click"] as const;
    const attach = () => {
      const frames = workspaceRef.current?.querySelectorAll("iframe") ?? [];
      for (const frame of frames) {
        const win = frame.contentWindow;
        if (win) swallowFullscreen(win);
        const next = frame.contentDocument;
        if (!next || keyDocs.has(next)) continue;
        keyDocs.add(next);
        next.addEventListener("keydown", onKey, true);
      }
      const primary = host.querySelector("iframe")?.contentDocument ?? null;
      if (!primary || primary === doc) return;
      if (doc) {
        for (const type of pressEvents) doc.removeEventListener(type, onPress, true);
      }
      doc = primary;
      for (const type of pressEvents) doc.addEventListener(type, onPress, true);
    };
    attach();
    window.addEventListener("keydown", onKey, true);
    const poll = window.setInterval(attach, 500);
    return () => {
      window.clearInterval(poll);
      window.removeEventListener("keydown", onKey, true);
      if (doc) {
        for (const type of pressEvents) doc.removeEventListener(type, onPress, true);
      }
      for (const keyDoc of keyDocs) keyDoc.removeEventListener("keydown", onKey, true);
      for (const win of patched) {
        const proto = elementProto(win);
        if (proto?.__forgeFsOrig) {
          proto.requestFullscreen = proto.__forgeFsOrig;
          proto.__forgeFsBlocked = false;
        }
      }
    };
  }, [multi, chartLayout]);

  // The primary iframe stays full-window so the original navbar spans every pane.
  // The plot inside it is sized to pane 0; the header element is left alone.
  useEffect(() => {
    const host = primaryHostRef.current;
    if (!host) return;
    if (!multi) return;
    return mountFullWidthNavbar(
      host,
      () => layoutRef.current,
      (next) => {
        setChrome((prev) =>
          prev.headerHeight === next.headerHeight &&
          prev.leftToolbarWidth === next.leftToolbarWidth &&
          prev.priceAxisWidth === next.priceAxisWidth
            ? prev
            : next,
        );
      },
      () => splitEdgesRef.current,
      () => maximizedPaneRef.current === 0,
    );
  }, [chartLayout, multi]);

  // Layout / TF / indicator menus live in the primary iframe — punch a hole in layers.
  useEffect(() => {
    if (!multi) {
      setMenusOpen(false);
      setMenuHole(null);
      setFavHole(null);
      return;
    }
    const host = primaryHostRef.current;
    if (!host) return;
    return watchPrimaryMenusOpen(host, (state) => {
      setMenusOpen(state.open);
      // Hole comes in viewport coords — convert to workspace-local for clip-path.
      const wr = workspaceRef.current?.getBoundingClientRect();
      if (!state.hole || !wr) {
        setMenuHole(state.hole);
        return;
      }
      setMenuHole({
        left: state.hole.left - wr.left,
        top: state.hole.top - wr.top,
        width: state.hole.width,
        height: state.hole.height,
      });
    });
  }, [multi, chartLayout]);

  // The one favorite-tools bar can sit on any pane. Keep a hole under it so
  // the pane drawn above the main iframe does not cover the bar.
  useEffect(() => {
    if (!multi) return;
    const host = primaryHostRef.current;
    if (!host) return;
    return watchFavoriteToolbar(host, (hole) => {
      const wr = workspaceRef.current?.getBoundingClientRect();
      if (!hole || !wr) {
        setFavHole(hole);
        return;
      }
      setFavHole({
        left: hole.left - wr.left,
        top: hole.top - wr.top,
        width: hole.width,
        height: hole.height,
      });
    });
  }, [multi, chartLayout]);

  // An open layout menu sits over the panes. Clear every crosshair so the
  // full-size primary chart does not keep drawing a line under the menu.
  useEffect(() => {
    if (!menusOpen) return;
    releaseOtherChartPointers(workspaceRef.current, -1);
  }, [menusOpen]);

  // TV layers: route Symbol / Interval / Indicators from the shared header to the active pane.
  useEffect(() => {
    if (!multi) return;
    const host = primaryHostRef.current;
    if (!host) return;
    return mountTvLayersHeader(host);
  }, [multi, chartLayout]);

  // Leaving multipane: restore header chrome to the primary plot (clears stuck NAS100 / Radiar TF).
  useEffect(() => {
    if (multi) return;
    const host = primaryHostRef.current;
    if (!host) return;
    const apply = () => {
      const doc = host.querySelector("iframe")?.contentDocument;
      if (!doc) return;
      const st = layoutSyncBus.getPaneState(0);
      syncHeaderChromeRetry(doc, st.symbol || lastSymbol, st.interval || lastInterval);
    };
    const timers = [80, 400, 1000].map((ms) => window.setTimeout(apply, ms));
    return () => {
      for (const t of timers) window.clearTimeout(t);
    };
  }, [multi, lastSymbol, lastInterval]);

  const edgesForLayout = RESIZABLE_LAYOUTS.has(layoutId)
    ? sanitizeSplitEdges(layoutId, splitEdges)
    : [];
  const layoutChrome = chrome;
  const maximized =
    maximizedPane != null && maximizedPane >= 0 && maximizedPane < grid.count ? maximizedPane : null;
  const expandedRect = () => {
    if (workspaceSize.width < 8 || workspaceSize.height < 8) return null;
    return {
      left: layoutChrome.leftToolbarWidth,
      top: layoutChrome.headerHeight,
      width: Math.max(0, workspaceSize.width - layoutChrome.leftToolbarWidth),
      height: Math.max(0, workspaceSize.height - layoutChrome.headerHeight),
    };
  };

  const beginDrag = useCallback((edgeIndex: number, event: ReactPointerEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDraggingEdge(edgeIndex);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }, []);

  useEffect(() => {
    if (draggingEdge == null) return;
    const vertical = isVerticalSplit(layoutId);
    const onMove = (event: PointerEvent) => {
      const el = workspaceRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const contentLeft = rect.left + layoutChrome.leftToolbarWidth;
      const contentTop = rect.top + layoutChrome.headerHeight;
      const contentW = Math.max(1, rect.width - layoutChrome.leftToolbarWidth);
      const contentH = Math.max(1, rect.height - layoutChrome.headerHeight);
      const frac = vertical
        ? (event.clientX - contentLeft) / contentW
        : (event.clientY - contentTop) / contentH;
      setSplitEdges((prev) => {
        const next = [...sanitizeSplitEdges(layoutId, prev)];
        next[draggingEdge] = frac;
        return sanitizeSplitEdges(layoutId, next);
      });
    };
    const onUp = () => setDraggingEdge(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [draggingEdge, layoutId, layoutChrome.headerHeight, layoutChrome.leftToolbarWidth]);

  return (
    <Box
      ref={workspaceRef}
      sx={{
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        position: "relative",
        bgcolor: "#2a2e39",
        overflow: "hidden",
        cursor: draggingEdge != null ? (isVerticalSplit(layoutId) ? "col-resize" : "row-resize") : undefined,
        userSelect: draggingEdge != null ? "none" : undefined,
      }}
    >
      {/* Full-window widget so the original navbar spans the workspace. The plot is sized to pane 0. */}
      <Box
        ref={primaryHostRef}
        // Header / left toolbar clicks must NOT steal focus from the active layer.
        // Pane 0 focus comes from CL mouse_down on the plot (and the plot outline hit area).
        sx={{
          position: "absolute",
          inset: 0,
          // Stay under secondary layers. The navbar strip is above those layers
          // because they begin below the header. Menus show through clip-path holes.
          zIndex: 1,
          bgcolor: multi ? "transparent" : "background.default",
          overflow: "hidden",
        }}
      >
        <TradingViewChart
          onCreateAlert={onCreateAlert}
          onOpenProfile={onOpenProfile}
          paneIndex={0}
          initialSymbol={paneSymbols[0] ?? lastSymbol}
          hideHeader={false}
          transparentShell={multi}
        />
      </Box>

      {/* Secondary layers under the original navbar (kept mounted for layout switches). */}
      {Array.from({ length: MAX_CHART_PANES - 1 }, (_, offset) => {
        const index = offset + 1;
        const visible = multi && index < grid.count && (maximized == null || maximized === index);
        const rect = !visible
          ? null
          : maximized === index
            ? expandedRect()
            : paneRectInWorkspace(layoutId, index, workspaceSize, layoutChrome, edgesForLayout);
        const shown = Boolean(visible && rect && rect.width >= 8 && rect.height >= 8);
        const isActive = shown && activePane === index;
        const symbol = paneSymbols[index] ?? lastSymbol;
        const holes = [menusOpen ? menuHole : null, favHole];
        const holeClip =
          shown && rect
            ? clipPathExcludingHoles(
                { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
                holes,
              )
            : undefined;
        return (
          <Box
            key={`forge-layer-${index}`}
            onPointerEnter={() => {
              if (!shown) return;
              // The primary iframe is full-size under these panes. Leaving the
              // crosshair alive there draws a column of lines and steals the cursor.
              releaseOtherChartPointers(workspaceRef.current, index);
            }}
            onPointerLeave={() => {
              if (!shown) return;
              const iframe = workspaceRef.current?.querySelectorAll("iframe")[index];
              const clear = () => releaseOtherChartPointers(iframe ? iframe.parentElement : null, -1);
              // A fast jump can redraw the crosshair after the first leave.
              clear();
              window.setTimeout(() => {
                if (!iframe?.matches(":hover") && !iframe?.parentElement?.matches(":hover")) clear();
              }, 60);
            }}
            onPointerDownCapture={() => {
              if (shown && !menusOpen) layoutSyncBus.focusPaneFromPlot(index);
            }}
            sx={{
              position: "absolute",
              top: shown && rect ? rect.top : 0,
              left: shown && rect ? rect.left : 0,
              width: shown && rect ? rect.width : 1,
              height: shown && rect ? rect.height : 1,
              // Always above the primary shell so panes stay painted.
              zIndex: isActive ? 3 : 2,
              display: shown ? "block" : "none",
              // Keep the pane as the hit target. The menu shows through the
              // clip-path hole, which does not receive the pointer.
              pointerEvents: "auto",
              clipPath: holeClip,
              outline: isActive ? "2px solid #2962FF" : "1px solid #2a2e39",
              outlineOffset: "-1px",
              bgcolor: "background.default",
              overflow: "hidden",
            }}
          >
            {isActive ? (
              <Box
                aria-hidden
                title="Active chart"
                sx={{
                  position: "absolute",
                  left: 10,
                  bottom: 36,
                  zIndex: 5,
                  width: 18,
                  height: 18,
                  pointerEvents: "none",
                  color: "#2962FF",
                  filter: "drop-shadow(0 0 2px rgba(0,0,0,0.6))",
                }}
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                  <path d="M12 2.5l2.9 6.1 6.7.9-4.9 4.6 1.3 6.6L12 17.8 5.9 20.7l1.3-6.6L2.4 9.5l6.7-.9L12 2.5z" />
                </svg>
              </Box>
            ) : null}
            <TradingViewChart
              onCreateAlert={onCreateAlert}
              onOpenProfile={onOpenProfile}
              paneIndex={index}
              initialSymbol={symbol}
              hideHeader
            />
          </Box>
        );
      })}

      {/* Active outline for primary plot slot (navbar stays untouched). */}
      {multi && maximized == null && activePane === 0
        ? (() => {
            const rect = paneRectInWorkspace(layoutId, 0, workspaceSize, layoutChrome, edgesForLayout);
            if (!rect) return null;
            return (
              <Box
                aria-hidden
                sx={{
                  position: "absolute",
                  top: rect.top,
                  left: rect.left,
                  width: rect.width,
                  height: rect.height,
                  zIndex: 4,
                  pointerEvents: "none",
                  outline: "2px solid #2962FF",
                  outlineOffset: "-2px",
                }}
              />
            );
          })()
        : null}

      {/* Draggable middle lines for 2-/3-pane strip layouts. */}
      {multi && maximized == null && edgesForLayout.length > 0
        ? edgesForLayout.map((frac, edgeIndex) => {
            const vertical = isVerticalSplit(layoutId);
            const contentW = Math.max(0, workspaceSize.width - layoutChrome.leftToolbarWidth);
            const contentH = Math.max(0, workspaceSize.height - layoutChrome.headerHeight);
            const left = vertical
              ? layoutChrome.leftToolbarWidth + frac * contentW - 3
              : layoutChrome.leftToolbarWidth;
            const top = vertical
              ? layoutChrome.headerHeight
              : layoutChrome.headerHeight + frac * contentH - 3;
            const width = vertical ? 6 : contentW;
            const height = vertical ? contentH : 6;
            return (
              <Box
                key={`forge-split-${edgeIndex}`}
                onPointerDown={(event) => beginDrag(edgeIndex, event)}
                title="Drag to resize panes"
                sx={{
                  position: "absolute",
                  left,
                  top,
                  width,
                  height,
                  zIndex: 20,
                  cursor: vertical ? "col-resize" : "row-resize",
                  bgcolor: draggingEdge === edgeIndex ? "rgba(41,98,255,0.45)" : "transparent",
                  "&:hover": { bgcolor: "rgba(41,98,255,0.28)" },
                  touchAction: "none",
                }}
              />
            );
          })
        : null}

      {/* Replay strip above all multipane layers (primary host is zIndex 1). */}
      {replayActive ? (
        <Box
          sx={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 50,
            pointerEvents: "none",
            "& > *": { pointerEvents: "auto" },
          }}
        >
          <BarReplayToolbar controller={barReplay} />
        </Box>
      ) : null}
    </Box>
  );
}
