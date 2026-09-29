import { useEffect, useRef } from "react";
import { useTheme } from "@mui/material/styles";
import { createStore, type AlertService } from "@/application";
import type { EntityId } from "@/infrastructure/tradingview";
import { useStore } from "@/shared/hooks/useStore";
import type { ChartController, ChartState } from "./chart-controller";

const IDLE_STATE = createStore<ChartState>({
  symbol: "",
  interval: "15",
  ready: false,
  error: null,
});

/**
 * Mirrors the active alerts for the charted symbol as locked horizontal lines.
 * Lines are re-created whenever the alert set or the symbol changes.
 * Pass `null` on secondary multi-chart panes (alerts only draw on the primary).
 */
export function useChartAlertLines(controller: ChartController | null, alerts: AlertService): void {
  const theme = useTheme();
  const { symbol, ready } = useStore(controller?.state ?? IDLE_STATE);
  const all = useStore(alerts.alerts);
  const drawn = useRef(new Map<string, EntityId>());

  useEffect(() => {
    if (!controller || !ready) return;
    let cancelled = false;

    const wanted = all.filter((a) => a.ticker === symbol && a.status === "active");
    const wantedIds = new Set(wanted.map((a) => a.id));

    for (const [id, entity] of drawn.current) {
      if (!wantedIds.has(id)) {
        controller.removeEntity(entity);
        drawn.current.delete(id);
      }
    }

    for (const alert of wanted) {
      if (drawn.current.has(alert.id)) continue;
      void controller
        .addHorizontalLine({
          price: alert.price,
          text: alert.note ? `Alert · ${alert.note}` : "Alert",
          color: theme.palette.warning.main,
        })
        .then((entity) => {
          if (!entity) return;
          if (cancelled || drawn.current.has(alert.id)) controller.removeEntity(entity);
          else drawn.current.set(alert.id, entity);
        });
    }

    return () => {
      cancelled = true;
    };
  }, [all, controller, ready, symbol, theme.palette.warning.main]);

  // Drop stale handles when the symbol changes (the library clears drawings itself).
  useEffect(() => {
    drawn.current.clear();
  }, [symbol]);
}
