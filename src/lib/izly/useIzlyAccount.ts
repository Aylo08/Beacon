// State of the Izly account for the "Payer" tab: cached data shown at once,
// then refreshed from Izly (on focus at most every FOCUS_REFRESH_MS, on pull,
// after showing a QR code).
import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  clearIzly,
  fetchIzlyBalance,
  fetchIzlyCounters,
  fetchIzlyOperations,
  getCachedBalance,
  getCachedCounters,
  getCachedOperations,
  getIzlyCredentials,
  IzlyInvalidCredentialsError,
  IzlyNotSignedInError,
  type IzlyBalance,
  type IzlyCounter,
  type IzlyOperation,
} from './index';
import { t } from '../i18n';

const FOCUS_REFRESH_MS = 60_000;

export function useIzlyAccount() {
  /** undefined while reading the Keychain. */
  const [linked, setLinked] = useState<boolean | undefined>(undefined);
  const [balance, setBalance] = useState<IzlyBalance | null>(null);
  const [counters, setCounters] = useState<IzlyCounter[] | null>(null);
  const [operations, setOperations] = useState<IzlyOperation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Pull-to-refresh spinner: only until the balance is in; the rest keeps loading below. */
  const [pulling, setPulling] = useState(false);
  const lastRefresh = useRef(0);

  const forget = useCallback((message: string | null) => {
    setBalance(null);
    setCounters(null);
    setOperations(null);
    setLinked(false);
    setError(message);
  }, []);

  const refresh = useCallback(async () => {
    lastRefresh.current = Date.now();
    setError(null);
    // In parallel: if the session expired, the silent re-login is shared by the three calls.
    const balanceDone = fetchIzlyBalance().then(setBalance);
    balanceDone.finally(() => setPulling(false)).catch(() => {});
    const results = await Promise.allSettled([
      balanceDone,
      fetchIzlyCounters().then(setCounters),
      fetchIzlyOperations().then(setOperations),
    ]);
    const failure = results.find((r): r is PromiseRejectedResult => r.status === 'rejected')?.reason;
    if (failure instanceof IzlyInvalidCredentialsError) forget(t('izly.refused'));
    else if (failure instanceof IzlyNotSignedInError) forget(null);
    else if (failure) setError(failure instanceof Error ? failure.message : String(failure));
  }, [forget]);

  const pull = useCallback(() => {
    setPulling(true);
    refresh();
  }, [refresh]);

  const unlink = useCallback(async () => {
    await clearIzly();
    forget(null);
  }, [forget]);

  // On focus (incl. coming back from the login screen).
  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const creds = await getIzlyCredentials();
        if (!active) return;
        setLinked(!!creds);
        if (!creds) return;
        const [b, c, o] = await Promise.all([getCachedBalance(), getCachedCounters(), getCachedOperations()]);
        if (!active) return;
        setBalance((x) => x ?? b);
        setCounters((x) => x ?? c);
        setOperations((x) => x ?? o);
        // Nothing cached (just signed in) → always load.
        if (!b || Date.now() - lastRefresh.current > FOCUS_REFRESH_MS) refresh();
      })();
      return () => {
        active = false;
      };
    }, [refresh]),
  );

  return { linked, balance, counters, operations, error, pulling, refresh, pull, unlink };
}
