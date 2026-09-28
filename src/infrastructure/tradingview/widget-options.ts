import type { ThemeMode } from "@/application";
import type { Interval } from "@/domain";
import { FONT_FAMILY, TOKENS } from "@/shared/theme/tokens";
import type {
  ChartingLibraryFeatureset,
  ChartingLibraryWidgetOptions,
  CustomIndicator,
  DrawingToolIdentifier,
  IBasicDataFeed,
  IExternalSaveLoadAdapter,
  ResolutionString,
  TimeFrameItem,
} from "./types";
import { createDealingRangesIndicator } from "@/features/chart/dealing-ranges-indicator";

export interface WidgetOptionsInput {
  readonly container: HTMLElement;
  readonly datafeed: IBasicDataFeed;
  readonly saveLoadAdapter: IExternalSaveLoadAdapter;
  readonly libraryPath: string;
  readonly symbol: string;
  readonly interval: Interval;
  readonly theme: ThemeMode;
  readonly savedState?: object;
  /** Narrow viewports get adaptive header labels and mobile chart features. */
  readonly isMobile?: boolean;
  /** No left drawing toolbar (secondary panes). */
  readonly secondaryPane?: boolean;
  /**
   * Hide the Charting Library top header (multi-layout uses a shared Forge bar
   * above the grid). Left toolbar can still be enabled on the primary pane.
   */
  readonly hideHeader?: boolean;
}

const ENABLED_FEATURES: ChartingLibraryFeatureset[] = [
  "header_widget",
  "header_symbol_search",
  "header_resolutions",
  "header_chart_type",
  "header_indicators",
  "header_compare",
  "header_undo_redo",
  "header_quick_search",
  "header_screenshot",
  "header_settings",
  "header_fullscreen_button",
  "header_saveload",
  "header_in_fullscreen_mode",
  "side_toolbar_in_fullscreen_mode",
  "left_toolbar",
  "show_object_tree",
  "object_tree_legend_mode",
  "study_templates",
  "chart_template_storage",
  "items_favoriting",
  "use_localstorage_for_settings",
  "pre_post_market_sessions",
  "seconds_resolution",
  "display_market_status",
  "show_interval_dialog_on_key_press",
  "legend_widget",
  "edit_buttons_in_legend",
  "always_show_legend_values_on_mobile",
  "show_zoom_and_move_buttons_on_touch",
  // Candle close countdown on the price scale (intraday resolutions).
  "countdown",
];

const DISABLED_FEATURES: ChartingLibraryFeatureset[] = [
  "popup_hints",
  "symbol_info_price_source",
  // Keep the drawing toolbar visible on first visit (matches TradingView).
  "hide_left_toolbar_by_default",
  // Do not auto-create a Volume pane — user adds it via Indicators if wanted.
  "create_volume_indicator_by_default",
  // Runtime featureset (not always in public d.ts): hides bottom-left TradingView logo.
  "widget_logo" as ChartingLibraryFeatureset,
];

const HEADER_FEATURES: ChartingLibraryFeatureset[] = [
  "header_widget",
  "header_symbol_search",
  "header_resolutions",
  "header_chart_type",
  "header_indicators",
  "header_compare",
  "header_undo_redo",
  "header_quick_search",
  "header_screenshot",
  "header_settings",
  "header_fullscreen_button",
  "header_saveload",
  "header_in_fullscreen_mode",
];

const SECONDARY_DISABLED: ChartingLibraryFeatureset[] = [
  ...DISABLED_FEATURES,
  ...HEADER_FEATURES,
  // Keep bottom time-axis / rangeframes on each layer (matches TV multi-chart).
  "left_toolbar",
  "side_toolbar_in_fullscreen_mode",
];

const NO_HEADER_DISABLED: ChartingLibraryFeatureset[] = [
  ...DISABLED_FEATURES,
  ...HEADER_FEATURES,
];

/** Match TradingView's common top-bar favorites: 1m 5m 15m 30m 1h 4h D W M 3M */
const FAVORITE_INTERVALS = ["1", "5", "15", "30", "60", "240", "1D", "1W", "1M", "3M"] as ResolutionString[];

