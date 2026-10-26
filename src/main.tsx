import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";

/**
 * Soft settings migration only (pre-auth global keys).
 * After login, migrateLegacyDataIfNeeded moves these into ScopedStorage.
 * Do NOT wipe forge.tv.autosave.* on deploy — that erased indicators,
 * drawings, theme, and the Radiar layout after hard refresh.
 */
const SETTINGS_MIGRATE = "forge.settings.migrate.v2-radiar";

function runBootRecovery(): void {
  try {
    if (typeof localStorage === "undefined") return;

    // One-time drop of ancient autosave keys only (never the current v3 / .bak keys).
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
        // Seed / rename layout profile → Radiar (never wipe chart autosave).
        const profiles = Array.isArray(settings.profiles) ? [...settings.profiles] : [];
        if (profiles.length === 0) {
          settings.profiles = [
            {
              id: "local-radiar",
              displayName: "Radiar",
              username: "radiar",
              avatarInitial: "R",
              avatarColor: "#9c27b0",
            },
          ];
          settings.activeProfileId = "local-radiar";
        } else {
          settings.profiles = profiles.map((item) => {
            if (!item || typeof item !== "object") return item;
            const p = item as Record<string, unknown>;
            const name = String(p.displayName ?? "").trim().toLowerCase();
            const user = String(p.username ?? "").trim().toLowerCase();
            if (
              p.id === "local-1" ||
              user === "forge" ||
              name === "forge trader" ||
              name === "forge" ||
              name === "trader" ||
              name === "layout"
            ) {
              return {
                ...p,
                displayName: "Radiar",
                username: "radiar",
                avatarInitial: "R",
              };
            }
            return p;
          });
          const hasRadiar = (settings.profiles as Record<string, unknown>[]).some((p) => {
            const n = String(p?.displayName ?? "").trim().toLowerCase();
            const u = String(p?.username ?? "").trim().toLowerCase();
            return n === "radiar" || u === "radiar";
          });
          if (!hasRadiar) {
            (settings.profiles as unknown[]).push({
              id: "local-radiar",
              displayName: "Radiar",
              username: "radiar",
              avatarInitial: "R",
              avatarColor: "#9c27b0",
            });
          }
          const radiar = (settings.profiles as Record<string, unknown>[]).find((p) => {
            const n = String(p?.displayName ?? "").trim().toLowerCase();
            const u = String(p?.username ?? "").trim().toLowerCase();
            return n === "radiar" || u === "radiar";
          });
          if (radiar?.id) settings.activeProfileId = radiar.id;
        }
        localStorage.setItem("forge.settings.v1", JSON.stringify(settings));
      } catch {
        /* keep broken blob — SettingsService will sanitize */
      }
    } else {
      localStorage.setItem(
        "forge.settings.v1",
        JSON.stringify({
          theme: "dark",
          sidePanel: null,
          chartLayout: "s",
          paneSymbols: ["XAUUSD"],
          layoutSync: {
            symbol: true,
            interval: false,
            crosshair: false,
            time: false,
            dateRange: false,
            drawings: true,
          },
          lastSymbol: "XAUUSD",
          lastInterval: "15",
          watchlist: ["XAUUSD", "BTCUSD", "ETHUSD", "EURUSD", "SPX", "AAPL", "NVDA", "TSLA", "USOIL"],
          profiles: [
            {
              id: "local-radiar",
              displayName: "Radiar",
              username: "radiar",
              avatarInitial: "R",
              avatarColor: "#9c27b0",
            },
          ],
          activeProfileId: "local-radiar",
        }),
      );
    }

    localStorage.setItem(SETTINGS_MIGRATE, "1");
  } catch {
    /* private mode / blocked storage */
  }
}

runBootRecovery();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
