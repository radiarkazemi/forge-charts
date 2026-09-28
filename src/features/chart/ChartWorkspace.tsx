import Box from "@mui/material/Box";
import { useEffect, useRef, useState } from "react";
import { useServices } from "@/app/use-services";
import type { ChartLayoutId } from "@/application";
import { useStore } from "@/shared/hooks/useStore";
import {
  mountPrimaryLayoutClip,
  paneRectInWorkspace,
  watchPrimaryMenusOpen,
  type ChromeInsets,
} from "./chart-layout-geometry";
import { getChartLayoutGrid, MAX_CHART_PANES } from "./chart-layouts";
import { layoutSyncBus } from "./layout-sync";
import { TradingViewChart } from "./TradingViewChart";
import { mountTvLayersHeader } from "./tv-layers-header";

interface ChartWorkspaceProps {
  readonly onCreateAlert: () => void;
  readonly onOpenProfile: () => void;
}

const DEFAULT_CHROME: ChromeInsets = { headerHeight: 38, leftToolbarWidth: 52, priceAxisWidth: 56 };

/**
 * Multi-chart workspace under the original Charting Library top navbar.
 *
 * Advanced Charts cannot natively setLayout(2h) — only layout "s" ships.
 * We keep the unchanged primary CL header full-bleed, clip its plot to pane 0,
 * and layer headerless secondary widgets in the remaining slots underneath.
 */
export function ChartWorkspace({ onCreateAlert, onOpenProfile }: ChartWorkspaceProps) {
  const { settings } = useServices();
  const chartLayout = useStore(settings.settings, (s) => s.chartLayout ?? "s");
  const paneSymbols = useStore(settings.settings, (s) => (Array.isArray(s.paneSymbols) ? s.paneSymbols : []));
  const lastSymbol = useStore(settings.settings, (s) => s.lastSymbol || "XAUUSD");
  const layoutSync = useStore(settings.settings, (s) => s.layoutSync);
  const grid = getChartLayoutGrid(chartLayout ?? "s");
  const multi = grid.count > 1;
  const [activePane, setActivePane] = useState(0);
  const [chrome, setChrome] = useState<ChromeInsets>(DEFAULT_CHROME);
  const [workspaceSize, setWorkspaceSize] = useState({ width: 0, height: 0 });
  /** When CL header menus are open, secondaries must not cover the dropdown. */
  const [menusOpen, setMenusOpen] = useState(false);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const primaryHostRef = useRef<HTMLDivElement | null>(null);
  const layoutRef = useRef<ChartLayoutId>(chartLayout ?? "s");
  layoutRef.current = chartLayout ?? "s";

  useEffect(() => {
    // Independent timeframes by default — Interval sync only when explicitly true.
    layoutSyncBus.setFlags({
      symbol: layoutSync?.symbol !== false,
      interval: layoutSync?.interval === true,
      crosshair: layoutSync?.crosshair === true,
      time: layoutSync?.time === true,
      dateRange: layoutSync?.dateRange === true,
      drawings: layoutSync?.drawings !== false,
    });
  }, [layoutSync]);

  useEffect(() => {
    layoutSyncBus.setActiveCount(grid.count);
    // One reflow after layout paint — avoid stacked resize storms (lag).
    const t1 = window.setTimeout(() => layoutSyncBus.reflowVisible(), 80);
    const t2 = window.setTimeout(() => layoutSyncBus.reflowVisible(), 400);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [chartLayout, grid.count]);

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

  // Clip primary plot to pane 0; leave the original top navbar full width.
  useEffect(() => {
    const host = primaryHostRef.current;
    if (!host) return;
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
    );
  }, [chartLayout, multi]);

  // Layout / TF / indicator menus live in the primary iframe — don’t let layers steal clicks.
  useEffect(() => {
    if (!multi) {
      setMenusOpen(false);
      return;
    }
    const host = primaryHostRef.current;
    if (!host) return;
    return watchPrimaryMenusOpen(host, setMenusOpen);
  }, [multi, chartLayout]);

  // TV layers: route Symbol / Interval / Indicators from the shared header to the active pane.
  useEffect(() => {
    if (!multi) return;
    const host = primaryHostRef.current;
    if (!host) return;
    return mountTvLayersHeader(host);
  }, [multi, chartLayout]);

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
          // Above layers only while a header menu is open so dropdowns receive clicks.
          // Iframe shell is transparent outside header/plot — secondaries stay visible.
          zIndex: menusOpen ? 6 : 1,
          bgcolor: multi ? "transparent" : "background.default",
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
          ? paneRectInWorkspace(chartLayout ?? "s", index, workspaceSize, chrome)
          : null;
        const shown = Boolean(visible && rect && rect.width >= 8 && rect.height >= 8);
        const isActive = shown && activePane === index;
        const symbol = paneSymbols[index] ?? lastSymbol;
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
              // Stay under header menus (z=6) but always above the idle primary shell.
              zIndex: menusOpen ? 5 : isActive ? 3 : 2,
              display: shown ? "block" : "none",
              // Pass clicks through to primary header menus only — panes stay painted.
              pointerEvents: menusOpen ? "none" : "auto",
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
            const rect = paneRectInWorkspace(chartLayout ?? "s", 0, workspaceSize, chrome);
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
    </Box>
  );
}
