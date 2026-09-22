export interface AppConfig {
  /** URL prefix (with trailing slash) where the TradingView library is served. */
  readonly tvLibraryPath: string;
  readonly cpFetcherEnabled: boolean;
}

function withTrailingSlash(path: string): string {
  return path.endsWith("/") ? path : `${path}/`;
}

/** Read runtime configuration from Vite env vars with safe defaults. */
export function readConfig(env: ImportMetaEnv = import.meta.env): AppConfig {
  return {
    tvLibraryPath: withTrailingSlash(env.VITE_TV_LIBRARY_PATH || "/charting_library/"),
    cpFetcherEnabled: env.VITE_CP_FETCHER_ENABLED === "true",
  };
}
