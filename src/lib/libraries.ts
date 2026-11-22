// University libraries (BU): opening status and live occupancy from Affluences
// (public API, needs the `x-service-name: website` header). Each response carries
// an ETag; it is sent back with If-None-Match so unchanged data costs a 304
// instead of counting against the API's rate limit.
import { addDays, formatMinutes, shortDayLabel, todayKey } from './time';
import { t } from './i18n';

export const LIBRARIES = [
  { id: 'bu-maurice-agulhon', label: 'Maurice Agulhon', campus: 'Centre-ville' },
  { id: 'bu-agroparc', label: 'Agroparc', campus: 'Agrosciences · CERI · IUT' },
] as const;

/** Estimated crowd level, when the site has no exact occupancy. */
export type Flow = 'FLUID' | 'MODERATE' | 'DENSE';

export type LibraryStatus = {
  open: boolean;
  /** Occupancy in % of the building's capacity, when measured. */
  occupancy: number | null;
  flow: Flow | null;
  /** Next opening / closing, Paris time ("2026-11-23 07:45:00"). */
  opensAt: string | null;
  closesAt: string | null;
};

type LiveDataResponse = {
  data?: {
    status?: { isOpen?: boolean; openingAt?: string | null; closingAt?: string | null };
    liveAttendance?: { occupancy?: number | null; flow?: string | null } | null;
  };
};

const FLOWS: readonly string[] = ['FLUID', 'MODERATE', 'DENSE'];

function parse(raw: LiveDataResponse): LibraryStatus {
  const status = raw.data?.status;
  const live = raw.data?.liveAttendance;
  const occupancy = typeof live?.occupancy === 'number' && Number.isFinite(live.occupancy) ? Math.max(0, Math.round(live.occupancy)) : null;
  return {
    open: status?.isOpen === true,
    occupancy,
    flow: live?.flow && FLOWS.includes(live.flow) ? (live.flow as Flow) : null,
    opensAt: status?.openingAt ?? null,
    closesAt: status?.closingAt ?? null,
  };
}

/** Last response per site, with its ETag. */
const cache = new Map<string, { etag: string; value: LibraryStatus }>();

export async function fetchLibrary(id: string): Promise<LibraryStatus> {
  const cached = cache.get(id);
  // A fixed language: the API localises its texts (unused here), and a different
  // Accept-Language means a different body, so the ETag would never match.
  const headers: Record<string, string> = { Accept: 'application/json', 'Accept-Language': 'en', 'x-service-name': 'website' };
  if (cached) headers['If-None-Match'] = cached.etag;
  const res = await fetch(`https://api.affluences.com/app/v4/sites/${encodeURIComponent(id)}/live-data`, { headers });
  if (res.status === 304 && cached) return cached.value;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const value = parse(await res.json());
  const etag = res.headers.get('etag');
  if (etag) cache.set(id, { etag, value });
  else cache.delete(id);
  return value;
}

/** "2026-11-23 07:45:00" → day key + minutes of the day. */
function parseLocal(s: string | null): { day: string; minutes: number } | null {
  const m = s?.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/);
  return m ? { day: m[1], minutes: Number(m[2]) * 60 + Number(m[3]) } : null;
}

/** "Ferme à 19:00", "Ouvre demain à 07:45"… */
export function hoursLabel(status: LibraryStatus): string {
  if (status.open) {
    const closes = parseLocal(status.closesAt);
    return closes ? t('library.closesAt', { time: formatMinutes(closes.minutes) }) : t('library.open');
  }
  const opens = parseLocal(status.opensAt);
  if (!opens) return t('library.closed');
  const time = formatMinutes(opens.minutes);
  const today = todayKey();
  if (opens.day === today) return t('library.opensToday', { time });
  if (opens.day === addDays(today, 1)) return t('library.opensTomorrow', { time });
  return t('library.opensOn', { day: shortDayLabel(opens.day), time });
}
