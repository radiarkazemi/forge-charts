import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { createServices } from "./app/container";

/** One-shot wipe of known-bad chart snapshots that left /charts spinning for users. */
const BOOT_RECOVERY = "forge.boot.recovery.v4";

function runBootRecovery(): void {
  try {
    if (typeof localStorage === "undefined") return;
    if (localStorage.getItem(BOOT_RECOVERY) === "1") return;

    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (
        key === "forge.tv.autosave" ||
        key.startsWith("forge.tv.autosave.") ||
        key.startsWith("tradingview.") ||
        key.startsWith("tvlocalstorage.")
      ) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) localStorage.removeItem(key);

    // Migrate legacy settings: ensure paneSymbols exists (pre-multi-chart saves crash otherwise).
    const raw = localStorage.getItem("forge.settings.v1");
    if (raw) {
      try {
        const settings = JSON.parse(raw) as Record<string, unknown>;
        if (!Array.isArray(settings.paneSymbols)) {
          const last = typeof settings.lastSymbol === "string" ? settings.lastSymbol : "XAUUSD";
          settings.paneSymbols = [last];
        }
        if (typeof settings.chartLayout !== "string") settings.chartLayout = "s";
        if (!settings.layoutSync || typeof settings.layoutSync !== "object") {
          settings.layoutSync = {
            symbol: false,
            interval: false,
            crosshair: true,
            time: false,
            dateRange: false,
          };
        }
        localStorage.setItem("forge.settings.v1", JSON.stringify(settings));
      } catch {
        localStorage.removeItem("forge.settings.v1");
      }
    }

    localStorage.setItem(BOOT_RECOVERY, "1");
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
