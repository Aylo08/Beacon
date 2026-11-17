// Favourite (pinned) rooms: shown first in their campus on the "Salles" tab and
// listed by the home "Salles favorites" widget. Saved on the device, in the
// order they were pinned.
import { useEffect } from 'react';
import type { Salle } from './edt';
import { getPref, setPref } from './prefs';
import { createStore } from './store';

export type PinnedRoom = { code: string; name: string };

const PREF_KEY = 'pinned_rooms';
const store = createStore<{ rooms: PinnedRoom[] }>({ rooms: [] });
let loaded: Promise<void> | null = null;

function load() {
  loaded ??= getPref(PREF_KEY)
    .then((raw) => {
      const list = raw ? (JSON.parse(raw) as unknown) : [];
      const rooms = Array.isArray(list)
        ? list.filter((r): r is PinnedRoom => typeof r?.code === 'string' && typeof r?.name === 'string')
        : [];
      // Pins made before the store was read are kept too.
      const current = store.get().rooms;
      store.set({ rooms: [...rooms.filter((r) => !current.some((c) => c.code === r.code)), ...current] });
    })
    .catch(() => {});
  return loaded;
}

function save(rooms: PinnedRoom[]) {
  store.set({ rooms });
  setPref(PREF_KEY, JSON.stringify(rooms)).catch(() => {});
}

export function togglePinnedRoom(room: Pick<Salle, 'code' | 'name'>) {
  const rooms = store.get().rooms;
  save(
    rooms.some((r) => r.code === room.code)
      ? rooms.filter((r) => r.code !== room.code)
      : [...rooms, { code: room.code, name: room.name }],
  );
}

export function usePinnedRooms(): PinnedRoom[] {
  useEffect(() => {
    load();
  }, []);
  return store.use().rooms;
}

/** `rooms` with the pinned ones first (in pinning order), the others in their original order. */
export function pinnedFirst<T extends { code: string }>(rooms: T[], pinned: PinnedRoom[]): T[] {
  const rank = new Map(pinned.map((p, i) => [p.code, i]));
  const top = rooms.filter((r) => rank.has(r.code)).sort((a, b) => rank.get(a.code)! - rank.get(b.code)!);
  return [...top, ...rooms.filter((r) => !rank.has(r.code))];
}
