// Native token storage (iOS Keychain / Android Keystore).
import { getItem, removeItem, setItem } from './storage';

const KEY = 'edt_token';

export const getToken = () => getItem(KEY);
export const setToken = (token: string) => setItem(KEY, token);
export const clearToken = () => removeItem(KEY);
