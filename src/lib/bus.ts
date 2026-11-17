// Bus timetable for lines C3 and 22 (Centre-ville ↔ Agroparc campuses and the
// user's home stop), from the ORIZO open-data GTFS.
//
// The feed is only valid a few weeks ahead, so it is downloaded on the device
// (≈2.4 MB zip), reduced to the few hundred C3/22 trips and cached as JSON.
// Stops are matched by name (a name groups the platforms of both directions)
// and lines by short name, so a new feed with renumbered IDs keeps working.
import { fetch } from 'expo/fetch';
import { File, Paths } from 'expo-file-system';
import { strFromU8, unzipSync } from 'fflate';
import type { RealtimeFeed } from './gtfsRt';
import { addDays, parisParts, weekday } from './time';
import { t } from './i18n';

const GTFS_URL =
  'https://api.maas-fr.cityway.fr/dataflow/offre-tc/download?provider=ORIZO&dataFormat=GTFS&dataProfil=OPENDATA';

export const BUS_LINES = ['C3', '22'];
/** Centre-ville stop. */
export const CENTRE_STOP = 'St Lazare';
/** Agroparc stops (the user picks one). */
export const CAMPUS_STOPS = ['Grand Avignon', 'Montaigne'] as const;
export type CampusStop = (typeof CAMPUS_STOPS)[number];

/** Re-download the timetable after this long (the feed is published every few days). */
const MAX_AGE_MS = 3 * 24 * 3600_000;
const CACHE_VERSION = 2;

/** [stop_id, seconds since the start of the service day (may exceed 24 h)], in stop order. */
type StopTime = [string, number];
type BusTrip = { id: string; line: string; service: string; stops: StopTime[] };

export type Timetable = {
  version: number;
  fetchedAt: number;
  lineColors: Record<string, { bg: string; text: string }>;
  /** stop_id → stop name, for the stops served by these lines. */
  stopNames: Record<string, string>;
  trips: BusTrip[];
  /** service_id → weekdays (Mon..Sun) and validity range (YYYY-MM-DD). */
  calendar: Record<string, { days: boolean[]; start: string; end: string }>;
  /** service_id → dates added / removed (calendar_dates). */
  added: Record<string, string[]>;
  removed: Record<string, string[]>;
};

// ---------- GTFS parsing ----------

