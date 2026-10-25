import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { createServices } from "./app/container";

/**
 * Soft settings migration only.
 * Do NOT wipe forge.tv.autosave.* on every deploy — that erased indicators,
 * drawings, and chart layout after hard refresh whenever BOOT_RECOVERY bumped.
 */
const SETTINGS_MIGRATE = "forge.settings.migrate.v1";

function runBootRecovery(): void {
  try {
    if (typeof localStorage === "undefined") return;

    // One-time drop of ancient autosave keys only (never the current v3 key).
    for (const legacy of [
      "forge.tv.autosave",
      "forge.tv.autosave.v2",
      "forge.tv.autosave.pane.1",
      "forge.tv.autosave.pane.2",
      "forge.tv.autosave.pane.3",
    ]) {
      try {
        localStorage.removeItem(legacy);
      } catch {
        /* ignore */
      }
    }

    if (localStorage.getItem(SETTINGS_MIGRATE) === "1") return;

    const raw = localStorage.getItem("forge.settings.v1");
    if (raw) {
      try {
        const settings = JSON.parse(raw) as Record<string, unknown>;
        if (!Array.isArray(settings.paneSymbols)) {
          const last = typeof settings.lastSymbol === "string" ? settings.lastSymbol : "XAUUSD";
          settings.paneSymbols = [last];
        }
        if (typeof settings.chartLayout !== "string") settings.chartLayout = "s";
        if (settings.theme !== "light" && settings.theme !== "dark") settings.theme = "dark";
        if (!settings.layoutSync || typeof settings.layoutSync !== "object") {
          settings.layoutSync = {
            symbol: true,
            interval: false,
            crosshair: false,
            time: false,
            dateRange: false,
            drawings: true,
          };
        } else {
          const ls = settings.layoutSync as Record<string, unknown>;
          if (typeof ls.drawings !== "boolean") ls.drawings = true;
          if (typeof ls.symbol !== "boolean") ls.symbol = true;
        }
        localStorage.setItem("forge.settings.v1", JSON.stringify(settings));
      } catch {
        /* keep broken blob — SettingsService will sanitize */
      }
    }

    localStorage.setItem(SETTINGS_MIGRATE, "1");
  } catch {
    /* private mode / blocked storage */
  }
}

runBootRecovery();

const services = createServices();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App services={services} />
  </StrictMode>,
);

if (import.meta.hot) {
  import.meta.hot.dispose(() => services.dispose());
}
