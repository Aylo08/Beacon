// "Aujourd'hui": today's classes from the personal timetable, with the current
// class and the next one highlighted. Tapping opens the "Mon EDT" tab.
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { RoomEvent } from '../lib/edt';
import { titleField } from '../lib/events';
import { usePersonalData } from '../lib/personalData';
import { eventColors, makeStyles, useAppTheme } from '../lib/theme';
import { formatMinutes, parisParts, shortDayLabel, todayKey } from '../lib/time';
import { t } from '../lib/i18n';

type Item = { event: RoomEvent; day: string; start: number; end: number; subject: string; room?: string };

function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

const toItem = (event: RoomEvent): Item => {
  const s = parisParts(new Date(event.start));
  const e = parisParts(new Date(event.end));
  return {
    event,
    day: s.day,
    start: s.minutes,
    end: e.day === s.day ? e.minutes : 24 * 60,
    subject: titleField(event.title, 'Matière') ?? event.title.split('\n')[0] ?? event.type,
    room: titleField(event.title, 'Salle', 'Salles'),
  };
};

export function TodayWidget() {
  const { events, error, loading, selected } = usePersonalData();
  const styles = useStyles();
  const { colors } = useAppTheme();
  const nowMs = useNow();
  const today = todayKey();
  const nowMin = parisParts(new Date(nowMs)).minutes;

  const { todays, next } = useMemo(() => {
    if (!events) return { todays: [], next: undefined };
    const items = events.map(toItem).sort((a, b) => a.day.localeCompare(b.day) || a.start - b.start);
    // Skip all-day markers (holidays) in the list; they show as a note instead.
    const todays = items.filter((i) => i.day === today && i.end - i.start < 12 * 60);
    const upcoming = items.filter(
      (i) => i.event.type !== 'Annulation' && i.end - i.start < 12 * 60 && (i.day > today || (i.day === today && i.start > nowMin)),
    );
    return { todays, next: upcoming[0] };
  }, [events, today, nowMin]);

  if (loading) return <ActivityIndicator color={colors.textMuted} style={styles.pad} />;
  if (error) return <Text style={[styles.muted, styles.pad]}>{error}</Text>;

  const open = () => router.navigate('/perso');

  const caption = selected && <Text style={styles.caption} numberOfLines={1}>{selected.name}</Text>;

  if (todays.length === 0) {
    return (
      <Pressable onPress={open} accessibilityRole="button" style={styles.empty}>
        {caption}
        <Text style={styles.emptyTitle}>{t('today.noClass')}</Text>
        {next && (
          <Text style={styles.muted}>
            {t('today.next', { day: shortDayLabel(next.day), time: formatMinutes(next.start), subject: next.subject })}
          </Text>
        )}
      </Pressable>
    );
  }

  return (
    <View>
      {caption && <View style={styles.captionRow}>{caption}</View>}
      {todays.map((i, idx) => {
        const c = eventColors(colors, i.event.type);
        const cancelled = i.event.type === 'Annulation';
        const current = !cancelled && i.start <= nowMin && nowMin < i.end;
        const isNext = next?.event === i.event && !todays.some((t) => t.event.type !== 'Annulation' && t.start <= nowMin && nowMin < t.end);
        const done = !current && i.end <= nowMin;
        return (
          <Pressable
            key={idx}
            onPress={open}
            accessibilityRole="button"
            accessibilityLabel={`${t('common.timeRange', { start: formatMinutes(i.start), end: formatMinutes(i.end) })}, ${i.subject}${i.room ? `, ${i.room}` : ''}${current ? t('today.currentA11y') : ''}`}
            style={({ pressed }) => [styles.row, idx > 0 && styles.rowDivider, pressed && styles.pressed, done && styles.done]}
          >
            <View style={styles.time}>
              <Text style={styles.timeStart}>{formatMinutes(i.start)}</Text>
              <Text style={styles.timeEnd}>{formatMinutes(i.end)}</Text>
            </View>
            <View style={[styles.stripe, { backgroundColor: c.border }]} />
            <View style={styles.body}>
              <Text style={[styles.subject, cancelled && styles.cancelled]} numberOfLines={1}>
                {i.event.type ? `${i.event.type} · ` : ''}
                {i.subject}
              </Text>
              {!!i.room && (
                <Text style={styles.muted} numberOfLines={1}>
                  {i.room}
                </Text>
              )}
            </View>
            {current && (
              <View style={[styles.badge, { backgroundColor: colors.live }]}>
                <Text style={styles.badgeText}>{t('today.current', { min: i.end - nowMin })}</Text>
              </View>
            )}
            {isNext && (
              <View style={[styles.badge, { backgroundColor: colors.moved }]}>
                <Text style={styles.badgeText}>{t('today.in', { delay: formatDelay(i.start - nowMin) })}</Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const formatDelay = (min: number) =>
  min < 60 ? t('duration.min', { m: min }) : t('duration.hours', { h: Math.floor(min / 60), mm: String(min % 60).padStart(2, '0') });

const useStyles = makeStyles((c) => ({
  pad: { padding: 12 },
  caption: { fontSize: 12, fontWeight: '600', color: c.textMuted },
  captionRow: { paddingHorizontal: 12, paddingTop: 8 },
  empty: { padding: 12, gap: 4 },
  emptyTitle: { fontSize: 15, fontWeight: '600', color: c.text },
  muted: { fontSize: 12, color: c.textMuted },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12 },
  rowDivider: { borderTopWidth: 1, borderColor: c.gridLine },
  pressed: { backgroundColor: c.pressed },
  done: { opacity: 0.5 },
  time: { width: 42, alignItems: 'flex-end' },
  timeStart: { fontSize: 13, fontWeight: '700', color: c.text },
  timeEnd: { fontSize: 11, color: c.textMuted },
  stripe: { width: 3, alignSelf: 'stretch', borderRadius: 2 },
  body: { flex: 1, gap: 1 },
  subject: { fontSize: 14, fontWeight: '600', color: c.text },
  cancelled: { textDecorationLine: 'line-through', color: c.textMuted },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
}));
