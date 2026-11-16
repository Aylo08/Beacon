// Debug hooks for the now bar. This store is inert in release builds: only
// the debug panel (src/debug/, bundled in development only) ever writes to it.
import type { RoomEvent } from './edt';
import { createStore } from './store';

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

const store = createStore<DebugState>({ panel: false, override: null });
const set = store.set;

export const setDebugPanel = (panel: boolean) => set({ panel, ...(panel ? {} : { override: null }) });
export const setNowOverride = (override: NowOverride | null) => set({ override });

export const useDebug = (): DebugState => store.use();
