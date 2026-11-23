// Keychain (iOS) / Keystore (Android) storage shared by the whole app. Every item
// uses the same policy: readable only while the device is unlocked, never
// synced or restored to another device. Values should stay small (bigger data
// goes to files, see bus.ts / izly cache). Errors are swallowed: missing or
// unreadable storage behaves like an empty store.
import * as SecureStore from 'expo-secure-store';

const OPTIONS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

export const getItem = (key: string): Promise<string | null> => SecureStore.getItemAsync(key, OPTIONS).catch(() => null);

export const setItem = (key: string, value: string): Promise<void> =>
  SecureStore.setItemAsync(key, value, OPTIONS)
    .then(() => track(key))
    .catch(() => {});

export const removeItem = (key: string): Promise<void> => SecureStore.deleteItemAsync(key, OPTIONS).catch(() => {});

export async function getJson<T>(key: string): Promise<T | null> {
  const raw = await getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export const setJson = (key: string, value: unknown) => setItem(key, JSON.stringify(value));

// The keychain can't be listed, so every key ever written is recorded in an index item: that's how
// `wipeStorage()` (dev "erase everything") finds them all, including keys added later.
const INDEX_KEY = 'storage_index';
let index: Promise<Set<string>> | null = null;
const readIndex = () =>
  (index ??= SecureStore.getItemAsync(INDEX_KEY, OPTIONS)
    .then((raw) => new Set<string>(raw ? (JSON.parse(raw) as string[]) : []))
    .catch(() => new Set<string>()));
let indexWrite: Promise<void> = Promise.resolve();

function track(key: string) {
  // Serialized so concurrent first writes don't overwrite each other's index.
  indexWrite = indexWrite.then(async () => {
    const keys = await readIndex();
    if (keys.has(key)) return;
    keys.add(key);
    await SecureStore.setItemAsync(INDEX_KEY, JSON.stringify([...keys]), OPTIONS).catch(() => {});
  });
  return indexWrite;
}

/** Keys written before the index existed (installs that predate it). */
const LEGACY_KEYS = [
  'edt_token', 'cas_credentials', 'student_card', 'izly_credentials', 'izly_session', 'izly_balance',
  'izly_counters', 'analytics_install_id', 'analytics_last_ping', 'analytics_pending_delete',
  ...['favori_id', 'pinned_rooms', 'theme_mode', 'onboarding_done', 'bus_home_stop', 'bus_centre_stop',
    'bus_campus_stop', 'bus_widget_stop', 'language', 'home_widgets', 'analytics'].map((k) => `pref_${k}`),
];

/** Deletes every keychain item the app ever wrote. Dev tool: in-memory state isn't reset (reload the app). */
export async function wipeStorage() {
  await indexWrite;
  const keys = new Set([...(await readIndex()), ...LEGACY_KEYS]);
  await Promise.all([...keys].map(removeItem));
  await removeItem(INDEX_KEY);
  index = Promise.resolve(new Set());
}
