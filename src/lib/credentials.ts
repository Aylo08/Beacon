// CAS credentials, kept in the iOS Keychain / Android Keystore so an expired
// timetable token can be renewed without asking the user to sign in again.
// Stored only on this device (not in backups); removed on logout or when CAS rejects them.
import * as SecureStore from 'expo-secure-store';

export type Credentials = { username: string; password: string };

const KEY = 'cas_credentials';
const OPTIONS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

export async function getCredentials(): Promise<Credentials | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY, OPTIONS);
    const c = raw ? (JSON.parse(raw) as Credentials) : null;
    return c?.username && c.password ? c : null;
  } catch {
    return null;
  }
}

export const saveCredentials = (c: Credentials) =>
  SecureStore.setItemAsync(KEY, JSON.stringify(c), OPTIONS).catch(() => {});

export const clearCredentials = () => SecureStore.deleteItemAsync(KEY, OPTIONS).catch(() => {});
