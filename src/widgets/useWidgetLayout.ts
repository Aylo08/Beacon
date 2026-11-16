// Which widgets are on the home page, in which order. Saved per device.
import { useCallback, useEffect, useState } from 'react';
import { getPref, setPref } from '../lib/prefs';
import { DEFAULT_WIDGETS, widgetById } from './registry';

const KEY = 'home_widgets';

export function useWidgetLayout() {
  const [ids, setIds] = useState<string[]>(DEFAULT_WIDGETS);

  useEffect(() => {
    getPref(KEY).then((raw) => {
      if (!raw) return;
      try {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) setIds(parsed.filter((id): id is string => typeof id === 'string' && !!widgetById(id)));
      } catch {
        // corrupted pref: keep defaults
      }
    });
  }, []);

  const update = useCallback((fn: (prev: string[]) => string[]) => {
    setIds((prev) => {
      const next = fn(prev);
      setPref(KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const add = useCallback((id: string) => update((p) => (p.includes(id) ? p : [...p, id])), [update]);
  const remove = useCallback((id: string) => update((p) => p.filter((x) => x !== id)), [update]);
  const move = useCallback(
    (id: string, delta: -1 | 1) =>
      update((p) => {
        const i = p.indexOf(id);
        const j = i + delta;
        if (i < 0 || j < 0 || j >= p.length) return p;
        const next = [...p];
        [next[i], next[j]] = [next[j], next[i]];
        return next;
      }),
    [update],
  );

  return { ids, add, remove, move };
}
