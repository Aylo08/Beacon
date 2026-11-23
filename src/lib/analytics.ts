// Anonymous usage statistics, sent to the Beacon server (`beaconApi.ts`).
//
// At most once a day (on launch / when the app comes back to the foreground) the app sends a
// random install ID generated on this device, the app version/build, the platform and the OS
// version: POST /v1/analytics/ping. Nothing else: no account, timetable or location, and the server
// stores no IP address. Users can turn it off in Réglages → Confidentialité; turning it off asks the
// server to delete the install (DELETE /v1/analytics/installs/:id) and forgets the ID. If the server
// can't be reached, the ID is queued in PENDING_DELETE_KEY and the deletion is retried on every launch /
// foreground until the server confirms it, so an offline opt-out still ends up deleted.
// Server unreachable / erroring: everything fails silently and is retried later; nothing blocks the UI.
// Disabled entirely when the build has no server URL (the setting and the onboarding text then
// don't mention statistics).
//
// If you change what is sent, update `onboarding.privacyAnalytics` and `settings.analyticsHint`.
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import Constants from 'expo-constants';
import { beaconApiAvailable, beaconRequest } from './beaconApi';
import { getPref, setPref } from './prefs';
import { getItem, getJson, removeItem, setItem, setJson } from './storage';
import { createStore } from './store';
import { todayKey } from './time';

const ID_KEY = 'analytics_install_id';
const LAST_PING_KEY = 'analytics_last_ping';
const PENDING_DELETE_KEY = 'analytics_pending_delete';
const ENABLED_PREF = 'analytics';

/** Whether this build sends statistics at all (has a Beacon server). */
export const analyticsAvailable = beaconApiAvailable;

/** undefined until read from the prefs. Enabled by default. */
const store = createStore<{ enabled: boolean | undefined }>({ enabled: undefined });
let loaded: Promise<void> | null = null;
const load = () =>
  (loaded ??= getPref(ENABLED_PREF)
    .then((v) => store.set({ enabled: v !== '0' }))
    .catch(() => store.set({ enabled: true })));

/** Random install ID (UUID-shaped, not derived from anything on the device). */
function randomId() {
  let hex = '';
  for (let i = 0; i < 32; i++) hex += Math.floor(Math.random() * 16).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function installId() {
  let id = await getItem(ID_KEY);
  if (!id) {
    id = randomId();
    await setItem(ID_KEY, id);
  }
  return id;
}

function buildNumber(): string | undefined {
  const cfg = Constants.expoConfig;
  return Platform.OS === 'ios' ? cfg?.ios?.buildNumber : cfg?.android?.versionCode?.toString();
}

/** IDs whose deletion the server hasn't confirmed yet (opt-out while offline, possibly several). */
const pendingDeletes = async () => (await getJson<string[]>(PENDING_DELETE_KEY)) ?? [];

let deleting: Promise<void> | null = null;

/** Sends the queued deletions; keeps the ones that failed for the next launch / foreground. Never throws. */
function flushPendingDeletes() {
  return (deleting ??= (async () => {
    try {
      const ids = await pendingDeletes();
      if (!ids.length || !analyticsAvailable) return;
      const left: string[] = [];
      for (const id of ids) {
        const status = await beaconRequest(
          `/v1/analytics/installs/${encodeURIComponent(id)}`,
          { method: 'DELETE' },
          { read: async (res) => res.status },
        ).catch(() => 0);
        // 2xx = deleted; 400 = an ID the server never accepted, so it has nothing to delete.
        if (!((status >= 200 && status < 300) || status === 400)) left.push(id);
      }
      // Re-read: an opt-out may have queued another ID meanwhile.
      const now = await pendingDeletes();
      const keep = now.filter((id) => !ids.includes(id) || left.includes(id));
      if (keep.length) await setJson(PENDING_DELETE_KEY, keep);
      else await removeItem(PENDING_DELETE_KEY);
    } catch {
      // Retried on the next launch / foreground.
    } finally {
      deleting = null;
    }
  })());
}

let pinging: Promise<void> | null = null;

/** Sends today's ping unless already sent, disabled or unavailable. Never throws. */
function pingIfDue() {
  if (!analyticsAvailable) return Promise.resolve();
  return (pinging ??= sendPing().finally(() => {
    pinging = null;
  }));
}

async function sendPing() {
  try {
    await load();
    if (!store.get().enabled) return;
    const day = todayKey();
    if ((await getItem(LAST_PING_KEY)) === day) return;
    const res = await beaconRequest('/v1/analytics/ping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: await installId(),
        version: Constants.expoConfig?.version ?? '0.0.0',
        build: buildNumber(),
        platform: Platform.OS === 'ios' || Platform.OS === 'android' || Platform.OS === 'web' ? Platform.OS : 'other',
        os: String(Platform.Version),
      }),
    });
    // The user may have opted out while the request was in flight: don't mark the day as sent.
    if (res.ok && store.get().enabled) await setItem(LAST_PING_KEY, day);
  } catch {
    // Offline or server down: retried on the next launch / foreground.
  }
}

/** Root-layout hook: pings on launch and whenever the app returns to the foreground. */
export function useAnalytics() {
  useEffect(() => {
    if (!analyticsAvailable) return;
    const run = () => {
      flushPendingDeletes();
      pingIfDue();
    };
    run();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') run();
    });
    return () => sub.remove();
  }, []);
}

export function useAnalyticsEnabled(): boolean | undefined {
  useEffect(() => {
    load();
  }, []);
  return store.use().enabled;
}

export async function setAnalyticsEnabled(enabled: boolean) {
  store.set({ enabled });
  await setPref(ENABLED_PREF, enabled ? '1' : '0');
  if (enabled) {
    pingIfDue();
    return;
  }
  // Opt-out: queue the deletion (retried until the server confirms it), then drop the ID; a new one
  // is made if re-enabled.
  const id = await getItem(ID_KEY);
  if (!id) return;
  // A ping still in flight could reach the server after the DELETE and re-create the install;
  // a flush in progress is rewriting the queue. Wait for both.
  await Promise.all([pinging, deleting]);
  const queue = await pendingDeletes();
  // Capped so the keychain value stays small (only reachable by toggling a lot while offline).
  if (!queue.includes(id)) await setJson(PENDING_DELETE_KEY, [...queue, id].slice(-20));
  await Promise.all([removeItem(ID_KEY), removeItem(LAST_PING_KEY)]);
  flushPendingDeletes();
}
