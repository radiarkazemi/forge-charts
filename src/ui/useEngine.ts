import { useSyncExternalStore } from "react";
import { ChartEngine } from "../engine/ChartEngine";
import type { EngineSnapshot } from "../engine/types";

export function useEngine(engine: ChartEngine | null): EngineSnapshot | null {
  return useSyncExternalStore(
    (onStoreChange) => (engine ? engine.subscribe(onStoreChange) : () => {}),
    () => engine?.getSnapshot() ?? null,
    () => engine?.getSnapshot() ?? null,
  );
}
