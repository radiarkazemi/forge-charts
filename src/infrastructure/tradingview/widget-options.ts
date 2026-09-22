import type { ThemeMode } from "@/application";
import type { Interval } from "@/domain";
import { FONT_FAMILY, TOKENS } from "@/shared/theme/tokens";
import type {
  ChartingLibraryFeatureset,
  ChartingLibraryWidgetOptions,
  IBasicDataFeed,
  IExternalSaveLoadAdapter,
  ResolutionString,
  TimeFrameItem,
} from "./types";

export interface WidgetOptionsInput {
  readonly container: HTMLElement;
  readonly datafeed: IBasicDataFeed;
  readonly saveLoadAdapter: IExternalSaveLoadAdapter;
  readonly libraryPath: string;
  readonly symbol: string;
  readonly interval: Interval;
  readonly theme: ThemeMode;
  readonly savedState?: object;
}

const ENABLED_FEATURES: ChartingLibraryFeatureset[] = [
  "study_templates",
  "items_favoriting",
  "side_toolbar_in_fullscreen_mode",
  "header_in_fullscreen_mode",
  "use_localstorage_for_settings",
  "pre_post_market_sessions",
  "chart_template_storage",
  "seconds_resolution",
];

const DISABLED_FEATURES: ChartingLibraryFeatureset[] = ["popup_hints", "symbol_info_price_source"];

const FAVORITE_INTERVALS = [
  "1",
  "3",
  "5",
  "15",
  "30",
  "60",
  "120",
  "240",
  "1D",
  "1W",
  "1M",
  "1S",
  "5S",
  "15S",
  "30S",
] as ResolutionString[];

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
  const light = theme === "light";
  return {
    "paneProperties.background": t.background,
    "paneProperties.backgroundType": "solid",
    "paneProperties.vertGridProperties.color": t.grid,
    "paneProperties.horzGridProperties.color": t.grid,
    "paneProperties.crossHairProperties.color": t.crosshair,
    "scalesProperties.textColor": t.textMuted,
    "scalesProperties.lineColor": t.border,
    "mainSeriesProperties.candleStyle.upColor": t.up,
    "mainSeriesProperties.candleStyle.downColor": t.down,
    "mainSeriesProperties.candleStyle.borderUpColor": light ? "#131722" : t.up,
    "mainSeriesProperties.candleStyle.borderDownColor": light ? "#131722" : t.down,
    "mainSeriesProperties.candleStyle.wickUpColor": light ? "#131722" : t.up,
    "mainSeriesProperties.candleStyle.wickDownColor": light ? "#131722" : t.down,
    "mainSeriesProperties.candleStyle.drawWick": true,
    "mainSeriesProperties.candleStyle.drawBorder": true,
    "mainSeriesProperties.candleStyle.drawBody": true,
    "mainSeriesProperties.hollowCandleStyle.upColor": t.up,
    "mainSeriesProperties.hollowCandleStyle.downColor": t.down,
    "mainSeriesProperties.hollowCandleStyle.borderUpColor": light ? "#131722" : t.up,
    "mainSeriesProperties.hollowCandleStyle.borderDownColor": light ? "#131722" : t.down,
    "mainSeriesProperties.hollowCandleStyle.wickUpColor": light ? "#131722" : t.up,
    "mainSeriesProperties.hollowCandleStyle.wickDownColor": light ? "#131722" : t.down,
    "mainSeriesProperties.barStyle.upColor": light ? "#131722" : t.up,
    "mainSeriesProperties.barStyle.downColor": light ? "#131722" : t.down,
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
    header_widget_buttons_mode: "adaptive",
    enabled_features: ENABLED_FEATURES,
    disabled_features: DISABLED_FEATURES,
    favorites: {
      intervals: FAVORITE_INTERVALS,
      chartTypes: ["Candles", "Heiken Ashi", "Line", "Area"],
    },
    time_frames: TIME_FRAMES,
    loading_screen: { backgroundColor: tokens.background, foregroundColor: tokens.accent },
    overrides: chartOverrides(input.theme),
    studies_overrides: studiesOverrides(input.theme),
    save_load_adapter: input.saveLoadAdapter,
    saved_data: input.savedState,
    auto_save_delay: 5,
    charts_storage_api_version: "1.1",
    client_id: "forge-charts",
    user_id: "local",
  };
}
