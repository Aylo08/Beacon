// Bus and tram timetable (Centre-ville ↔ Agroparc campuses and the user's home
// stop), from the ORIZO open-data GTFS. Only the regular urban lines are kept:
// numbered lines (1–2 digits), "C" lines and the tram (T1); school services
// (A4, V4, S1…) and the 900s are left out.
//
// The feed is only valid a few weeks ahead, so it is downloaded on the device
// (≈2.4 MB zip), reduced to the kept lines' trips and cached as JSON.
// Stops are matched by name (a name groups the platforms of both directions)
// and lines by short name, so a new feed with renumbered IDs keeps working.
// Tram stops share their names with the bus stops there ("Gare Centre", "St Roch"…).
// "St Lazare" and "Université" are two stops ~150 m apart served by different
// lines: the user picks one, and a ride between them doesn't count (samePlace).
import { fetch } from 'expo/fetch';
import { File, Paths } from 'expo-file-system';
import { strFromU8, unzipSync } from 'fflate';
import type { RealtimeFeed } from './gtfsRt';
import { addDays, parisParts, weekday } from './time';
import { t } from './i18n';

const GTFS_URL =
  'https://api.maas-fr.cityway.fr/dataflow/offre-tc/download?provider=ORIZO&dataFormat=GTFS&dataProfil=OPENDATA';

/** Kept lines: tram "T1" and regular urban lines "04", "22", "C3"… (not "A4", "907"). */
export const isKeptLine = (shortName: string) => /^(\d{1,2}|[CT]\d+)$/i.test(shortName);

/** "T1" < "C2" < "C3" < "04" < "22": tram, then C lines, then by number. */
export const compareLines = (a: string, b: string) => {
  const rank = (l: string) => (/^T/i.test(l) ? 0 : /^C/i.test(l) ? 1 : 2);
  return rank(a) - rank(b) || a.localeCompare(b, 'fr', { numeric: true });
};

/** Centre-ville campus stops (the user picks one). */
export const CENTRE_STOPS = ['St Lazare', 'Université'] as const;
export type CentreStop = (typeof CENTRE_STOPS)[number];
/** Agroparc campus stops (the user picks one). */
export const CAMPUS_STOPS = ['Grand Avignon', 'Montaigne', 'Agrosciences'] as const;
export type CampusStop = (typeof CAMPUS_STOPS)[number];
/**
 * Agroparc stop used when changing campus. Agrosciences is only served by line 04, which doesn't
 * go to Centre-ville: from there, campus changes go through Grand Avignon (C3) instead.
 */
export const campusChangeStop = (campusStop: CampusStop): CampusStop => (campusStop === 'Agrosciences' ? 'Grand Avignon' : campusStop);
/** Name stored before St Lazare and Université were split (old prefs). */
export const LEGACY_CENTRE_STOP = 'St Lazare / Université';

const isCentre = (name: string) => (CENTRE_STOPS as readonly string[]).includes(name);
/** Same stop, or St Lazare / Université (one place): no trip between them. */
export const samePlace = (a: string, b: string) => a === b || (isCentre(a) && isCentre(b));

/** Re-download the timetable after this long (the feed is published every few days). */
const MAX_AGE_MS = 3 * 24 * 3600_000;
const CACHE_VERSION = 6;

/** [stop_id, seconds since the start of the service day (may exceed 24 h)], in stop order. */
type StopTime = [string, number];
/** `limited`: limited-stop service (the C3 "DIRECT" trips). `headsign`: destination, readable ("Porte de l'Oulle"). */
type BusTrip = { id: string; line: string; service: string; limited: boolean; headsign: string; stops: StopTime[] };

export type Timetable = {
  version: number;
  fetchedAt: number;
  lineColors: Record<string, { bg: string; text: string }>;
  /** stop_id → stop name, for the stops served by these lines. */
  stopNames: Record<string, string>;
  /** Stop name → [latitude, longitude] (centre of its platforms). */
  stopCoords: Record<string, [number, number]>;
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

/** Words kept as written in headsigns. */
const KEEP_UPPER = new Set(['P+R', 'TGV', 'LEP', 'DB', 'CCI', 'IUT', 'CERI']);
const LOWER_WORDS = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'par', 'et', 'sur', 'en', 'aux', 'au']);

