// "Bus": next C3 / 22 departures between Centre-ville (St Lazare) and the
// Agroparc campuses, with a Grand Avignon / Montaigne toggle. Realtime from the
// ORIZO GTFS-RT feed (polled every 30 s while visible), else the timetable.
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useIsFocused } from 'expo-router';
import { CAMPUS_STOPS, CENTRE_STOP, nextDepartures, type Departure, type Timetable } from '../lib/bus';
import { setCampusStop, useBusPrefs } from '../lib/busPrefs';
import { makeStyles, useAppTheme } from '../lib/theme';
import { formatMinutes, parisParts } from '../lib/time';
import { useRealtime, useTimetable } from '../lib/useBus';
import { useNow } from '../lib/useLive';

export function BusWidget() {
  const focused = useIsFocused();
  const styles = useStyles();
  const { colors } = useAppTheme();
  const { campusStop: campus } = useBusPrefs();
  const { timetable, error } = useTimetable(focused);
  const rt = useRealtime(focused);
  const now = useNow(15_000, focused);

  const lists = useMemo(
    () =>
      timetable && {
        toCentre: nextDepartures(timetable, rt, campus, CENTRE_STOP, now),
        toCampus: nextDepartures(timetable, rt, CENTRE_STOP, campus, now),
      },
    [timetable, rt, campus, now],
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.segmented} accessibilityRole="radiogroup">
        {CAMPUS_STOPS.map((c) => {
          const selected = c === campus;
          return (
            <Pressable
              key={c}
              onPress={() => setCampusStop(c)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              style={[styles.segment, selected && styles.segmentSelected]}
            >
              <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>{c}</Text>
            </Pressable>
          );
        })}
      </View>

      {!lists ? (
        error ? (
          <Text style={[styles.muted, styles.pad]}>Horaires indisponibles ({error})</Text>
        ) : (
          <ActivityIndicator color={colors.textMuted} style={styles.pad} />
        )
      ) : (
        <>
          <Section
            title={`${campus} → Centre-ville (${CENTRE_STOP})`}
            departures={lists.toCentre}
            now={now}
            lineColors={timetable!.lineColors}
          />
          <Section title={`${CENTRE_STOP} → ${campus}`} departures={lists.toCampus} now={now} lineColors={timetable!.lineColors} />
          <Text style={[styles.muted, styles.footer]}>
            {rt ? 'Temps réel ORIZO · lignes C3 et 22' : 'Horaires théoriques (temps réel indisponible) · lignes C3 et 22'}
          </Text>
        </>
      )}
    </View>
  );
}

function Section({
  title,
  departures,
  now,
  lineColors,
}: {
  title: string;
  departures: Departure[];
  now: number;
  lineColors: Timetable['lineColors'];
}) {
  const styles = useStyles();
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} numberOfLines={1}>
        {title}
      </Text>
      {departures.length === 0 ? (
        <Text style={styles.muted}>Aucun bus dans les prochaines 24 h</Text>
      ) : (
        departures.map((d) => <DepartureRow key={`${d.tripId}-${d.scheduled}`} d={d} now={now} lineColors={lineColors} />)
      )}
    </View>
  );
}

const hhmm = (ms: number) => formatMinutes(parisParts(new Date(ms)).minutes);

function DepartureRow({ d, now, lineColors }: { d: Departure; now: number; lineColors: Timetable['lineColors'] }) {
  const styles = useStyles();
  const { colors } = useAppTheme();
  const color = lineColors[d.line] ?? { bg: colors.primary, text: '#fff' };
  const mins = Math.max(0, Math.round((d.expected - now) / 60_000));
  const delay = Math.round((d.expected - d.scheduled) / 60_000);
  const wait = mins === 0 ? 'Maintenant' : mins < 60 ? `${mins} min` : hhmm(d.expected);

  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`Ligne ${d.line}, départ ${hhmm(d.expected)}${d.canceled ? ', supprimé' : `, dans ${wait}`}, arrivée ${hhmm(d.arrival)}`}
    >
      <View style={[styles.badge, { backgroundColor: color.bg }]}>
        <Text style={[styles.badgeText, { color: color.text }]}>{d.line}</Text>
      </View>
      <View style={styles.times}>
        <Text style={[styles.time, d.canceled && styles.canceled]}>
          {hhmm(d.expected)}
          {delay !== 0 && !d.canceled && <Text style={styles.scheduled}> {hhmm(d.scheduled)}</Text>}
        </Text>
        <Text style={styles.muted}>arrivée {hhmm(d.arrival)}</Text>
      </View>
      <View style={styles.right}>
        {d.canceled ? (
          <Text style={[styles.wait, { color: colors.danger }]}>Supprimé</Text>
        ) : (
          <Text style={styles.wait}>{wait}</Text>
        )}
        {!d.canceled && (
          <View style={styles.status}>
            {d.realtime && <View style={[styles.dot, { backgroundColor: delay > 1 ? '#f59e0b' : '#22c55e' }]} />}
            <Text style={styles.muted}>
              {!d.realtime ? 'théorique' : delay > 0 ? `+${delay} min` : delay < 0 ? `${delay} min` : "à l'heure"}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: { padding: 12, gap: 12 },
  pad: { paddingVertical: 8 },
  segmented: { flexDirection: 'row', backgroundColor: c.surfaceAlt, borderRadius: 10, padding: 3, gap: 3 },
  segment: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 8 },
  segmentSelected: { backgroundColor: c.inverseBg },
  segmentText: { fontSize: 13, color: c.textSecondary },
  segmentTextSelected: { color: c.inverseText, fontWeight: '600' },
  section: { gap: 6 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: c.textMuted, letterSpacing: 0.3 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  badge: { minWidth: 34, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, alignItems: 'center' },
  badgeText: { fontSize: 13, fontWeight: '800' },
  times: { flex: 1 },
  time: { fontSize: 15, fontWeight: '700', color: c.text, fontVariant: ['tabular-nums'] },
  scheduled: { fontSize: 12, fontWeight: '400', color: c.textFaint, textDecorationLine: 'line-through' },
  canceled: { textDecorationLine: 'line-through', color: c.textMuted },
  right: { alignItems: 'flex-end' },
  wait: { fontSize: 15, fontWeight: '700', color: c.text, fontVariant: ['tabular-nums'] },
  status: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  muted: { fontSize: 12, color: c.textMuted },
  footer: { fontSize: 11 },
}));