/**
 * Stars in the left drawing toolbar flyouts — match tradingview.com Supercharts
 * (Lines / Channels groups). Icons, labels, shortcuts, and draw behavior come
 * from the Charting Library; favorites only control which tools are starred.
 *
 * LINES starred: Trendline, Ray, Horizontal line, Horizontal ray
 * CHANNELS starred: Parallel channel, Flat top/bottom, Disjoint channel
 */
const FAVORITE_DRAWING_TOOLS = [
  "LineToolTrendLine",
  "LineToolRay",
  "LineToolHorzLine",
  "LineToolHorzRay",
  "LineToolParallelChannel",
  "LineToolFlatBottom",
  "LineToolDisjointAngle",
] as DrawingToolIdentifier[];

/** Bump to re-seed TV `chart.favoriteDrawings` when the default star set changes. */
export const DRAWING_FAVORITES_SEED = "forge.drawingFavorites.v2";

/** Clear stale Charting Library drawing favorites so Widget `favorites` apply. */
export function seedDrawingFavorites(tools: readonly DrawingToolIdentifier[] = FAVORITE_DRAWING_TOOLS): void {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return;
  try {
    if (localStorage.getItem(DRAWING_FAVORITES_SEED) === "1") return;
    const payload = JSON.stringify([...tools]);
    const keys = new Set<string>(["chart.favoriteDrawings"]);
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && /favoriteDrawings/i.test(key)) keys.add(key);
    }
    for (const key of keys) {
      try {
        localStorage.setItem(key, payload);
      } catch {
        /* ignore quota / private mode */
      }
    }
    localStorage.setItem(DRAWING_FAVORITES_SEED, "1");
  } catch {
    /* ignore */
  }
}

const TIME_FRAMES: TimeFrameItem[] = [
  { text: "1d", resolution: "5" as ResolutionString, description: "1 Day", title: "1D" },
  { text: "5d", resolution: "15" as ResolutionString, description: "5 Days", title: "5D" },
  { text: "1m", resolution: "60" as ResolutionString, description: "1 Month", title: "1M" },
  { text: "3m", resolution: "240" as ResolutionString, description: "3 Months", title: "3M" },
  { text: "6m", resolution: "1D" as ResolutionString, description: "6 Months", title: "6M" },
  { text: "12m", resolution: "1D" as ResolutionString, description: "1 Year", title: "1Y" },
  { text: "60m", resolution: "1W" as ResolutionString, description: "5 Years", title: "5Y" },
  { text: "100y", resolution: "1M" as ResolutionString, description: "All", title: "All" },
];

/** Chart-canvas overrides derived from the shared design tokens. */
export function chartOverrides(theme: ThemeMode): ChartingLibraryWidgetOptions["overrides"] {
  const t = TOKENS[theme];
  return {
    "paneProperties.background": t.background,
    "paneProperties.backgroundType": "solid",
    "paneProperties.vertGridProperties.color": t.grid,
    "paneProperties.horzGridProperties.color": t.grid,
    "paneProperties.crossHairProperties.color": t.crosshair,
    "scalesProperties.textColor": t.textMuted,
    "scalesProperties.lineColor": t.border,
    "mainSeriesProperties.showCountdown": true,
    "mainSeriesProperties.candleStyle.upColor": t.up,
    "mainSeriesProperties.candleStyle.downColor": t.down,
    "mainSeriesProperties.candleStyle.borderUpColor": t.up,
    "mainSeriesProperties.candleStyle.borderDownColor": t.down,
    "mainSeriesProperties.candleStyle.wickUpColor": t.up,
    "mainSeriesProperties.candleStyle.wickDownColor": t.down,
    "mainSeriesProperties.candleStyle.drawWick": true,
    "mainSeriesProperties.candleStyle.drawBorder": true,
    "mainSeriesProperties.candleStyle.drawBody": true,
    "mainSeriesProperties.hollowCandleStyle.upColor": t.up,
    "mainSeriesProperties.hollowCandleStyle.downColor": t.down,
    "mainSeriesProperties.hollowCandleStyle.borderUpColor": t.up,
    "mainSeriesProperties.hollowCandleStyle.borderDownColor": t.down,
    "mainSeriesProperties.hollowCandleStyle.wickUpColor": t.up,
    "mainSeriesProperties.hollowCandleStyle.wickDownColor": t.down,
    "mainSeriesProperties.barStyle.upColor": t.up,
    "mainSeriesProperties.barStyle.downColor": t.down,
    "mainSeriesProperties.lineStyle.color": t.accent,
    "mainSeriesProperties.areaStyle.linecolor": t.accent,
  };
}

