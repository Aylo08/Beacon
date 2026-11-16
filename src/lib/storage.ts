// Keychain (iOS) / Keystore (Android) storage shared by the whole app. Every item
// uses the same policy: readable only while the device is unlocked, never
// synced or restored to another device. Values should stay small (bigger data
// goes to files, see bus.ts / izly cache). Errors are swallowed: missing or
// unreadable storage behaves like an empty store.
import * as SecureStore from 'expo-secure-store';

const OPTIONS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

export const getItem = (key: string): Promise<string | null> => SecureStore.getItemAsync(key, OPTIONS).catch(() => null);

export const setItem = (key: string, value: string): Promise<void> =>
  SecureStore.setItemAsync(key, value, OPTIONS).catch(() => {});

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
