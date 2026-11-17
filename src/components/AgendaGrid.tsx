// Vertical agenda: hours down the side, one column per day (1 on phones, a
// week on wide screens). Overlapping classes share their column side by side.
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { RoomEvent } from '../lib/edt';
import { clusterWidths, placeEvents, titleField, type PlacedEvent } from '../lib/events';
import { eventColors, makeStyles, useAppTheme } from '../lib/theme';
import { formatMinutes, parisParts, shortDayLabel, todayKey } from '../lib/time';
import { DAY_END, DAY_START } from './RoomTimeline';
import { t } from '../lib/i18n';

const HOUR_H = 56;
const GUTTER_W = 46;
const toY = (min: number) => ((min - DAY_START) / 60) * HOUR_H;
const GRID_H = toY(DAY_END);
const HOURS = Array.from({ length: (DAY_END - DAY_START) / 60 }, (_, i) => DAY_START + i * 60);

type Props = {
  days: string[];
  events: RoomEvent[];
  onSelect: (event: RoomEvent) => void;
  /** Change to scroll the current time back to the centre. */
  recenter: number;
};

function useNowMinutes() {
  const [now, setNow] = useState(() => parisParts(new Date()).minutes);
  useEffect(() => {
    const id = setInterval(() => setNow(parisParts(new Date()).minutes), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function AgendaGrid({ days, events, onSelect, recenter }: Props) {
  const styles = useStyles();
  const { colors } = useAppTheme();
  const now = useNowMinutes();
  const today = todayKey();
  const nowVisible = now >= DAY_START && now < DAY_END;
  const showHeader = days.length > 1;

  const columns = useMemo(
    () =>
      days.map((day) => {
        const { placed } = placeEvents(events, day, DAY_START, DAY_END);
        return { day, placed, widths: clusterWidths(placed) };
      }),
    [days, events],
  );

  // Centre the current time (or the first class of the day) when opened / on LIVE.
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const [viewportH, setViewportH] = useState(0);
  useEffect(() => {
    if (!viewportH) return;
    const focus = days.includes(today) && nowVisible ? now : (columns[0]?.placed[0]?.startMin ?? DAY_START);
    const y = Math.min(Math.max(0, toY(focus) - viewportH / 2), Math.max(0, GRID_H - viewportH));
    scrollRef.current?.scrollTo({ y, animated: recenter > 0 });
    // Only on open / LIVE / resize / changing day, not every minute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenter, viewportH, days.join()]);

  return (
    <View style={styles.flex}>
      {showHeader && (
        <View style={styles.headerRow}>
          <View style={{ width: GUTTER_W }} />
          {days.map((d) => (
            <View key={d} style={[styles.headerCell, d === today && styles.headerToday]}>
              <Text style={[styles.headerText, d === today && styles.headerTextToday]} numberOfLines={1}>
                {shortDayLabel(d)}
              </Text>
            </View>
          ))}
        </View>
      )}

      <ScrollView ref={scrollRef} style={styles.flex} onLayout={(e) => setViewportH(e.nativeEvent.layout.height)}>
        <View style={[styles.row, { height: GRID_H + 12 }]}>
          {/* Hour gutter */}
          <View style={{ width: GUTTER_W }}>
            {HOURS.map((h) => (
              <Text key={h} style={[styles.hourLabel, { top: toY(h) }]}>
                {formatMinutes(h)}
              </Text>
            ))}
          </View>

          {columns.map(({ day, placed, widths }) => (
            <View key={day} style={[styles.column, showHeader && styles.columnDivider]}>
              {HOURS.map((h) => (
                <View key={h} style={[styles.hourLine, { top: toY(h) }]} />
              ))}
              {HOURS.map((h) => (
                <View key={`h${h}`} style={[styles.halfLine, { top: toY(h + 30) }]} />
              ))}
              {placed.map((p, i) => (
                <EventBlock key={i} p={p} width={widths[i]} onPress={() => onSelect(p.event)} />
              ))}
              {day === today && nowVisible && (
                <View pointerEvents="none" style={[styles.nowLine, { top: toY(now), backgroundColor: colors.live }]}>
                  <View style={[styles.nowDot, { backgroundColor: colors.live }]} />
                </View>
              )}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function EventBlock({ p, width, onPress }: { p: PlacedEvent; width: number; onPress: () => void }) {
  const styles = useStyles();
  const { colors } = useAppTheme();
  const c = eventColors(colors, p.event.type);
  const cancelled = p.event.type === 'Annulation';
  const room = titleField(p.event.title, 'Salle', 'Salles');
  const height = toY(p.endMin) - toY(p.startMin);
  const compact = height < 44;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${p.label}, ${t('common.timeRange', { start: formatMinutes(p.startMin), end: formatMinutes(p.endMin) })}${room ? `, ${room}` : ''}`}
      style={({ pressed }) => [
        styles.block,
        {
          top: toY(p.startMin) + 1,
          height: height - 2,
          left: `${(p.lane / width) * 100}%`,
          width: `${100 / width}%`,
          backgroundColor: c.bg,
          borderLeftColor: c.border,
          opacity: pressed ? 0.75 : cancelled ? 0.7 : 1,
        },
      ]}
    >
      <Text
        style={[styles.blockTitle, { color: c.text }, cancelled && styles.cancelled]}
        numberOfLines={compact ? 1 : 2}
        maxFontSizeMultiplier={1.2}
      >
        {p.event.type ? `${p.event.type} · ` : ''}
        {p.label}
      </Text>
      {!compact && (
        <Text style={[styles.blockMeta, { color: c.text }]} numberOfLines={1} maxFontSizeMultiplier={1.2}>
          {formatMinutes(p.startMin)}–{formatMinutes(p.endMin)}
          {room ? ` · ${room}` : ''}
        </Text>
      )}
      {height >= 80 && !!p.sublabel && (
        <Text style={[styles.blockMeta, { color: c.text }]} numberOfLines={2} maxFontSizeMultiplier={1.2}>
          {p.sublabel}
        </Text>
      )}
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  flex: { flex: 1, backgroundColor: c.bg },
  row: { flexDirection: 'row', paddingRight: 8, marginTop: 6 },
  headerRow: {
    flexDirection: 'row',
    paddingRight: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
    backgroundColor: c.surfaceAlt,
  },
  headerCell: { flex: 1, paddingVertical: 6, alignItems: 'center' },
  headerToday: { borderBottomWidth: 2, borderColor: c.live },
  headerText: { fontSize: 12, fontWeight: '600', color: c.textSecondary },
  headerTextToday: { color: c.live },
  hourLabel: { position: 'absolute', right: 6, marginTop: -7, fontSize: 11, color: c.textMuted },
  column: { flex: 1, position: 'relative' },
  columnDivider: { borderLeftWidth: StyleSheet.hairlineWidth, borderColor: c.border },
  hourLine: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: c.hourLine },
  halfLine: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: c.gridLine },
  nowLine: { position: 'absolute', left: 0, right: 0, height: 2 },
  nowDot: { position: 'absolute', left: -4, top: -3, width: 8, height: 8, borderRadius: 4 },
  block: {
    position: 'absolute',
    borderRadius: 6,
    borderLeftWidth: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.bg,
  },
  blockTitle: { fontSize: 12, fontWeight: '700' },
  blockMeta: { fontSize: 11, opacity: 0.85, marginTop: 1 },
  cancelled: { textDecorationLine: 'line-through' },
}));
