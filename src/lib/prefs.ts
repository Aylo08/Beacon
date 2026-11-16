// Native preference storage (small values only).
import { getItem, setItem } from './storage';

export const getPref = (key: string) => getItem(`pref_${key}`);
export const setPref = (key: string, value: string) => setItem(`pref_${key}`, value);
