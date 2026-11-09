/**
 * Shared binding for Forge study paint hooks so each multipane widget paints
 * against its own ChartController (not always the primary service chart).
 */

import type { Interval } from "@/domain";
import { createStore, type Store } from "@/application";
import { useStore } from "@/shared/hooks/useStore";
import type { ChartController, ChartState } from "./chart-controller";

const IDLE_CHART_STATE: Store<ChartState> = createStore<ChartState>({
  symbol: "",
  interval: "15" as Interval,
  ready: false,
  error: null,
});

/** Subscribe to a pane controller’s state; safe when `chart` is null (disabled). */
export function useBoundChartState(chart: ChartController | null): {
  readonly ready: boolean;
  readonly symbol: string;
  readonly interval: Interval;
} {
  const store = chart?.state ?? IDLE_CHART_STATE;
  const ready = useStore(store, (s) => s.ready);
  const symbol = useStore(store, (s) => s.symbol);
  const interval = useStore(store, (s) => s.interval);
  return { ready: Boolean(chart) && ready, symbol, interval };
}
