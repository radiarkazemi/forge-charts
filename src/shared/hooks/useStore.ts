import { useCallback, useSyncExternalStore } from "react";
import type { Store } from "@/application";

const identity = <T>(value: T): T => value;

/** Subscribe a component to a `Store`, optionally selecting a slice of state. */
export function useStore<T, S = T>(store: Store<T>, selector: (state: T) => S = identity as (state: T) => S): S {
  const getSnapshot = useCallback(() => selector(store.get()), [store, selector]);
  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}
