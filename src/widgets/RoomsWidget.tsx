// "Salles favorites": whether each pinned room is free now and in 1 h 30, with
// the time its state changes. Rooms are pinned with the star on the "Salles"
// tab; tapping the widget opens it.
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { router, useIsFocused } from 'expo-router';
import { Icon } from '../components/Icon';
import type { RoomEvent } from '../lib/edt';
import { t } from '../lib/i18n';
import { usePinnedRooms, type PinnedRoom } from '../lib/pinnedRooms';
import { useSession } from '../lib/sessionContext';
import { makeStyles, useAppTheme } from '../lib/theme';
import { formatMinutes, parisParts } from '../lib/time';
import { useNow } from '../lib/useLive';
import { useRoomEvents, type RoomEventsState } from '../lib/useRoomEvents';

/** How far ahead the second column looks. */
const LATER_MS = 90 * 60_000;

const hhmm = (ms: number) => formatMinutes(parisParts(new Date(ms)).minutes);

type Slot = { busy: boolean; /** When the room's state changes, if the same day. */ until: number | null };

/** Busy / free at `at`, and until when (classes only; cancelled ones don't count). */
function slotAt(events: RoomEvent[], at: number): Slot {
  const spans = events
    .filter((e) => e.type !== 'Annulation')
    .map((e) => [Date.parse(e.start), Date.parse(e.end)] as const)
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);
  const day = parisParts(new Date(at)).day;
  const sameDay = (ms: number) => parisParts(new Date(ms)).day === day;

  const current = spans.find(([s, e]) => s <= at && at < e);
  if (current) {
    // Back-to-back classes: busy until the last one ends.
    let end = current[1];
    for (const [s, e] of spans) if (s <= end && e > end) end = e;
    return { busy: true, until: sameDay(end) ? end : null };
  }
  const next = spans.find(([s]) => s > at);
  return { busy: false, until: next && sameDay(next[0]) ? next[0] : null };
}

export function RoomsWidget() {
  const { token, expire } = useSession();
  const pinned = usePinnedRooms();
  const styles = useStyles();
  if (!token) return null;
  if (pinned.length === 0) {
    return (
      <Pressable onPress={() => router.navigate('/salles')} accessibilityRole="button" style={styles.empty}>
        <Text style={styles.emptyText}>{t('roomsWidget.empty')}</Text>
      </Pressable>
    );
  }
  return <PinnedRooms token={token} rooms={pinned} onUnauthorized={expire} />;
}

function PinnedRooms({ token, rooms, onUnauthorized }: { token: string; rooms: PinnedRoom[]; onUnauthorized: () => void }) {
  const styles = useStyles();
  const focused = useIsFocused();
  const now = useNow(30_000, focused);
  const codes = useMemo(() => rooms.map((r) => r.code), [rooms]);
  const { get } = useRoomEvents(token, codes, onUnauthorized);
  const later = now + LATER_MS;

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <View style={styles.nameCol} />
        <Text style={styles.colTitle}>{t('roomsWidget.now')}</Text>
        <Text style={styles.colTitle}>{t('roomsWidget.at', { time: hhmm(later) })}</Text>
      </View>
      {rooms.map((r, i) => (
        <RoomRow key={r.code} room={r} state={get(r.code)} now={now} later={later} divider={i > 0} />
      ))}
    </View>
  );
}

function RoomRow({
  room,
  state,
  now,
  later,
  divider,
}: {
  room: PinnedRoom;
  state: RoomEventsState;
  now: number;
  later: number;
  divider: boolean;
}) {
  const styles = useStyles();
  const { colors } = useAppTheme();
  const slots = Array.isArray(state) ? [slotAt(state, now), slotAt(state, later)] : null;
  const describe = (s: Slot) =>
    `${s.busy ? t('rooms.busy') : t('rooms.free')}${s.until ? `, ${t(s.busy ? 'roomsWidget.freeAt' : 'roomsWidget.busyAt', { time: hhmm(s.until) })}` : ''}`;

  return (
    <Pressable
      onPress={() => router.navigate('/salles')}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, divider && styles.divider, pressed && styles.pressed]}
      accessibilityLabel={
        slots
          ? `${room.name}: ${t('roomsWidget.now')} ${describe(slots[0])}; ${t('roomsWidget.at', { time: hhmm(later) })} ${describe(slots[1])}`
          : `${room.name}, ${state === 'error' ? t('rooms.loadError') : t('common.loading')}`
      }
    >
      <View style={[styles.nameCol, styles.nameRow]}>
        <Icon name="star-fill" size={12} color={colors.star} />
        <Text style={styles.name} numberOfLines={2}>
          {room.name}
        </Text>
      </View>
      {slots ? (
        slots.map((s, i) => <SlotCell key={i} slot={s} />)
      ) : state === 'error' ? (
        <Text style={[styles.muted, styles.span]}>{t('rooms.loadError')}</Text>
      ) : (
        <View style={styles.span}>
          <ActivityIndicator size="small" color={colors.textMuted} />
        </View>
      )}
    </Pressable>
  );
}

function SlotCell({ slot }: { slot: Slot }) {
  const styles = useStyles();
  return (
    <View style={styles.cell}>
      <View style={[styles.pill, slot.busy ? styles.busy : styles.free]}>
        <Text style={[styles.pillText, slot.busy ? styles.busyText : styles.freeText]}>
          {slot.busy ? t('roomsWidget.busy') : t('roomsWidget.free')}
        </Text>
      </View>
      {slot.until != null && (
        <Text style={styles.until} numberOfLines={1}>
          {t(slot.busy ? 'roomsWidget.untilFree' : 'roomsWidget.untilBusy', { time: hhmm(slot.until) })}
        </Text>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: { paddingHorizontal: 12, paddingVertical: 8 },
  empty: { padding: 12 },
  emptyText: { fontSize: 13, color: c.textMuted },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingBottom: 4 },
  colTitle: { flex: 1, fontSize: 11, fontWeight: '700', color: c.textMuted, letterSpacing: 0.3, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  divider: { borderTopWidth: 1, borderColor: c.border },
  pressed: { opacity: 0.6 },
  nameCol: { flex: 1.3 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 6 },
  name: { flexShrink: 1, fontSize: 14, fontWeight: '600', color: c.text },
  cell: { flex: 1, alignItems: 'center', gap: 2 },
  span: { flex: 2, alignItems: 'center' },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  free: { backgroundColor: c.free },
  busy: { backgroundColor: c.busy },
  pillText: { fontSize: 12, fontWeight: '700' },
  freeText: { color: c.freeText },
  busyText: { color: c.busyText },
  until: { fontSize: 11, color: c.textMuted, fontVariant: ['tabular-nums'] },
  muted: { fontSize: 12, color: c.textMuted, textAlign: 'center' },
}));
