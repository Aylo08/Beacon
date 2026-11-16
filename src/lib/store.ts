// Minimal shared state outside React (bus prefs, debug override…), read with a hook.
import { useSyncExternalStore } from 'react';

export function createStore<T extends object>(initial: T) {
  let state = initial;
  const listeners = new Set<() => void>();
  const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  };
  const get = () => state;
  return {
    get,
    set(patch: Partial<T>) {
      state = { ...state, ...patch };
      listeners.forEach((l) => l());
    },
    /** React hook returning the current state. */
    use: () => useSyncExternalStore(subscribe, get),
  };
}
