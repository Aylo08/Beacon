// Settings: home bus stop (any stop of the kept lines) and Agroparc stop (Grand Avignon / Montaigne).
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { busStops, CAMPUS_STOPS } from '../lib/bus';
import { setCampusStop, setHomeStop, useBusPrefs } from '../lib/busPrefs';
import { makeStyles, useAppTheme } from '../lib/theme';
import { useTimetable } from '../lib/useBus';
import { Icon } from './Icon';
import { OptionSheet } from './OptionSheet';
import { t } from '../lib/i18n';

const NONE = '__none__';

export function BusSettings() {
  const styles = useStyles();
  const { colors } = useAppTheme();
  const { homeStop, campusStop } = useBusPrefs();
  const [open, setOpen] = useState(false);
  // Only needed for the stop list: load it when the picker opens.
  const { timetable, error } = useTimetable(open);
  const options = useMemo(
    () => [
      { value: NONE, label: t('common.none') },
      ...(timetable ? busStops(timetable) : []).map((s) => ({ value: s.name, label: s.name, detail: s.lines.join(' · ') })),
    ],
    [timetable],
  );

  return (
    <View style={styles.wrap}>
      <Text style={styles.cardTitle}>{t('busSettings.title')}</Text>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={t('busSettings.homeA11y', { stop: homeStop ?? t('busSettings.none') })}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      >
        <Icon name="map-pin-2-line" size={18} color={colors.primary} />
        <View style={styles.flex}>
          <Text style={styles.label}>{t('busSettings.home')}</Text>
          <Text style={styles.hint}>{t('busSettings.homeHint')}</Text>
        </View>
        <Text style={styles.value} numberOfLines={1}>
          {homeStop ?? t('busSettings.choose')}
        </Text>
        <Icon name="arrow-right-s-line" size={20} color={colors.textMuted} />
      </Pressable>

      <Text style={styles.label}>{t('busSettings.campusStop')}</Text>
      <View style={styles.segmented} accessibilityRole="radiogroup">
        {CAMPUS_STOPS.map((c) => {
          const selected = c === campusStop;
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

      <OptionSheet
        visible={open && !!timetable}
        title={t('busSettings.picker')}
        options={options}
        value={homeStop ?? NONE}
        onSelect={(v) => {
          setHomeStop(v === NONE ? null : v);
          setOpen(false);
        }}
        onClose={() => setOpen(false)}
      />
      {open && !timetable && (error ? <Text style={styles.error}>{t('bus.unavailable', { error })}</Text> : <ActivityIndicator color={colors.textMuted} />)}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: { gap: 10 },
  flex: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: c.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderRadius: 8 },
  pressed: { backgroundColor: c.pressed },
  label: { fontSize: 14, fontWeight: '600', color: c.text },
  hint: { fontSize: 12, color: c.textMuted },
  value: { fontSize: 14, color: c.textSecondary, maxWidth: 140 },
  error: { fontSize: 13, color: c.danger },
  segmented: { flexDirection: 'row', backgroundColor: c.surfaceAlt, borderRadius: 10, padding: 3, gap: 3 },
  segment: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8 },
  segmentSelected: { backgroundColor: c.inverseBg },
  segmentText: { fontSize: 14, color: c.textSecondary },
  segmentTextSelected: { color: c.inverseText, fontWeight: '600' },
}));
