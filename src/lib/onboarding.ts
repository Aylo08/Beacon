// Whether the first-launch onboarding (Izly, preferences) was completed. The
// university login step comes back whenever the user is logged out; the rest
// only once per device.
import { useEffect } from 'react';
import { getPref, setPref } from './prefs';
import { createStore } from './store';

const PREF_KEY = 'onboarding_done';
/** undefined until read from the prefs. */
const store = createStore<{ done: boolean | undefined }>({ done: undefined });
let loaded: Promise<void> | null = null;

function load() {
  loaded ??= getPref(PREF_KEY)
    .then((v) => {
      if (store.get().done === undefined) store.set({ done: v === '1' });
    })
    .catch(() => store.set({ done: false }));
  return loaded;
}

export function completeOnboarding() {
  store.set({ done: true });
  setPref(PREF_KEY, '1').catch(() => {});
}

export function useOnboardingDone(): boolean | undefined {
  useEffect(() => {
    load();
  }, []);
  return store.use().done;
}