export function studiesOverrides(theme: ThemeMode): ChartingLibraryWidgetOptions["studies_overrides"] {
  const t = TOKENS[theme];
  return {
    "volume.volume.color.0": t.volumeDown,
    "volume.volume.color.1": t.volumeUp,
  };
}

/** Assemble the full widget options object (Builder-style factory). */
export function buildWidgetOptions(input: WidgetOptionsInput): ChartingLibraryWidgetOptions {
  const tokens = TOKENS[input.theme];
  const mobile = Boolean(input.isMobile);
  const secondary = Boolean(input.secondaryPane);
  const hideHeader = Boolean(input.hideHeader) || secondary;

  const enabled = ENABLED_FEATURES.filter((f) => {
    if (hideHeader && HEADER_FEATURES.includes(f)) return false;
    if (secondary && (f === "left_toolbar" || f === "side_toolbar_in_fullscreen_mode")) return false;
    // Phones: drop bulky header chrome — bottom bar covers search / interval / indicators.
    if (
      mobile &&
      !secondary &&
      !hideHeader &&
      (f === "header_compare" || f === "header_saveload" || f === "header_fullscreen_button")
    ) {
      return false;
    }
    return true;
  });

  const baseDisabled = secondary ? SECONDARY_DISABLED : hideHeader ? NO_HEADER_DISABLED : DISABLED_FEATURES;
  // Mobile: allow hide_left_toolbar_by_default so candles go edge-to-edge until Draw is tapped.
  const disabled =
    mobile && !secondary
      ? baseDisabled.filter((f) => f !== "hide_left_toolbar_by_default")
      : baseDisabled;

  return {
    container: input.container,
    datafeed: input.datafeed,
    library_path: input.libraryPath,
    symbol: input.symbol,
    interval: input.interval as ResolutionString,
    locale: "en",
    timezone: "Etc/UTC",
    theme: input.theme,
    autosize: true,
    fullscreen: false,
    debug: false,
    custom_font_family: FONT_FAMILY,
    // Desktop primary: full labels; mobile / secondary panes: compact.
    header_widget_buttons_mode: mobile || secondary || hideHeader ? "adaptive" : "fullsize",
    custom_css_url: hideHeader ? "/charts/tv-header-secondary.css" : "/charts/tv-header.css",
    // Match TradingView.com flyout wording (Forecasting / Measurers / Sector…).
    custom_translate_function: (originalText) => {
      const map: Record<string, string> = {
        Projection: "Sector",
        Forecast: "Position forecast",
        Measurer: "Measurers",
        "Long Position": "Long position",
        "Short Position": "Short position",
        "Bars Pattern": "Bars pattern",
        "Ghost Feed": "Ghost feed",
        "Fixed Range Volume Profile": "Fixed range volume profile",
        "Price Range": "Price range",
        "Date Range": "Date range",
        "Date and Price Range": "Date and price range",
      };
      return map[originalText] ?? null;
    },
    enabled_features: enabled,
    disabled_features: disabled,
    favorites: {
      intervals: FAVORITE_INTERVALS,
      chartTypes: ["Candles", "Heiken Ashi", "Line", "Area", "Bars"],
      drawingTools: FAVORITE_DRAWING_TOOLS,
    },
    time_frames: TIME_FRAMES,
    loading_screen: { backgroundColor: tokens.background, foregroundColor: tokens.accent },
    overrides: chartOverrides(input.theme),
    // Beat localStorage / autosave that may have turned countdown off.
    settings_overrides: {
      "mainSeriesProperties.showCountdown": true,
    },
    studies_overrides: studiesOverrides(input.theme),
    save_load_adapter: input.saveLoadAdapter,
    // Only the primary pane restores autosaved single-chart state.
    saved_data: secondary ? undefined : input.savedState,
    auto_save_delay: 5,
    charts_storage_api_version: "1.1",
    client_id: "forge-charts",
    user_id: secondary ? `local-pane-${input.symbol}` : "local",
    custom_indicators_getter: (PineJS) =>
      Promise.resolve([createDealingRangesIndicator(PineJS) as CustomIndicator]),
  };
}
