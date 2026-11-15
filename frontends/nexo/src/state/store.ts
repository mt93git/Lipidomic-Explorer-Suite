export interface Applicable<S> { apply(state: S): S }
export type Subscription<T> = (() => void) & { getSnapshot(): T; subscribe(listener: () => void): () => void };
export function createStore<S>(initial: S) {
  let state = initial;
  const observers = new Set<() => void>();
  const get = () => state;
  const set = (updater: (state: S) => S) => {
    const next = updater(state);
    if (Object.is(next, state)) return;
    state = next;
    for (const observer of [...observers]) observer();
  };
  function subscribe<T>(selector: (state: S) => T, listener: (value: T) => void, equals: (a: T, b: T) => boolean = Object.is): Subscription<T> {
    let snapshot = selector(state), snapshotState = state;
    const getSnapshot = () => {
      if (!Object.is(snapshotState, state)) {
        snapshotState = state;
        const next = selector(state);
        if (!equals(snapshot, next)) snapshot = next;
      }
      return snapshot;
    };
    const listeners = new Set<() => void>();
    const observe = () => {
      const previous = snapshot;
      getSnapshot();
      if (equals(previous, snapshot)) return;
      listener(snapshot);
      for (const notify of [...listeners]) notify();
    };
    observers.add(observe);
    // Callable unsubscribe keeps conventional store usage; the stable methods
    // can be passed directly to useSyncExternalStore(subscription.subscribe, subscription.getSnapshot).
    return Object.assign(() => { observers.delete(observe); listeners.clear(); }, {
      getSnapshot,
      subscribe: (notify: () => void) => { observers.add(observe); listeners.add(notify); return () => { listeners.delete(notify); if (!listeners.size) observers.delete(observe); }; }
    });
  }
  return { get, set, subscribe, dispatch: (cmd: Applicable<S>) => set(state => cmd.apply(state)) };
}
