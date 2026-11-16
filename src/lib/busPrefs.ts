// Bus preferences shared by the settings, the bus widget and the now bar:
// the user's home stop (C3 / 22) and which Agroparc stop they use.
import { useEffect } from 'react';
import { CAMPUS_STOPS, type CampusStop } from './bus';
import { getPref, setPref } from './prefs';
import { createStore } from './store';

export type BusPrefs = { homeStop: string | null; campusStop: CampusStop };

const HOME_KEY = 'bus_home_stop';
const CAMPUS_KEY = 'bus_campus_stop';
// v1 of the bus widget stored ids instead of names.
const LEGACY: Record<string, CampusStop> = { grandAvignon: 'Grand Avignon', montaigne: 'Montaigne' };

const store = createStore<BusPrefs>({ homeStop: null, campusStop: 'Grand Avignon' });
const set = store.set;
let loaded: Promise<void> | null = null;

function load() {
  loaded ??= Promise.all([getPref(HOME_KEY), getPref(CAMPUS_KEY)]).then(([home, campus]) => {
    const c = campus && (LEGACY[campus] ?? campus);
    set({
      homeStop: home || null,
      campusStop: (CAMPUS_STOPS as readonly string[]).includes(c ?? '') ? (c as CampusStop) : store.get().campusStop,
    });
  });
  return loaded;
}

export function setHomeStop(name: string | null) {
  set({ homeStop: name });
  setPref(HOME_KEY, name ?? '');
}

export function setCampusStop(stop: CampusStop) {
  set({ campusStop: stop });
  setPref(CAMPUS_KEY, stop);
}

export function useBusPrefs(): BusPrefs {
  useEffect(() => {
    load();
  }, []);
  return store.use();
}
