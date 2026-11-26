// The trip opened from the Bus widget, shown by the trip screen (src/app/trip.tsx),
// with the other options to the same place. In memory only: the screen is opened
// right after it is set.
import type { Journey } from './journey';
import { createStore } from './store';

export type OpenedTrip = {
  /** Trips to the same place, soonest first; `index`: the one shown. */
  options: Journey[];
  index: number;
  /** Starting stop and destination, as shown in the widget. */
  from: string;
  to: string;
  /** The destination is the home stop (else a campus). */
  home: boolean;
};

const store = createStore<{ trip: OpenedTrip | null }>({ trip: null });

export const openTrip = (trip: OpenedTrip) => store.set({ trip });
export const showOption = (index: number) => {
  const trip = store.get().trip;
  if (trip) store.set({ trip: { ...trip, index } });
};
export const useOpenedTrip = () => store.use().trip;
