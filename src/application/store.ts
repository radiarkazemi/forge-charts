export type Listener = () => void;

/**
 * Tiny observable state container (Observer pattern) that plugs straight into
 * React's `useSyncExternalStore`. Kept framework-agnostic so services can own
 * their state without depending on React.
 */
export interface Store<T> {
  get(): T;
  set(next: T): void;
  update(recipe: (current: T) => T): void;
  subscribe(listener: Listener): () => void;
}

export function createStore<T>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<Listener>();

  const notify = () => {
    for (const listener of listeners) listener();
  };

  return {
    get: () => state,
    set: (next) => {
      if (Object.is(next, state)) return;
      state = next;
      notify();
    },
    update: (recipe) => {
      const next = recipe(state);
      if (Object.is(next, state)) return;
      state = next;
      notify();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** Store whose state is mirrored into a persistence port. */
export function createPersistentStore<T>(
  storage: { get<V>(key: string, fallback: V): V; set(key: string, value: unknown): void },
  key: string,
  initial: T,
): Store<T> {
  const store = createStore<T>(storage.get(key, initial));
  store.subscribe(() => storage.set(key, store.get()));
  return store;
}
