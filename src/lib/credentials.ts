// CAS credentials, kept in the iOS Keychain / Android Keystore so an expired
// timetable token can be renewed without asking the user to sign in again.
// Stored only on this device (not in backups); removed on logout or when CAS rejects them.
import { getJson, removeItem, setJson } from './storage';

export type Credentials = { username: string; password: string };

const KEY = 'cas_credentials';

export async function getCredentials(): Promise<Credentials | null> {
  const c = await getJson<Credentials>(KEY);
  return c?.username && c.password ? c : null;
}

export const saveCredentials = (c: Credentials) => setJson(KEY, c);

export const clearCredentials = () => removeItem(KEY);