/** "PORTE DE L'OULLE" → "Porte de l'Oulle", "DIRECT P+R AGROPARC" → "P+R Agroparc" (DIRECT is shown as a label). */
export function formatHeadsign(raw: string): string {
  const words = raw.replace(/^\s*DIRECT\s+/i, '').trim().split(/\s+/).filter(Boolean);
  return words
    .map((w, i) => {
      if (KEEP_UPPER.has(w.toUpperCase())) return w.toUpperCase();
      const lower = w.toLowerCase();
      if (i > 0 && LOWER_WORDS.has(lower)) return lower;
      // Capitalise after word starts, hyphens, dots and apostrophes ("saint-lazare", "a.frank", "buld'air"),
      // except an elided article ("l'oulle" → "l'Oulle").
      return lower.replace(/(^|[-.'’])(\p{L})/gu, (m, sep: string, ch: string, off: number) =>
        off === 0 && i > 0 && /^[ld]['’]/.test(lower) ? m : sep + ch.toUpperCase(),
      );
    })
    .join(' ');
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
    if (!isKeptLine(short)) return;
    routes.set(get('route_id'), short);
    const color = get('route_color');
    const textColor = get('route_text_color');
    lineColors[short] = { bg: color ? `#${color}` : '#2563eb', text: textColor ? `#${textColor}` : '#ffffff' };
  });

  const allStopNames = new Map<string, string>();
  const allStopCoords = new Map<string, [number, number]>();
  eachRow(text('stops.txt'), (get) => {
    allStopNames.set(get('stop_id'), get('stop_name').trim());
    const lat = Number(get('stop_lat'));
    const lon = Number(get('stop_lon'));
    if (lat && lon) allStopCoords.set(get('stop_id'), [lat, lon]);
  });

  const trips = new Map<string, { line: string; service: string; limited: boolean; headsign: string; stops: StopTime[]; seqs: number[] }>();
  eachRow(text('trips.txt'), (get) => {
    const line = routes.get(get('route_id'));
    // Limited-stop trips are announced by their headsign ("DIRECT SAINT-LAZARE").
    const limited = /^\s*DIRECT\b/i.test(get('trip_headsign'));
    const headsign = formatHeadsign(get('trip_headsign'));
    if (line) trips.set(get('trip_id'), { line, service: get('service_id'), limited, headsign, stops: [], seqs: [] });
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
    const stops = order.map((i) => trip.stops[i]);
    // No headsign: the terminus.
    const headsign = trip.headsign || (allStopNames.get(stops[stops.length - 1][0]) ?? '');
    kept.push({ id, line: trip.line, service: trip.service, limited: trip.limited, headsign, stops });
  }

  // Centre of each stop's platforms.
  const sums: Record<string, [number, number, number]> = {};
  for (const [id, name] of Object.entries(stopNames)) {
    const c = allStopCoords.get(id);
    if (!c) continue;
    const acc = (sums[name] ??= [0, 0, 0]);
    acc[0] += c[0];
    acc[1] += c[1];
    acc[2]++;
  }
  const stopCoords: Timetable['stopCoords'] = {};
  for (const [name, [lat, lon, n]] of Object.entries(sums)) stopCoords[name] = [lat / n, lon / n];

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
  return { version: CACHE_VERSION, fetchedAt: Date.now(), lineColors, stopNames, stopCoords, trips: kept, calendar, added, removed };
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
  /** Limited-stop service ("DIRECT"). */
  limited: boolean;
  /** Where the bus goes ("Porte de l'Oulle"). */
  headsign: string;
};

/** Stop names served by the kept lines (bus and tram), sorted, with the lines serving each. */
export function busStops(tt: Timetable): { name: string; lines: string[] }[] {
  const lines = new Map<string, Set<string>>();
  for (const trip of tt.trips)
    for (const [id] of trip.stops) {
      const name = tt.stopNames[id];
      if (!lines.has(name)) lines.set(name, new Set());
      lines.get(name)!.add(trip.line);
    }
  return [...lines]
    .map(([name, l]) => ({ name, lines: [...l].sort(compareLines) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

/** Distance in metres between two [lat, lon] points (haversine). */
export function distanceM([lat1, lon1]: [number, number], [lat2, lon2]: [number, number]) {
  const rad = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(a));
}

/** The stop of `names` nearest to `here` (names without coordinates are ignored), or null. */
export function nearestStop(tt: Timetable, names: string[], here: [number, number]): { name: string; distance: number } | null {
  let best: { name: string; distance: number } | null = null;
  for (const name of names) {
    const c = tt.stopCoords[name];
    if (!c) continue;
    const distance = distanceM(here, c);
    if (!best || distance < best.distance) best = { name, distance };
  }
  return best;
}

type Leg = { trip: BusTrip; dep: StopTime; arr: StopTime };

/** Departures of `legs` (yesterday's, today's and tomorrow's services), realtime applied, soonest first. */
function departuresOf(tt: Timetable, rt: RealtimeFeed | null, legs: Leg[], now: number, count: number): Departure[] {
  const today = parisParts(new Date(now)).day;
  const out: Departure[] = [];
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
        limited: trip.limited,
        headsign: trip.headsign,
      });
    }
  }
  return out.sort((a, b) => a.expected - b.expected).slice(0, count);
}

/** Next `count` departures from stop `fromName` that later call at `toName` (any kept line). */
export function nextDepartures(
  tt: Timetable,
  rt: RealtimeFeed | null,
  fromName: string,
  toName: string,
  now: number,
  count = 3,
): Departure[] {
  if (samePlace(fromName, toName)) return [];
  // Per trip: first call at `from`, then the first call at `to` after it.
  const legs: Leg[] = [];
  for (const trip of tt.trips) {
    const i = trip.stops.findIndex(([id]) => tt.stopNames[id] === fromName);
    if (i < 0) continue;
    const j = trip.stops.findIndex(([id], k) => k > i && tt.stopNames[id] === toName);
    if (j > 0) legs.push({ trip, dep: trip.stops[i], arr: trip.stops[j] });
  }
  return departuresOf(tt, rt, legs, now, count);
}

/**
 * Next `count` departures of every line from stop `name`, whatever their destination
 * (arrival = terminus). Buses ending there aren't departures: a call counts only if
 * the bus then goes on to another place (so "St Lazare → Université" at the end of a
 * trip is an arrival, see samePlace).
 */
export function stopDepartures(tt: Timetable, rt: RealtimeFeed | null, name: string, now: number, count = 6): Departure[] {
  const legs: Leg[] = [];
  for (const trip of tt.trips) {
    const i = trip.stops.findIndex(([id], k) => tt.stopNames[id] === name && trip.stops.slice(k + 1).some(([n]) => !samePlace(tt.stopNames[n], name)));
    if (i >= 0) legs.push({ trip, dep: trip.stops[i], arr: trip.stops[trip.stops.length - 1] });
  }
  return departuresOf(tt, rt, legs, now, count);
}
