// Today's classes and where they are, shared by the now bar and the Bus widget:
// the timetable events as items (subject, room), the campus of a room (resolved
// lazily from the room list) and the bus stop serving a campus.
import { useEffect, useState } from 'react';
import { campusChangeStop, type CampusStop } from './bus';
import { campusOfRoom } from './crous';
import type { RoomEvent } from './edt';
import { normalizeSearch, titleField } from './events';
import { parisParts } from './time';

export type Item = {
  start: number;
  end: number;
  day: string;
  startMin: number;
  endMin: number;
  subject: string;
  room?: string;
  type: string;
};

const toItem = (e: RoomEvent): Item => {
  const s = new Date(e.start);
  const end = new Date(e.end);
  const sp = parisParts(s);
  return {
    start: s.getTime(),
    end: end.getTime(),
    day: sp.day,
    startMin: sp.minutes,
    endMin: parisParts(end).minutes,
    subject: titleField(e.title, 'Matière') ?? e.title.split('\n')[0] ?? e.type,
    room: titleField(e.title, 'Salle', 'Salles'),
    type: e.type,
  };
};

export const toItems = (events: RoomEvent[] | null) =>
  (events ?? [])
    .filter((e) => e.type !== 'Annulation')
    .map(toItem)
    .filter((i) => i.end - i.start < 12 * 3600_000) // skip all-day markers (holidays)
    .sort((a, b) => a.start - b.start);

/** Campus name of each room (via the room list), resolved lazily. undefined = still loading. */
export function useRoomCampuses(token: string | null | undefined, rooms: (string | undefined)[], overrides?: Record<string, string>) {
  const [known, setKnown] = useState<Record<string, string | null>>({});
  const missing = [...new Set(rooms.filter((r): r is string => !!r && !(r in known) && !overrides?.[r]))];
  const key = missing.join('\n');
  useEffect(() => {
    if (!token || !key) return;
    let cancelled = false;
    for (const room of key.split('\n')) {
      campusOfRoom(token, room)
        .catch(() => null)
        .then((c) => !cancelled && setKnown((k) => ({ ...k, [room]: c })));
    }
    return () => {
      cancelled = true;
    };
  }, [token, key]);
  return (room: string | undefined): string | null | undefined => (room ? (overrides?.[room] ?? known[room]) : null);
}

/**
 * Bus stop serving a campus: the chosen Centre-ville stop for Centre-ville, the chosen Agroparc stop
 * otherwise (`campusChange`: the Agroparc stop with a bus to Centre-ville, see campusChangeStop).
 */
export function stopForCampus(
  campus: string | null | undefined,
  stops: { centreStop: string; campusStop: CampusStop },
  campusChange = false,
): string | null {
  if (!campus) return null;
  const c = normalizeSearch(campus);
  if (c.includes('nondefini')) return null;
  if (c.includes('centre')) return stops.centreStop;
  return campusChange ? campusChangeStop(stops.campusStop) : stops.campusStop;
}
