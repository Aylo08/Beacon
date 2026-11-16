// Live-updating hooks: a ticking clock and Crous attendance polling, both
// paused while inactive (screen not focused, app in background).
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { fetchAttendance, type Attendance } from './crous';

const CROUS_REFRESH_MS = 5_000;

/** Re-renders every `ms` while `active` and the app is in the foreground. */
export function useNow(ms: number, active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    let id: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      setNow(Date.now());
      id ??= setInterval(() => setNow(Date.now()), ms);
    };
    const stop = () => {
      if (id) clearInterval(id);
      id = undefined;
    };
    start();
    const sub = AppState.addEventListener('change', (s) => (s === 'active' ? start() : stop()));
    return () => {
      stop();
      sub.remove();
    };
  }, [ms, active]);
  return now;
}

/** Crous attendance for `restoId`, polled every 5 s while `active`. */
export function useAttendance(restoId: string | null, active: boolean) {
  const [data, setData] = useState<{ id: string; value: Attendance } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tick = useNow(CROUS_REFRESH_MS, active && !!restoId);
  useEffect(() => {
    if (!active || !restoId) return;
    let cancelled = false;
    fetchAttendance(restoId)
      .then((value) => {
        if (cancelled) return;
        setData({ id: restoId, value });
        setError(null);
      })
      .catch((e) => !cancelled && setError(String(e instanceof Error ? e.message : e)));
    return () => {
      cancelled = true;
    };
  }, [restoId, active, tick]);
  return { attendance: data?.id === restoId ? data.value : null, error };
}
