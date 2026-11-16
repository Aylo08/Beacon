// Crous restaurant attendance ("écran" endpoints, public), and which restaurant
// serves which campus.
import { edt, type Campus } from './edt';
import { normalizeSearch } from './events';
import { parisParts, weekday } from './time';

/** Agroparc restaurant: Agrosciences, CERI, IUT (and unknown campuses). */
export const RESTO_AGROPARC = '13-31-9';
/** Sainte-Marthe restaurant: Centre-ville. */
export const RESTO_CENTRE_VILLE = '13-3-8';

export const RESTOS = [
  { id: RESTO_AGROPARC, label: 'Agroparc', campuses: 'Agrosciences · CERI · IUT' },
  { id: RESTO_CENTRE_VILLE, label: 'Sainte-Marthe', campuses: 'Centre-ville' },
];

const OPEN_FROM = 11 * 60 + 30;
const OPEN_UNTIL = 13 * 60 + 30;

/** Lunch service: Monday–Friday, 11:30–13:30 (Paris time). */
export function isRestoOpen(nowMs: number) {
  const { day, minutes } = parisParts(new Date(nowMs));
  const wd = weekday(day);
  return wd >= 1 && wd <= 5 && minutes >= OPEN_FROM && minutes < OPEN_UNTIL;
}

export type Attendance = {
  /** Restaurant name, e.g. "RESTAURANT AGROPARC". */
  name: string;
  /** `repas` as reported by the Crous screen. */
  count: number;
  /** `depassement`: over capacity. */
  full: boolean;
  /** false when the Crous says its data is stale. */
  upToDate: boolean;
  updatedAt: string;
};

export async function fetchAttendance(restoId: string): Promise<Attendance> {
  const res = await fetch(`https://restos.lescrous.fr/api/ecran/${restoId}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Crous: HTTP ${res.status}`);
  const data = await res.json();
  const lieu = data?.lieux?.[0];
  if (!lieu) throw new Error('Crous: aucune donnée');
  return {
    name: String(lieu.libelle ?? 'Restaurant'),
    count: Number(lieu.repas) || 0,
    full: !!lieu.depassement,
    upToDate: data.donneesAJour !== false,
    updatedAt: String(data.majLe ?? ''),
  };
}

export const restoForCampus = (campus: string | null) =>
  campus && normalizeSearch(campus).includes('centre') ? RESTO_CENTRE_VILLE : RESTO_AGROPARC;

// The room list is the same for everyone and rarely changes: fetch it once per token.
let campuses: { token: string; promise: Promise<Campus[]> } | null = null;
function getCampuses(token: string) {
  if (campuses?.token !== token) {
    const promise = edt.getSalles(token);
    campuses = { token, promise };
    promise.catch(() => {
      if (campuses?.promise === promise) campuses = null; // retry next time
    });
  }
  return campuses.promise;
}

/** Campus name of the room(s) in an event's "Salle(s)" field, or null if unknown. */
export async function campusOfRoom(token: string, room: string): Promise<string | null> {
  const target = normalizeSearch(room);
  if (!target) return null;
  let best: { campus: string; len: number } | null = null;
  for (const c of await getCampuses(token)) {
    for (const s of c.names) {
      const name = normalizeSearch(s.name);
      // Longest room name contained in the field wins (e.g. "S2" vs "S2 CERI").
      if (name && target.includes(name) && (!best || name.length > best.len)) best = { campus: c.letter, len: name.length };
    }
  }
  return best?.campus ?? null;
}
