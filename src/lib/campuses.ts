// The two campuses the Bus widget shows trips to (university places: names not
// translated). Positions: the campus addresses from the national address base
// (Sainte-Marthe: 74 rue Louis Pasteur; Agroparc: Campus Agrosciences, 301 rue
// Baruch de Spinoza). Trips end at a stop within walking distance (lib/journey).
import { distanceM } from './gtfs';

export const CAMPUSES = [
  { id: 'sainteMarthe', name: 'Sainte-Marthe', lat: 43.949669, lon: 4.817115 },
  { id: 'agroparc', name: 'Agroparc', lat: 43.912027, lon: 4.889529 },
] as const;

export type Campus = (typeof CAMPUSES)[number];

/** Stops this close to a campus serve it (Université, St Lazare; Grand Avignon, Montaigne, Agrosciences). */
const AT_CAMPUS_M = 1000;

/** The campus a stop serves, or null. */
export const campusAt = ({ lat, lon }: { lat: number; lon: number }): Campus | null =>
  CAMPUSES.find((c) => distanceM([lat, lon], [c.lat, c.lon]) <= AT_CAMPUS_M) ?? null;
