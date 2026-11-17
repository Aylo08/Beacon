// "Mon EDT": the user's default timetable (events_perso). Phones: one day,
// swipe left/right to change day. Wide screens: Monday–Friday week.
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AgendaGrid } from '../../components/AgendaGrid';
import { DateBar } from '../../components/DateBar';
import { DayPager } from '../../components/DayPager';
import { EventSheet } from '../../components/EventSheet';
import { Icon } from '../../components/Icon';
import { OptionSheet } from '../../components/OptionSheet';
import type { RoomEvent } from '../../lib/edt';
import { usePersonalData } from '../../lib/personalData';
import { makeStyles, useAppTheme } from '../../lib/theme';
import { addDays, dayLabel, mondayOf, parisParts, shortDayLabel, todayKey } from '../../lib/time';
import { t } from '../../lib/i18n';

const WIDE_BREAKPOINT = 768;

export default function PersonalScreen() {
  const { width } = useWindowDimensions();
  const wide = width >= WIDE_BREAKPOINT;
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useAppTheme();
  const { favoris, selected: favori, selectFavori, events, error, reload } = usePersonalData();
  const [pickerOpen, setPickerOpen] = useState(false);

  const [day, setDay] = useState(todayKey);
  const [recenter, setRecenter] = useState(0);
  const [selected, setSelected] = useState<RoomEvent | null>(null);

  // Wide screens: Mon–Fri of the selected day's week (+ Sat/Sun if they have classes).
  const weekDays = useMemo(() => {
    const monday = mondayOf(day);
    const week = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
    const hasEvents = (d: string) => events?.some((e) => parisParts(new Date(e.start)).day === d);
    return week.filter((d, i) => i < 5 || hasEvents(d));
  }, [day, events]);
  const shownDays = wide ? weekDays : [day];

  const today = todayKey();
  const live = wide ? mondayOf(day) === mondayOf(today) : day === today;
  const goLive = useCallback(() => {
    setDay(todayKey());
    setRecenter((n) => n + 1);
  }, []);

  const count = events
    ? events.filter((e) => shownDays.includes(parisParts(new Date(e.start)).day) && e.type !== 'Annulation').length
    : 0;

  return (
    <View style={[styles.flex, { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }]}>
      <View style={styles.flex}>
        {error ? (
          <View style={styles.center}>
            <Text style={styles.error}>{error}</Text>
          </View>
        ) : !events ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.textMuted} />
          </View>
        ) : wide ? (
          <AgendaGrid days={weekDays} events={events} onSelect={setSelected} recenter={recenter} />
        ) : (
          <DayPager
            day={day}
            onDayChange={setDay}
            renderDay={(d) => (
              <View style={styles.flex}>
                <Text style={styles.dayTitle}>{dayLabel(d)}</Text>
                <AgendaGrid days={[d]} events={events} onSelect={setSelected} recenter={recenter} />
              </View>
            )}
          />
        )}
      </View>

      <DateBar
        day={day}
        onDayChange={setDay}
        step={wide ? 7 : 1}
        dateLabel={wide ? t('perso.weekOf', { day: shortDayLabel(mondayOf(day)) }) : shortDayLabel(day)}
        dateA11yLabel={wide ? t('perso.weekOf', { day: dayLabel(mondayOf(day)) }) : dayLabel(day)}
        live={live}
        onLive={goLive}
        onRefresh={reload}
      />

      <View style={styles.statusBar}>
        {/* Favori selector */}
        <Pressable
          onPress={() => setPickerOpen(true)}
          disabled={!favoris || favoris.length < 2}
          accessibilityRole="button"
          accessibilityLabel={`${t('perso.pickerA11y', { name: favori?.name ?? t('perso.personal') })}${favoris && favoris.length > 1 ? t('perso.change') : ''}`}
          style={styles.favoriButton}
        >
          <Icon name="calendar-2-line" size={14} color={colors.textSecondary} />
          <Text style={styles.favoriText} numberOfLines={1}>
            {favori ? favori.name : t('perso.timetable')}
          </Text>
          {favoris && favoris.length > 1 && <Icon name="arrow-down-s-line" size={16} color={colors.textMuted} />}
        </Pressable>
        <Text style={styles.muted} numberOfLines={1}>
          {events ? t(wide ? 'perso.countWeek' : 'perso.countDay', { count }) : t('perso.loading')}
        </Text>
      </View>

      <OptionSheet
        visible={pickerOpen}
        title={t('perso.timetable')}
        options={(favoris ?? []).map((f) => ({ value: String(f.id), label: f.name, detail: f.defaut ? t('perso.default') : undefined }))}
        value={favori ? String(favori.id) : ''}
        onClose={() => setPickerOpen(false)}
        onSelect={(id) => {
          selectFavori(Number(id));
          setPickerOpen(false);
        }}
      />

      <EventSheet event={selected} onClose={() => setSelected(null)} />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  flex: { flex: 1, backgroundColor: c.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16, backgroundColor: c.bg },
  dayTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: c.text,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
    backgroundColor: c.surfaceAlt,
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: c.surfaceAlt,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
  },
  muted: { color: c.textMuted, fontSize: 12 },
  favoriButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 1,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginLeft: -8,
    borderRadius: 999,
  },
  favoriText: { fontSize: 12, fontWeight: '600', color: c.textSecondary, flexShrink: 1 },
  error: { color: c.danger, textAlign: 'center' },
}));
