// Bus preferences shared by the settings, the bus widget and the now bar:
// the user's home stop (any stop of the kept lines), which Agroparc stop they
// use, and the stop shown by the bus widget (null = the Agroparc stop).
import { useEffect } from 'react';
import { CAMPUS_STOPS, canonicalStop, type CampusStop } from './bus';
import { getPref, setPref } from './prefs';
import { createStore } from './store';

export type BusPrefs = { homeStop: string | null; campusStop: CampusStop; widgetStop: string | null };

const HOME_KEY = 'bus_home_stop';
const CAMPUS_KEY = 'bus_campus_stop';
const WIDGET_KEY = 'bus_widget_stop';
// v1 of the bus widget stored ids instead of names.
const LEGACY: Record<string, CampusStop> = { grandAvignon: 'Grand Avignon', montaigne: 'Montaigne' };

const store = createStore<BusPrefs>({ homeStop: null, campusStop: 'Grand Avignon', widgetStop: null });
const set = store.set;
let loaded: Promise<void> | null = null;

function load() {
  loaded ??= Promise.all([getPref(HOME_KEY), getPref(CAMPUS_KEY), getPref(WIDGET_KEY)]).then(([home, campus, widget]) => {
    const c = campus && (LEGACY[campus] ?? campus);
    set({
      // Saved before St Lazare / Université were merged: use the merged name.
      homeStop: home ? canonicalStop(home) : null,
      widgetStop: widget ? canonicalStop(widget) : null,
      campusStop: (CAMPUS_STOPS as readonly string[]).includes(c ?? '') ? (c as CampusStop) : store.get().campusStop,
    });
  });
  return loaded;
}

export function setHomeStop(name: string | null) {
  set({ homeStop: name });
  setPref(HOME_KEY, name ?? '');
}

export function setWidgetStop(name: string | null) {
  set({ widgetStop: name });
  setPref(WIDGET_KEY, name ?? '');
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
