// "Confirm it's me before paying": Face ID / Touch ID / fingerprint / face unlock, or the device
// passcode as a fallback, before an Izly payment QR code is requested. On by default, switch in
// Réglages → Izly. Asked before the code is created, so a failed or cancelled attempt never
// generates one.
//
// A phone with no lock at all (no biometrics, no passcode) can't authenticate: the prompt is skipped
// so those users can still pay. Mainly protects against someone using the phone while it's unlocked.
import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { t } from './i18n';
import { getPref, setPref } from './prefs';
import { createStore } from './store';

const PREF_KEY = 'izly_pay_lock';

/** undefined until read from the prefs. Enabled by default. */
const store = createStore<{ enabled: boolean | undefined }>({ enabled: undefined });
let loaded: Promise<void> | null = null;
const load = () =>
  (loaded ??= getPref(PREF_KEY)
    .then((v) => store.set({ enabled: v !== '0' }))
    .catch(() => store.set({ enabled: true })));

export function usePayLockEnabled(): boolean | undefined {
  useEffect(() => {
    load();
  }, []);
  return store.use().enabled;
}

export function setPayLockEnabled(enabled: boolean) {
  store.set({ enabled });
  setPref(PREF_KEY, enabled ? '1' : '0').catch(() => {});
}

/** The device has no way to authenticate the user: let them through. */
const NO_LOCK = new Set<string>(['not_enrolled', 'not_available', 'passcode_not_set']);

let pending: Promise<boolean> | null = null;

/**
 * Resolves to true when the payment QR code may be shown: lock disabled, nothing to authenticate
 * with, or the user authenticated. Concurrent calls (double tap) share one prompt. Never throws.
 */
export function confirmPayment(): Promise<boolean> {
  return (pending ??= authenticate().finally(() => {
    pending = null;
  }));
}

async function authenticate(): Promise<boolean> {
  if (Platform.OS === 'web') return true;
  await load();
  if (!store.get().enabled) return true;
  try {
    if ((await LocalAuthentication.getEnrolledLevelAsync()) === LocalAuthentication.SecurityLevel.NONE) return true;
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: t('pay.authPrompt'),
      cancelLabel: t('common.cancel'),
      // Device passcode allowed when biometrics fail, are locked out or aren't set up.
      disableDeviceFallback: false,
    });
    return result.success || NO_LOCK.has(result.error);
  } catch {
    // The native module failed: don't lock the user out of paying.
    return true;
  }
}
