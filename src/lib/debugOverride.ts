// Debug hooks for the now bar. This store is inert in release builds: only
// the debug panel (src/debug/, bundled in development only) ever writes to it.
import { useSyncExternalStore } from 'react';
import type { RoomEvent } from './edt';

export type NowOverride = {
  /** Fake "now" at the moment the scenario was picked; time keeps flowing from there. */
  now: number;
  setAt: number;
  events: RoomEvent[];
  travel: RoomEvent[];
  holidays: RoomEvent[];
  /** room → campus, so fake rooms resolve without the room list. */
  campuses: Record<string, string>;
  label: string;
};

type DebugState = { panel: boolean; override: NowOverride | null };

let state: DebugState = { panel: false, override: null };
const listeners = new Set<() => void>();
const set = (patch: Partial<DebugState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

export const setDebugPanel = (panel: boolean) => set({ panel, ...(panel ? {} : { override: null }) });
export const setNowOverride = (override: NowOverride | null) => set({ override });

export function useDebug(): DebugState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}
