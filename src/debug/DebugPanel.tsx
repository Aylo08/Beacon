// DEVELOPMENT ONLY — imported behind `__DEV__` (see the home screen), so it is
// not part of release bundles. Fakes now-bar scenarios: a fake clock plus fake
// classes / travel slots / holidays, with rooms mapped to campuses.
import { Pressable, Text, View } from 'react-native';
import type { RoomEvent } from '../lib/edt';
import { setNowOverride, useDebug, type NowOverride } from '../lib/debugOverride';
import { makeStyles } from '../lib/theme';
import { addDays, parisEpoch, todayKey, weekday } from '../lib/time';

const ROOM_AGROPARC = 'Debug CERI';
const ROOM_CENTRE = 'Debug Centre-ville';
const CAMPUSES = { [ROOM_AGROPARC]: 'CERI', [ROOM_CENTRE]: 'Centre-ville' };

const h = (hh: number, mm = 0) => hh * 60 + mm;

/** Today if Monday–Friday, else next Monday (the restaurants are only open on weekdays). */
function weekdayKey() {
  let d = todayKey();
  while (weekday(d) === 0 || weekday(d) === 6) d = addDays(d, 1);
  return d;
}

function ev(day: string, from: number, to: number, subject: string, room: string, type = 'CM'): RoomEvent {
  return {
    start: new Date(parisEpoch(day, from)).toISOString(),
    end: new Date(parisEpoch(day, to)).toISOString(),
    title: `Matière : ${subject}\nSalle : ${room}\nType : ${type}\n`,
    type,
    code: null,
    memo: null,
    favori: 'Debug',
  };
}

const travelEv = (day: string, from: number, to: number): RoomEvent => ({
  ...ev(day, from, to, 'Temps de déplacement', ''),
  title: 'Temps de déplacement\n',
  type: '',
});

const holidayEv = (day: string): RoomEvent => ({
  start: new Date(parisEpoch(day, 0)).toISOString(),
  end: new Date(parisEpoch(addDays(day, 1), 0)).toISOString(),
  title: 'Férié',
  type: '',
  code: null,
  memo: null,
  favori: 'Debug',
});

type Scenario = { label: string; build: () => Omit<NowOverride, 'setAt' | 'label' | 'campuses'> };

const classAt = (type: string): Scenario => ({
  label: `Cours ${type}`,
  build: () => {
    const d = weekdayKey();
    return { now: parisEpoch(d, h(10, 30)), events: [ev(d, h(10), h(12), 'Algorithmique', ROOM_AGROPARC, type)], travel: [], holidays: [] };
  },
});

const SCENARIOS: Scenario[] = [
  classAt('CM'),
  classAt('TD'),
  classAt('TP'),
  classAt('Evaluation'),
  {
    label: 'Resto U',
    build: () => {
      const d = weekdayKey();
      return {
        now: parisEpoch(d, h(12, 15)),
        events: [ev(d, h(10), h(11, 30), 'Réseaux', ROOM_AGROPARC), ev(d, h(14), h(16), 'Systèmes', ROOM_AGROPARC, 'TD')],
        travel: [],
        holidays: [],
      };
    },
  },
  {
    label: 'Déplacement',
    build: () => {
      const d = weekdayKey();
      return {
        now: parisEpoch(d, h(10, 5)),
        events: [ev(d, h(8, 30), h(10), 'Anglais', ROOM_CENTRE, 'TD'), ev(d, h(10, 45), h(12, 15), 'Algorithmique', ROOM_AGROPARC)],
        travel: [travelEv(d, h(10), h(10, 45))],
        holidays: [],
      };
    },
  },
  {
    label: 'Attente',
    build: () => {
      const d = weekdayKey();
      return {
        now: parisEpoch(d, h(15)),
        events: [ev(d, h(8), h(10), 'Maths', ROOM_AGROPARC), ev(d, h(16), h(18), 'Physique', ROOM_AGROPARC, 'TP')],
        travel: [],
        holidays: [],
      };
    },
  },
  {
    label: 'Avant 1er cours',
    build: () => {
      const d = weekdayKey();
      return { now: parisEpoch(d, h(7, 30)), events: [ev(d, h(8, 30), h(10), 'Algorithmique', ROOM_AGROPARC)], travel: [], holidays: [] };
    },
  },
  {
    label: 'Fin de journée + resto',
    build: () => {
      const d = weekdayKey();
      return {
        now: parisEpoch(d, h(12, 10)),
        events: [ev(d, h(8), h(11, 30), 'Maths', ROOM_AGROPARC), ev(addDays(d, 1), h(8, 30), h(10), 'Anglais', ROOM_CENTRE, 'TD')],
        travel: [],
        holidays: [],
      };
    },
  },
  {
    label: 'Bonne nuit',
    build: () => {
      const d = weekdayKey();
      return {
        now: parisEpoch(d, h(21)),
        events: [ev(d, h(8), h(17), 'Maths', ROOM_AGROPARC), ev(addDays(d, 1), h(8, 30), h(10), 'Anglais', ROOM_CENTRE, 'TD')],
        travel: [],
        holidays: [],
      };
    },
  },
  {
    label: 'Pas de cours',
    build: () => {
      const d = weekdayKey();
      return { now: parisEpoch(d, h(10)), events: [ev(addDays(d, 2), h(9), h(11), 'Maths', ROOM_AGROPARC)], travel: [], holidays: [] };
    },
  },
  {
    label: 'Férié',
    build: () => {
      const d = weekdayKey();
      return { now: parisEpoch(d, h(10)), events: [ev(addDays(d, 1), h(8), h(10), 'Maths', ROOM_AGROPARC)], travel: [], holidays: [holidayEv(d)] };
    },
  },
  {
    label: 'Week-end',
    build: () => {
      let sat = todayKey();
      while (weekday(sat) !== 6) sat = addDays(sat, 1);
      return { now: parisEpoch(sat, h(11)), events: [ev(addDays(sat, 2), h(8, 30), h(10), 'Maths', ROOM_AGROPARC)], travel: [], holidays: [] };
    },
  },
];

export function DebugPanel() {
  const styles = useStyles();
  const { override } = useDebug();
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Debug · barre « maintenant »</Text>
      <View style={styles.chips}>
        <Chip label="Réel" selected={!override} onPress={() => setNowOverride(null)} />
        {SCENARIOS.map((s) => (
          <Chip
            key={s.label}
            label={s.label}
            selected={override?.label === s.label}
            onPress={() => setNowOverride({ ...s.build(), setAt: Date.now(), label: s.label, campuses: CAMPUSES })}
          />
        ))}
      </View>
      <Text style={styles.hint}>
        Salles fictives : « {ROOM_AGROPARC} » (Agroparc) et « {ROOM_CENTRE} ». Le bus et l’affluence utilisent les vraies données à
        l’heure simulée.
      </Text>
    </View>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const styles = useStyles();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected }} style={[styles.chip, selected && styles.chipOn]}>
      <Text style={[styles.chipText, selected && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  card: { borderWidth: 1, borderStyle: 'dashed', borderColor: c.borderStrong, borderRadius: 14, padding: 12, gap: 10 },
  title: { fontSize: 13, fontWeight: '700', color: c.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderColor: c.border, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  chipOn: { backgroundColor: c.inverseBg, borderColor: c.inverseBg },
  chipText: { fontSize: 12, color: c.textSecondary },
  chipTextOn: { color: c.inverseText, fontWeight: '600' },
  hint: { fontSize: 11, color: c.textMuted },
}));
