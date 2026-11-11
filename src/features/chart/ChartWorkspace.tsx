import Box from "@mui/material/Box";
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useServices } from "@/app/use-services";
import type { ChartLayoutId } from "@/application";
import { useStore } from "@/shared/hooks/useStore";
import { BarReplayToolbar } from "./bar-replay/BarReplayToolbar";
import {
  clearPrimaryLayoutClip,
  clipPathExcludingHole,
  defaultSplitEdges,
  mountPrimaryLayoutClip,
  paneRectInWorkspace,
  RESIZABLE_LAYOUTS,
  sanitizeSplitEdges,
  watchPrimaryMenusOpen,
  type ChromeInsets,
  type MenuHoleRect,
  type PaneSplitEdges,
} from "./chart-layout-geometry";
import { getChartLayoutGrid, MAX_CHART_PANES } from "./chart-layouts";
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

/**
 * Multi-chart workspace under the original Charting Library top navbar.
 *
 * Advanced Charts cannot natively setLayout(2h) — only layout "s" ships.
 * We keep the unchanged primary CL header full-bleed, clip its plot to pane 0,
 * and layer headerless secondary widgets in the remaining slots underneath.
 */
export function ChartWorkspace({ onCreateAlert, onOpenProfile }: ChartWorkspaceProps) {
  const { settings, barReplay } = useServices();
  const chartLayout = useStore(settings.settings, (s) => s.chartLayout ?? "s");
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
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const primaryHostRef = useRef<HTMLDivElement | null>(null);
  const layoutRef = useRef<ChartLayoutId>(layoutId);
  const splitEdgesRef = useRef<PaneSplitEdges>(splitEdges);
  layoutRef.current = layoutId;
  splitEdgesRef.current = splitEdges;

  // Reset dividers when the layout shape changes.
  useEffect(() => {
    setSplitEdges(defaultSplitEdges(layoutId));
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
   * CL’s header fullscreen targets the primary iframe only — multipane secondaries
   * then sit outside the fullscreen element and paint white. Promote fullscreen to
   * the whole workspace so every pane stays sized and visible.
   */
  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) return;

    let promoting = false;
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
      if (!fsEl) {
        reflow();
        return;
      }
      // Already the workspace — just reflow after size settles.
      if (fsEl === workspace) {
        reflow();
        return;
      }
      // Primary (or any) iframe went fullscreen while multipane — lift to workspace.
      if (multi && workspace.contains(fsEl) && fsEl !== workspace && !promoting) {
        promoting = true;
        const req =
          workspace.requestFullscreen?.bind(workspace) ??
          (
            workspace as HTMLElement & {
              webkitRequestFullscreen?: () => Promise<void> | void;
            }
          ).webkitRequestFullscreen?.bind(workspace);
        void document
          .exitFullscreen()
          .catch(() => undefined)
          .then(() => {
            try {
              return req?.();
            } catch {
              return undefined;
            }
          })
          .finally(() => {
            promoting = false;
            reflow();
          });
        return;
      }
      reflow();
    };

    document.addEventListener("fullscreenchange", onFsChange);
    // Some WebKit builds still fire the prefixed event.
    document.addEventListener("webkitfullscreenchange", onFsChange as EventListener);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("webkitfullscreenchange", onFsChange as EventListener);
    };
  }, [multi]);

  // Clip primary plot to pane 0; leave the original top navbar full width.
  // Single-pane: always tear down any leftover multi clip so the chart fills.
  useEffect(() => {
    const host = primaryHostRef.current;
    if (!host) return;
    if (!multi) {
      clearPrimaryLayoutClip(host);
      const t1 = window.setTimeout(() => {
        clearPrimaryLayoutClip(host);
        layoutSyncBus.reflowVisible();
      }, 50);
      const t2 = window.setTimeout(() => layoutSyncBus.reflowVisible(), 300);
      return () => {
        window.clearTimeout(t1);
        window.clearTimeout(t2);
      };
    }
    return mountPrimaryLayoutClip(
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
    );
  }, [chartLayout, multi, splitEdges]);

  // Layout / TF / indicator menus live in the primary iframe — punch a hole in layers.
  useEffect(() => {
    if (!multi) {
      setMenusOpen(false);
      setMenuHole(null);
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
      const contentLeft = rect.left + chrome.leftToolbarWidth;
      const contentTop = rect.top + chrome.headerHeight;
      const contentW = Math.max(1, rect.width - chrome.leftToolbarWidth);
      const contentH = Math.max(1, rect.height - chrome.headerHeight);
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
  }, [draggingEdge, layoutId, chrome.headerHeight, chrome.leftToolbarWidth]);

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
      {/* Primary widget: original CL navbar spans the full workspace width. */}
      <Box
        ref={primaryHostRef}
        // Header / left toolbar clicks must NOT steal focus from the active layer.
        // Pane 0 focus comes from CL mouse_down on the plot (and the plot outline hit area).
        sx={{
          position: "absolute",
          inset: 0,
          // Stay under secondary layers. Menus show through clip-path holes instead.
          zIndex: 1,
          bgcolor: multi ? "transparent" : "background.default",
          backgroundColor: multi ? "transparent" : undefined,
          "& iframe": multi ? { backgroundColor: "transparent !important" } : undefined,
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
        const visible = multi && index < grid.count;
        const rect = visible
          ? paneRectInWorkspace(layoutId, index, workspaceSize, chrome, edgesForLayout)
          : null;
        const shown = Boolean(visible && rect && rect.width >= 8 && rect.height >= 8);
        const isActive = shown && activePane === index;
        const symbol = paneSymbols[index] ?? lastSymbol;
        const holeClip =
          shown && rect && menusOpen
            ? clipPathExcludingHole(
                { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
                menuHole,
              )
            : undefined;
        return (
          <Box
            key={`forge-layer-${index}`}
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
              // Pass clicks through to primary header menus; clip a hole so the menu shows.
              pointerEvents: menusOpen ? "none" : "auto",
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
      {multi && activePane === 0
        ? (() => {
            const rect = paneRectInWorkspace(layoutId, 0, workspaceSize, chrome, edgesForLayout);
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
      {multi && edgesForLayout.length > 0
        ? edgesForLayout.map((frac, edgeIndex) => {
            const vertical = isVerticalSplit(layoutId);
            const contentW = Math.max(0, workspaceSize.width - chrome.leftToolbarWidth);
            const contentH = Math.max(0, workspaceSize.height - chrome.headerHeight);
            const left = vertical
              ? chrome.leftToolbarWidth + frac * contentW - 3
              : chrome.leftToolbarWidth;
            const top = vertical
              ? chrome.headerHeight
              : chrome.headerHeight + frac * contentH - 3;
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
