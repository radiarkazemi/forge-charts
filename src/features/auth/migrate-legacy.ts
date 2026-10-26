import type { KeyValueStorage } from "@/application";
import type { AuthSession } from "./auth-service";
import type { AuthService } from "./auth-service";
import type { ScopedStorage } from "@/infrastructure/storage/scoped-storage";

/** Unscoped keys from pre-auth builds — move into the first claiming account. */
const LEGACY_KEYS = [
  "forge.settings.v1",
  "forge.settings.migrate.v1",
  "forge.settings.migrate.v2-radiar",
  "forge.tv.autosave.v3",
  "forge.tv.autosave.v3.bak",
  "forge.tv.charts",
  "forge.tv.studyTemplates",
  "forge.tv.drawingTemplates",
  "forge.tv.chartTemplates",
  "forge.tv.lineTools",
  "forge.charts.volumeDefaultCleared.v2",
  "forge.demo.trading.v1",
  "forge.alerts.v1",
] as const;

/**
 * One-time: copy pre-auth localStorage chart/settings into this user’s scope
 * so Radiar’s existing layout is not lost, and other accounts start clean.
 */
export function migrateLegacyDataIfNeeded(
  auth: AuthService,
  raw: KeyValueStorage,
  scoped: ScopedStorage,
  session: AuthSession,
): void {
  if (!auth.legacyAvailable()) return;

  let moved = 0;
  for (const key of LEGACY_KEYS) {
    const value = raw.get<unknown>(key, undefined);
    if (value === undefined) continue;
    // Don't overwrite if user already has data under this key.
    const existing = scoped.get<unknown>(key, undefined);
    if (existing === undefined) {
      scoped.set(key, value);
      moved += 1;
    }
    // Remove global copy so other browsers/accounts on this device can't see it.
    raw.remove(key);
  }

  // Prefer Radiar naming when claiming the old default profile.
  if (moved > 0) {
    try {
      const settings = scoped.get<Record<string, unknown>>("forge.settings.v1", {});
      const profiles = Array.isArray(settings.profiles) ? [...settings.profiles] : [];
      if (profiles.length === 0) {
        settings.profiles = [
          {
            id: "local-radiar",
            displayName: session.displayName || "Radiar",
            username: session.username,
            avatarInitial: (session.displayName || session.username || "R").slice(0, 1).toUpperCase(),
            avatarColor: "#9c27b0",
          },
        ];
        settings.activeProfileId = "local-radiar";
      } else {
        settings.profiles = profiles.map((item) => {
          if (!item || typeof item !== "object") return item;
          const p = { ...(item as Record<string, unknown>) };
          const name = String(p.displayName ?? "").trim().toLowerCase();
          const user = String(p.username ?? "").trim().toLowerCase();
          if (
            p.id === "local-1" ||
            user === "forge" ||
            name === "forge trader" ||
            name === "forge" ||
            name === "radiar"
          ) {
            return {
              ...p,
              displayName: session.displayName || "Radiar",
              username: session.username,
              avatarInitial: (session.displayName || session.username || "R")
                .slice(0, 1)
                .toUpperCase(),
            };
          }
          return p;
        });
      }
      scoped.set("forge.settings.v1", settings);
    } catch {
      /* ignore */
    }
  }

  auth.markLegacyClaimed(session.userId);
}
