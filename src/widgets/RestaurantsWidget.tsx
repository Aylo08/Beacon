// "Resto U": live attendance of both Crous restaurants (refreshed every 5 s
// while the home screen is shown and the restaurants are open), "Fermé" otherwise.
import { useIsFocused } from 'expo-router';
import { ActivityIndicator, Text, View } from 'react-native';
import { attendancePercent, isRestoOpen, RESTOS, type Attendance } from '../lib/crous';
import { makeStyles, occupancyColor, useAppTheme } from '../lib/theme';
import { useAttendance, useNow } from '../lib/useLive';
import { t } from '../lib/i18n';

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
        <Text style={styles.closedText}>{t('resto.closed')}</Text>
      </View>
    );
  } else if (attendance) {
    const percent = attendancePercent(attendance);
    right = (
      <View style={styles.gauge}>
        <View style={styles.value}>
          {attendance.full && (
            <View style={[styles.pill, { backgroundColor: colors.live }]}>
              <Text style={styles.pillText}>{t('resto.full')}</Text>
            </View>
          )}
          <Text style={styles.count}>{attendance.count}</Text>
          <Text style={styles.unit}>{attendance.capacity ? `/ ${attendance.capacity}` : t('resto.meals')}</Text>
        </View>
        {percent !== null && (
          <View style={styles.track}>
            <View
              style={[
                styles.fill,
                { width: `${percent}%`, backgroundColor: occupancyColor(colors, attendance.full ? 100 : percent) },
              ]}
            />
          </View>
        )}
      </View>
    );
  } else if (error) {
    right = <Text style={styles.muted}>{t('resto.unavailable')}</Text>;
  } else {
    right = <ActivityIndicator color={colors.textMuted} />;
  }

  return (
    <View
      style={[styles.row, divider && styles.divider]}
      accessible
      accessibilityLabel={`${resto.label}: ${!open ? t('resto.a11yClosed') : attendance ? a11yAttendance(attendance) : t('common.loading')}`}
    >
      <View style={styles.body}>
        <Text style={styles.name}>{resto.label}</Text>
        <Text style={styles.muted} numberOfLines={1}>
          {resto.campuses}
          {open && attendance && !attendance.upToDate ? t('resto.stale') : ''}
        </Text>
      </View>
      {right}
    </View>
  );
}

function a11yAttendance(a: Attendance) {
  const percent = attendancePercent(a);
  return [
    t('resto.a11yMeals', { count: a.count }),
    percent !== null ? `, ${t('library.a11yOccupancy', { percent })}` : '',
    a.full ? t('resto.a11yFull') : '',
  ].join('');
}

const useStyles = makeStyles((c) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10 },
  divider: { borderTopWidth: 1, borderColor: c.gridLine },
  body: { flex: 1, gap: 1 },
  name: { fontSize: 14, fontWeight: '600', color: c.text },
  muted: { fontSize: 12, color: c.textMuted },
  gauge: { alignItems: 'flex-end', gap: 4 },
  value: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  count: { fontSize: 20, fontWeight: '800', color: c.text, fontVariant: ['tabular-nums'] },
  unit: { fontSize: 12, color: c.textMuted, fontVariant: ['tabular-nums'] },
  track: { width: 64, height: 4, borderRadius: 2, backgroundColor: c.gridLine, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2 },
  pill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'center' },
  pillText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  closed: { backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.border },
  closedText: { color: c.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
}));
