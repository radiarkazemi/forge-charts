import type { ChartingLibraryWidgetOptions, IChartingLibraryWidget } from "./types";

export type WidgetConstructor = new (options: ChartingLibraryWidgetOptions) => IChartingLibraryWidget;

declare global {
  interface Window {
    TradingView?: { widget: WidgetConstructor };
  }
}

const SCRIPT_ID = "tradingview-charting-library";

let pending: Promise<WidgetConstructor> | null = null;

/**
 * Lazily injects `charting_library.js` from the static library folder exactly
 * once and resolves with the `widget` constructor.
 *
 * Prefer `charting_library.js` over `charting_library.standalone.js`: the
 * standalone UMD in CL v29.3 only assigns `TradingView.version` on `window`
 * and never exposes `TradingView.widget` (blank chart / banner error).
 * Keeping the library outside the Vite module graph leaves `bundles/` intact.
 */
export function loadChartingLibrary(libraryPath: string): Promise<WidgetConstructor> {
  if (window.TradingView?.widget) return Promise.resolve(window.TradingView.widget);
  if (pending) return pending;

  pending = new Promise<WidgetConstructor>((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    const script = existing ?? document.createElement("script");

    const settle = () => {
      const ctor = window.TradingView?.widget;
      if (ctor) resolve(ctor);
      else reject(new Error("TradingView library loaded but `window.TradingView.widget` is missing"));
    };

    script.addEventListener("load", settle, { once: true });
    script.addEventListener(
      "error",
      () => {
        pending = null;
        reject(new Error(`Failed to load TradingView library from ${libraryPath}`));
      },
      { once: true },
    );

    if (!existing) {
      script.id = SCRIPT_ID;
      script.src = `${libraryPath}charting_library.js`;
      script.async = true;
      document.head.appendChild(script);
    }
  });

  return pending;
}
