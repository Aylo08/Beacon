import type { RoomEvent } from './edt-core';
import { parisParts } from './time';

/** "Matière : X\nType : TD" → { Matière: 'X', Type: 'TD' }. Lines without " : " are kept under their own text. */
export function parseTitle(title: string): { key: string; value: string }[] {
  return title
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const i = line.indexOf(' : ');
      return i === -1 ? { key: line, value: '' } : { key: line.slice(0, i), value: line.slice(i + 3) };
    });
}

// Intl time-zone conversion is slow on mobile; convert each event only once.
const partsCache = new WeakMap<RoomEvent, { s: ReturnType<typeof parisParts>; e: ReturnType<typeof parisParts> }>();
function eventParts(event: RoomEvent) {
  let parts = partsCache.get(event);
  if (!parts) {
    parts = { s: parisParts(new Date(event.start)), e: parisParts(new Date(event.end)) };
    partsCache.set(event, parts);
  }
  return parts;
}

/** Paris calendar day an event starts on (cached per event). */
export const eventDay = (event: RoomEvent) => eventParts(event).s.day;

export type PlacedEvent = {
  event: RoomEvent;
  /** Minutes since Paris midnight, clipped to the requested window. */
  startMin: number;
  endMin: number;
  lane: number;
  label: string;
  sublabel: string;
};

/**
 * Events of `day` that intersect [windowStart, windowEnd) (minutes), clipped to
 * that window and assigned to lanes so overlapping events don't hide each other.
 */
export function placeEvents(
  events: RoomEvent[],
  day: string,
  windowStart: number,
  windowEnd: number,
): { placed: PlacedEvent[]; lanes: number } {
  const items: Omit<PlacedEvent, 'lane'>[] = [];

  for (const event of events) {
    const { s, e } = eventParts(event);
    if (s.day > day || e.day < day) continue;
    const startMin = Math.max(s.day < day ? 0 : s.minutes, windowStart);
    const endMin = Math.min(e.day > day ? 24 * 60 : e.minutes, windowEnd);
    if (endMin <= startMin) continue;

    const fields = parseTitle(event.title);
    const get = (...keys: string[]) => fields.find((f) => keys.includes(f.key))?.value;
    items.push({
      event,
      startMin,
      endMin,
      label: get('Matière') ?? fields[0]?.key ?? event.type,
      sublabel: [get('TD', 'Promotion', 'Promotions'), get('Enseignant', 'Enseignants')].filter(Boolean).join(' · '),
    });
  }

  items.sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);

  // Greedy interval partitioning: put each event in the first lane that's free.
  const laneEnds: number[] = [];
  const placed = items.map((item) => {
    let lane = laneEnds.findIndex((end) => end <= item.startMin);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = item.endMin;
    return { ...item, lane };
  });

  return { placed, lanes: Math.max(1, laneEnds.length) };
}

/** Case-, accent- and whitespace-insensitive form for searching. */
export function normalizeSearch(s: string): string {
  let out = s.toLowerCase();
  try {
    out = out.normalize('NFD').replace(/[̀-ͯ]/g, '');
  } catch {
    // normalize() unavailable: fall back to plain lowercase
  }
  return out.replace(/\s+/g, '');
}

/** Value of the first matching "Key : value" line of an event title. */
export function titleField(title: string, ...keys: string[]): string | undefined {
  return parseTitle(title).find((f) => keys.includes(f.key))?.value;
}

/**
 * Splits placed events into overlap clusters and returns, for each event, how
 * many side-by-side columns its cluster needs (so lone events use full width).
 */
export function clusterWidths(placed: PlacedEvent[]): number[] {
  const order = placed.map((p, i) => i).sort((a, b) => placed[a].startMin - placed[b].startMin);
  const widths = new Array<number>(placed.length).fill(1);
  let cluster: number[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const n = Math.max(1, ...cluster.map((i) => placed[i].lane + 1));
    for (const i of cluster) widths[i] = n;
  };
  for (const i of order) {
    if (cluster.length && placed[i].startMin >= clusterEnd) {
      flush();
      cluster = [];
    }
    cluster.push(i);
    clusterEnd = Math.max(clusterEnd, placed[i].endMin);
  }
  if (cluster.length) flush();
  return widths;
}

/**
 * "Temps de déplacement": placeholder slots the timetable uses for switching
 * campus. Not real classes: hidden from the timetable, used by the now bar.
 */
export const isTravelTime = (e: RoomEvent) => normalizeSearch(e.title).includes('tempsdedeplacement');

/** "Férié" public-holiday markers (all-day): hidden from the timetable, used by the now bar. */
export const isHoliday = (e: RoomEvent) => normalizeSearch(e.title).startsWith('ferie');
