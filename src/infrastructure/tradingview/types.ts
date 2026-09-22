/**
 * Single import point for TradingView Charting Library types. Type-only, so
 * nothing from `public/` ever ends up in the JavaScript bundle — the runtime is
 * loaded as a static script by `library-loader.ts`.
 */
export type {
  Bar as TvBar,
  ChartingLibraryFeatureset,
  ChartingLibraryWidgetOptions,
  ChartData,
  ChartMetaInfo,
  ChartTemplate,
  ChartTemplateContent,
  CrossHairMovedEventParams,
  DatafeedConfiguration,
  DatafeedErrorCallback,
  EntityId,
  HistoryCallback,
  IBasicDataFeed,
  IChartingLibraryWidget,
  IChartWidgetApi,
  IExternalSaveLoadAdapter,
  LibrarySymbolInfo,
  LineToolsAndGroupsLoadRequestContext,
  LineToolsAndGroupsLoadRequestType,
  LineToolsAndGroupsState,
  OnReadyCallback,
  PeriodParams,
  ResolutionString,
  ResolveCallback,
  SearchSymbolsCallback,
  ServerTimeCallback,
  StudyTemplateData,
  StudyTemplateMetaInfo,
  SubscribeBarsCallback,
  ThemeName,
  TimeFrameItem,
  Timezone,
} from "@charting-library";