/** Minimal CSV line parser (quoted fields, "" escapes). */
function splitCsv(line: string): string[] {
  if (!line.includes('"')) return line.split(',');
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** Calls `row(get)` for each data line; `get(column)` reads a field of the current line. */
function eachRow(text: string, row: (get: (col: string) => string, firstField: string) => void) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const header = splitCsv(lines[0]);
  const index = new Map(header.map((h, i) => [h.trim(), i]));
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    let fields: string[] | null = null;
    const get = (col: string) => {
      fields ??= splitCsv(line);
      return fields[index.get(col) ?? -1] ?? '';
    };
    row(get, line.slice(0, line.indexOf(',')).replace(/"/g, ''));
  }
}

const gtfsDate = (d: string) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
const gtfsTime = (s: string) => {
  const [h, m, sec] = s.split(':').map(Number);
  return h * 3600 + m * 60 + (sec || 0);
};

export function parseGtfs(zip: Uint8Array): Timetable {
  const files = unzipSync(zip, { filter: (f) => /^(routes|stops|trips|stop_times|calendar|calendar_dates)\.txt$/.test(f.name) });
  const text = (name: string) => (files[name] ? strFromU8(files[name]) : '');

  const routes = new Map<string, string>(); // route_id → short name
  const lineColors: Timetable['lineColors'] = {};
  eachRow(text('routes.txt'), (get) => {
    const short = get('route_short_name').trim();
    if (!BUS_LINES.includes(short)) return;
    routes.set(get('route_id'), short);
    const color = get('route_color');
    const textColor = get('route_text_color');
    lineColors[short] = { bg: color ? `#${color}` : '#2563eb', text: textColor ? `#${textColor}` : '#ffffff' };
  });

  const allStopNames = new Map<string, string>();
  eachRow(text('stops.txt'), (get) => allStopNames.set(get('stop_id'), get('stop_name').trim()));

  const trips = new Map<string, { line: string; service: string; stops: StopTime[]; seqs: number[] }>();
  eachRow(text('trips.txt'), (get) => {
    const line = routes.get(get('route_id'));
    if (line) trips.set(get('trip_id'), { line, service: get('service_id'), stops: [], seqs: [] });
  });

  // stop_times.txt is the big one (~6 MB): only split lines of relevant trips.
  const stopNames: Timetable['stopNames'] = {};
  eachRow(text('stop_times.txt'), (get, tripId) => {
    const trip = trips.get(tripId);
    if (!trip) return;
    const stopId = get('stop_id');
    trip.stops.push([stopId, gtfsTime(get('departure_time') || get('arrival_time'))]);
    trip.seqs.push(Number(get('stop_sequence')));
    stopNames[stopId] = allStopNames.get(stopId) ?? stopId;
  });

  const kept: BusTrip[] = [];
  for (const [id, trip] of trips) {
    if (trip.stops.length < 2) continue;
    const order = trip.seqs.map((_, i) => i).sort((a, b) => trip.seqs[a] - trip.seqs[b]);
    kept.push({ id, line: trip.line, service: trip.service, stops: order.map((i) => trip.stops[i]) });
  }

  const services = new Set(kept.map((t) => t.service));
  const calendar: Timetable['calendar'] = {};
  eachRow(text('calendar.txt'), (get) => {
    const id = get('service_id');
    if (!services.has(id)) return;
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((d) => get(d) === '1');
    calendar[id] = { days, start: gtfsDate(get('start_date')), end: gtfsDate(get('end_date')) };
  });
  const added: Timetable['added'] = {};
  const removed: Timetable['removed'] = {};
  eachRow(text('calendar_dates.txt'), (get) => {
    const id = get('service_id');
    if (!services.has(id)) return;
    const target = get('exception_type') === '1' ? added : removed;
    (target[id] ??= []).push(gtfsDate(get('date')));
  });

  if (!kept.length) throw new Error(t('err.busNoTrips'));
  return { version: CACHE_VERSION, fetchedAt: Date.now(), lineColors, stopNames, trips: kept, calendar, added, removed };
}

// ---------- download + cache ----------

const cacheFile = () => new File(Paths.document, 'bus-timetable.json');
let memory: Timetable | null = null;
let loading: Promise<Timetable> | null = null;

async function download(): Promise<Timetable> {
  const res = await fetch(GTFS_URL);
  if (!res.ok) throw new Error(t('err.busHttp', { status: res.status }));
  const tt = parseGtfs(await res.bytes());
  await cacheFile().write(JSON.stringify(tt));
  return tt;
}

/** Cached timetable, re-downloaded when older than MAX_AGE_MS (falls back to the stale copy offline). */
export function loadTimetable(): Promise<Timetable> {
  loading ??= (async () => {
    if (!memory) {
      try {
        const file = cacheFile();
        if (file.exists) {
          const tt = JSON.parse(await file.text()) as Timetable;
          if (tt.version === CACHE_VERSION) memory = tt;
        }
      } catch {
        // corrupted cache: download again
      }
    }
    if (!memory || Date.now() - memory.fetchedAt > MAX_AGE_MS) {
      try {
        memory = await download();
      } catch (e) {
        if (!memory) throw e;
      }
    }
    return memory;
  })().finally(() => {
    loading = null;
  });
  return loading;
}

// ---------- departures ----------

function serviceRuns(tt: Timetable, service: string, day: string) {
  if (tt.removed[service]?.includes(day)) return false;
  if (tt.added[service]?.includes(day)) return true;
  const c = tt.calendar[service];
  return !!c && c.start <= day && day <= c.end && c.days[(weekday(day) + 6) % 7];
}

/** GTFS service-day origin: noon (Paris) minus 12 h, so DST days work. */
function serviceDayStart(day: string) {
  const [y, m, d] = day.split('-').map(Number);
  const utcNoon = Date.UTC(y, m - 1, d, 12);
  const offsetMin = parisParts(new Date(utcNoon)).minutes - 12 * 60; // Paris is ahead of UTC by this
  return utcNoon - offsetMin * 60_000 - 12 * 3600_000;
}

export type Departure = {
  tripId: string;
  line: string;
  /** Scheduled / expected departure and expected arrival, in ms. */
  scheduled: number;
  expected: number;
  arrival: number;
  realtime: boolean;
  canceled: boolean;
};

/** Stop names served by C3 / 22, sorted, with the lines serving each. */
export function busStops(tt: Timetable): { name: string; lines: string[] }[] {
  const lines = new Map<string, Set<string>>();
  for (const trip of tt.trips)
    for (const [id] of trip.stops) {
      const name = tt.stopNames[id];
      if (!lines.has(name)) lines.set(name, new Set());
      lines.get(name)!.add(trip.line);
    }
  return [...lines]
    .map(([name, l]) => ({ name, lines: BUS_LINES.filter((x) => l.has(x)) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

/** Next `count` departures from stop `fromName` that later call at `toName` (any C3 / 22 trip). */
export function nextDepartures(
  tt: Timetable,
  rt: RealtimeFeed | null,
  fromName: string,
  toName: string,
  now: number,
  count = 3,
): Departure[] {
  if (fromName === toName) return [];
  const today = parisParts(new Date(now)).day;
  const out: Departure[] = [];

  // Per trip: first call at `from`, then the first call at `to` after it.
  const legs: { trip: BusTrip; dep: StopTime; arr: StopTime }[] = [];
  for (const trip of tt.trips) {
    const i = trip.stops.findIndex(([id]) => tt.stopNames[id] === fromName);
    if (i < 0) continue;
    const j = trip.stops.findIndex(([id], k) => k > i && tt.stopNames[id] === toName);
    if (j > 0) legs.push({ trip, dep: trip.stops[i], arr: trip.stops[j] });
  }

  for (const day of [addDays(today, -1), today, addDays(today, 1)]) {
    const base = serviceDayStart(day);
    for (const { trip, dep, arr } of legs) {
      if (!serviceRuns(tt, trip.service, day)) continue;
      const scheduled = base + dep[1] * 1000;
      const scheduledArrival = base + arr[1] * 1000;
      if (scheduled < now - 3600_000 || scheduled > now + 24 * 3600_000) continue;

      // Realtime: trip updates carry absolute times per stop; ignore matches far
      // from the schedule (they belong to the same trip on another day).
      const update = rt?.trips.get(trip.id);
      const near = (t: number | null | undefined, ref: number) => (t != null && Math.abs(t - ref) < 2 * 3600_000 ? t : null);
      const rtDep = update ? near(update.stops.get(dep[0]), scheduled) : null;
      const rtArr = update ? near(update.stops.get(arr[0]), scheduledArrival) : null;
      const expected = rtDep ?? scheduled;
      if (expected < now - 30_000) continue; // gone

      out.push({
        tripId: trip.id,
        line: trip.line,
        scheduled,
        expected,
        arrival: rtArr ?? scheduledArrival + (expected - scheduled),
        realtime: rtDep != null,
        canceled: !!update?.canceled || (!!update?.stops.has(dep[0]) && update.stops.get(dep[0]) === null),
      });
    }
  }
  return out.sort((a, b) => a.expected - b.expected).slice(0, count);
}
