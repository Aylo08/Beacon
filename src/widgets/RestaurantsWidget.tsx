// "Resto U": live attendance of both Crous restaurants (refreshed every 5 s
// while the home screen is shown and the restaurants are open), "Fermé" otherwise.
import { useIsFocused } from 'expo-router';
import { ActivityIndicator, Text, View } from 'react-native';
import { isRestoOpen, RESTOS } from '../lib/crous';
import { makeStyles, useAppTheme } from '../lib/theme';
import { useAttendance, useNow } from '../lib/useLive';

export function RestaurantsWidget() {
  const focused = useIsFocused();
  // Re-check the opening hours every 30 s so the widget switches by itself at 11:30 / 13:30.
  const now = useNow(30_000, focused);
  const open = isRestoOpen(now);
  return (
    <View>
      {RESTOS.map((r, i) => (
        <RestoRow key={r.id} resto={r} open={open} active={open && focused} divider={i > 0} />
      ))}
    </View>
  );
}

function RestoRow({
  resto,
  open,
  active,
  divider,
}: {
  resto: (typeof RESTOS)[number];
  open: boolean;
  active: boolean;
  divider: boolean;
}) {
  const styles = useStyles();
  const { colors } = useAppTheme();
  const { attendance, error } = useAttendance(open ? resto.id : null, active);

  let right;
  if (!open) {
    right = (
      <View style={[styles.pill, styles.closed]}>
        <Text style={styles.closedText}>Fermé</Text>
      </View>
    );
  } else if (attendance) {
    right = (
      <View style={styles.value}>
        <Text style={styles.count}>{attendance.count}</Text>
        <Text style={styles.unit}>repas</Text>
        {attendance.full && (
          <View style={[styles.pill, { backgroundColor: colors.live }]}>
            <Text style={styles.pillText}>Complet</Text>
          </View>
        )}
      </View>
    );
  } else if (error) {
    right = <Text style={styles.muted}>Indisponible</Text>;
  } else {
    right = <ActivityIndicator color={colors.textMuted} />;
  }

  return (
    <View
      style={[styles.row, divider && styles.divider]}
      accessible
      accessibilityLabel={`${resto.label} : ${!open ? 'fermé' : attendance ? `${attendance.count} repas${attendance.full ? ', complet' : ''}` : 'chargement'}`}
    >
      <View style={styles.body}>
        <Text style={styles.name}>{resto.label}</Text>
        <Text style={styles.muted} numberOfLines={1}>
          {resto.campuses}
          {open && attendance && !attendance.upToDate ? ' · données non à jour' : ''}
        </Text>
      </View>
      {right}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10 },
  divider: { borderTopWidth: 1, borderColor: c.gridLine },
  body: { flex: 1, gap: 1 },
  name: { fontSize: 14, fontWeight: '600', color: c.text },
  muted: { fontSize: 12, color: c.textMuted },
  value: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  count: { fontSize: 20, fontWeight: '800', color: c.text, fontVariant: ['tabular-nums'] },
  unit: { fontSize: 12, color: c.textMuted },
  pill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'center' },
  pillText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  closed: { backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.border },
  closedText: { color: c.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
}));
