// App-wide login state, shared by both tabs and the login screens.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { casTicket, InvalidCredentialsError } from './casLogin';
import { clearCredentials, getCredentials } from './credentials';
import { CAS_SERVICE, edt } from './edt';
import { clearIzly } from './izly';
import { clearToken, getToken, setToken } from './session';
import { clearStudentCard } from './studentCard';
import { t } from './i18n';

const expiredMessage = () => t('session.expired');

type Session = {
  /** undefined while loading from storage, null when logged out. */
  token: string | null | undefined;
  /** Why the user was logged out, shown on the login prompt. */
  message?: string;
  signIn: (token: string) => Promise<void>;
  signOut: (message?: string) => Promise<void>;
  /**
   * Call when the API rejected the token. Signs in again in the background with
   * the saved credentials (the new token flows to every screen); logs out if
   * there are none or CAS rejects them. Resolves to false when renewing failed for
   * a transient reason (network, CAS down): the session is kept, show an error.
   */
  expire: () => Promise<boolean>;
};

const SessionContext = createContext<Session | null>(null);

/**
 * Headless CAS login + ticket exchange with the saved credentials.
 * 'invalid' = the user must sign in again; 'unavailable' = try again later.
 */
async function renewToken(): Promise<{ token: string } | 'invalid' | 'unavailable'> {
  const creds = await getCredentials();
  if (!creds) return 'invalid';
  try {
    const ticket = await casTicket(CAS_SERVICE, creds.username, creds.password);
    return { token: (await edt.exchangeTicket(ticket)).token };
  } catch (e) {
    if (__DEV__) console.warn('[session] silent re-login failed:', e instanceof Error ? e.message : e);
    if (e instanceof InvalidCredentialsError) {
      await clearCredentials(); // password changed
      return 'invalid';
    }
    return 'unavailable';
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null | undefined>(undefined);
  const [message, setMessage] = useState<string>();
  const renewing = useRef<Promise<boolean> | null>(null);

  useEffect(() => {
    getToken().then(setTokenState);
  }, []);

  const signIn = useCallback(async (t: string) => {
    await setToken(t);
    setMessage(undefined);
    setTokenState(t);
  }, []);

  const signOut = useCallback(async (msg?: string) => {
    await Promise.all([clearToken(), clearStudentCard(), clearCredentials(), clearIzly()]);
    setMessage(msg);
    setTokenState(null);
  }, []);

  const expire = useCallback(() => {
    // Several screens can notice the expiry at once: renew only once.
    renewing.current ??= (async () => {
      const result = await renewToken();
      if (result === 'unavailable') return false;
      if (result === 'invalid') await signOut(expiredMessage());
      else await signIn(result.token);
      return true;
    })().finally(() => {
      renewing.current = null;
    });
    return renewing.current;
  }, [signIn, signOut]);

  const value = useMemo(
    () => ({ token, message, signIn, signOut, expire }),
    [token, message, signIn, signOut, expire],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const s = useContext(SessionContext);
  if (!s) throw new Error('useSession must be used inside <SessionProvider>');
  return s;
}
