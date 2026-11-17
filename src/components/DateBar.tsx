// Bottom date bar: ‹ [date → calendar] ›, LIVE, refresh.
// Sits above the tab bar, so it needs no safe-area padding of its own.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { makeStyles, useAppTheme } from '../lib/theme';
import { addDays } from '../lib/time';
import { IconButton } from './Buttons';
import { CalendarSheet } from './CalendarSheet';
import { Icon } from './Icon';
import { t } from '../lib/i18n';

type Props = {
  day: string;
  onDayChange: (day: string) => void;
  /** Text of the middle (calendar) button. */
  dateLabel: string;
  /** Accessible description of the selected date. */
  dateA11yLabel: string;
  /** Days moved by the arrows (1 for a day view, 7 for a week view). */
  step?: number;
  live: boolean;
  onLive: () => void;
  onRefresh: () => void;
};

export function DateBar({ day, onDayChange, dateLabel, dateA11yLabel, step = 1, live, onLive, onRefresh }: Props) {
  const styles = useStyles();
  const { colors } = useAppTheme();
  const [calendarOpen, setCalendarOpen] = useState(false);
  const week = step === 7;

  return (
    <View style={styles.bar}>
      <View style={styles.dayNav}>
        <Pressable
          onPress={() => onDayChange(addDays(day, -step))}
          accessibilityRole="button"
          accessibilityLabel={week ? t('date.prevWeek') : t('date.prevDay')}
          style={[styles.navButton, styles.navLeft]}
        >
          <Icon name="arrow-left-s-line" size={20} color={colors.textSecondary} />
        </Pressable>
        <Pressable
          onPress={() => setCalendarOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={t('date.pick', { date: dateA11yLabel })}
          style={styles.dateButton}
        >
          <Text style={styles.dateText} numberOfLines={1}>
            {dateLabel}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => onDayChange(addDays(day, step))}
          accessibilityRole="button"
          accessibilityLabel={week ? t('date.nextWeek') : t('date.nextDay')}
          style={[styles.navButton, styles.navRight]}
        >
          <Icon name="arrow-right-s-line" size={20} color={colors.textSecondary} />
        </Pressable>
      </View>
      <LiveButton live={live} onPress={onLive} />
      <View style={styles.actions}>
        <IconButton icon="refresh-line" label={t('common.reload')} onPress={onRefresh} />
      </View>

      <CalendarSheet
        visible={calendarOpen}
        value={day}
        onClose={() => setCalendarOpen(false)}
        onSelect={(d) => {
          onDayChange(d);
          setCalendarOpen(false);
        }}
      />
    </View>
  );
}

/** Bright red and inert while live; faded red (clickable) once the cursor or day has moved. */
function LiveButton({ live, onPress }: { live: boolean; onPress: () => void }) {
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      disabled={live}
      accessibilityRole="button"
      accessibilityLabel={live ? t('date.live') : t('date.backToNow')}
      accessibilityState={{ disabled: live, selected: live }}
      style={({ pressed }) => [styles.live, !live && styles.liveIdle, pressed && styles.livePressed]}
    >
      <Icon name="record-circle-fill" size={14} color="#fff" />
      <Text style={styles.liveText}>LIVE</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
    backgroundColor: c.bg,
  },
  dayNav: { flexDirection: 'row', alignItems: 'stretch', flexShrink: 1 },
  navButton: { justifyContent: 'center', paddingHorizontal: 6, borderWidth: 1, borderColor: c.border, backgroundColor: c.bg },
  navLeft: { borderTopLeftRadius: 999, borderBottomLeftRadius: 999, borderRightWidth: 0 },
  navRight: { borderTopRightRadius: 999, borderBottomRightRadius: 999, borderLeftWidth: 0 },
  dateButton: {
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surfaceAlt,
    flexShrink: 1,
  },
  dateText: { fontSize: 14, fontWeight: '600', color: c.text },
  live: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: c.live,
  },
  liveIdle: { opacity: 0.45 },
  livePressed: { opacity: 0.8 },
  liveText: { color: '#fff', fontWeight: '800', fontSize: 13, letterSpacing: 0.5 },
  actions: { flexDirection: 'row', gap: 10, marginLeft: 'auto' },
}));
