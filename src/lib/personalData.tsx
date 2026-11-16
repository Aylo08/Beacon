// The user's personal timetables, shared by "Mon EDT" and the home widgets.
// The user picks one of their favoris (saved per device; default = the
// favori marked `defaut`); events are loaded per favori and cached.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { edt, UnauthorizedError, type Favori, type RoomEvent } from './edt';
import { getPref, setPref } from './prefs';
import { useSession } from './sessionContext';

type PersonalData = {
  favoris: Favori[] | null;
  /** The favori currently displayed (null until favoris are loaded, or if the user has none). */
  selected: Favori | null;
  selectFavori: (id: number) => void;
  events: RoomEvent[] | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
};

const PersonalDataContext = createContext<PersonalData | null>(null);

const PREF_KEY = 'favori_id';
/** Cache key used when the user has no favoris: fall back to events_perso. */
const NO_FAVORI = -1;

/** The default favori (the one marked `defaut`, else the first). */
export const defaultFavori = (favoris: Favori[] | null) => favoris?.find((f) => f.defaut) ?? favoris?.[0];

export function PersonalDataProvider({ children }: { children: ReactNode }) {
  const { token, signOut } = useSession();
  const [favoris, setFavoris] = useState<Favori[] | null>(null);
  // undefined = preference not read yet (wait for it, to avoid loading the default first).
  const [storedId, setStoredId] = useState<number | null | undefined>(undefined);
  const [cache, setCache] = useState<Record<number, RoomEvent[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [reloads, setReloads] = useState(0);

  const fail = useCallback(
    async (e: unknown) => {
      if (token && e instanceof UnauthorizedError && !(await edt.isTokenValid(token))) {
        signOut('Session expirée, reconnectez-vous.');
      } else setError(String(e));
    },
    [token, signOut],
  );

  useEffect(() => {
    getPref(PREF_KEY).then((v) => setStoredId(v && /^\d+$/.test(v) ? Number(v) : null));
  }, []);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    edt
      .getFavoris(token)
      .then((f) => !cancelled && setFavoris(f))
      .catch((e) => {
        if (!cancelled) fail(e);
      });
    return () => {
      cancelled = true;
    };
  }, [token, reloads, fail]);

  const selected = useMemo(
    () => (favoris ? (favoris.find((f) => f.id === storedId) ?? defaultFavori(favoris) ?? null) : null),
    [favoris, storedId],
  );
  const key = favoris === null || storedId === undefined ? null : (selected?.id ?? NO_FAVORI);

  useEffect(() => {
    if (!token || key === null || cache[key]) return;
    let cancelled = false;
    (key === NO_FAVORI ? edt.getPersonalEvents(token) : edt.getFavoriEvents(token, key))
      .then((ev) => !cancelled && setCache((c) => ({ ...c, [key]: ev })))
      .catch((e) => {
        if (!cancelled) fail(e);
      });
    return () => {
      cancelled = true;
    };
  }, [token, key, cache, fail]);

  const selectFavori = useCallback((id: number) => {
    setStoredId(id);
    setError(null);
    setPref(PREF_KEY, String(id));
  }, []);

  const reload = useCallback(() => {
    setFavoris(null);
    setCache({});
    setError(null);
    setReloads((n) => n + 1);
  }, []);

  const events = key === null ? null : (cache[key] ?? null);
  const value = useMemo(
    () => ({ favoris, selected, selectFavori, events, error, loading: !events && !error, reload }),
    [favoris, selected, selectFavori, events, error, reload],
  );
  return <PersonalDataContext.Provider value={value}>{children}</PersonalDataContext.Provider>;
}

export function usePersonalData(): PersonalData {
  const v = useContext(PersonalDataContext);
  if (!v) throw new Error('usePersonalData must be used inside <PersonalDataProvider>');
  return v;
}
