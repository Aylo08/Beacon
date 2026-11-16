// App-wide login state, shared by both tabs and the login screens.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { clearToken, getToken, setToken } from './session';

type Session = {
  /** undefined while loading from storage, null when logged out. */
  token: string | null | undefined;
  /** Why the user was logged out, shown on the login prompt. */
  message?: string;
  signIn: (token: string) => Promise<void>;
  signOut: (message?: string) => Promise<void>;
};

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null | undefined>(undefined);
  const [message, setMessage] = useState<string>();

  useEffect(() => {
    getToken().then(setTokenState);
  }, []);

  const signIn = useCallback(async (t: string) => {
    await setToken(t);
    setMessage(undefined);
    setTokenState(t);
  }, []);

  const signOut = useCallback(async (msg?: string) => {
    await clearToken();
    setMessage(msg);
    setTokenState(null);
  }, []);

  const value = useMemo(() => ({ token, message, signIn, signOut }), [token, message, signIn, signOut]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const s = useContext(SessionContext);
  if (!s) throw new Error('useSession must be used inside <SessionProvider>');
  return s;
}
