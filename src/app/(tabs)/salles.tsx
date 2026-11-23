// "Salles": room availability timeline (one row per room, 30-minute columns).
// Pinned (starred) rooms come first in their campus.
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Icon } from '../../components/Icon';
import { OptionSheet } from '../../components/OptionSheet';
import { RoomTimeline } from '../../components/RoomTimeline';
import { DateBar } from '../../components/DateBar';
import { edt, UnauthorizedError, type Campus } from '../../lib/edt';
import { normalizeSearch } from '../../lib/events';
import { pinnedFirst, togglePinnedRoom, usePinnedRooms } from '../../lib/pinnedRooms';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSession } from '../../lib/sessionContext';
import { makeStyles, useAppTheme } from '../../lib/theme';
import { dayLabel, shortDayLabel, todayKey } from '../../lib/time';
import { useRoomEvents } from '../../lib/useRoomEvents';
import { t, tn } from '../../lib/i18n';

const ALL = '__all__';
const DEFAULT_CAMPUS = 'CERI';
const WIDE_BREAKPOINT = 768;
/** Rooms loaded before the timeline reports what's on screen (about a tablet screenful). */
const INITIAL_REACH = 30;
/** The loaded range grows in steps, so scrolling doesn't restart the loader on every row. */
const REACH_STEP = 20;

export default function RoomsScreen() {
  // The tabs layout only renders this screen when logged in.
  const { token, expire } = useSession();
  return token ? <RoomsView token={token} onExpired={expire} /> : null;
}

function RoomsView({ token, onExpired }: { token: string; onExpired: () => void }) {
  const [campuses, setCampuses] = useState<Campus[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [campus, setCampus] = useState<string>(DEFAULT_CAMPUS);
  const [query, setQuery] = useState('');
  const [day, setDay] = useState(todayKey);
  // Time cursor in minutes since midnight; null = follow the current time.
  const [cursor, setCursor] = useState<number | null>(null);
  // Bumped to ask the timeline to scroll the cursor back into the centre.
  const [recenter, setRecenter] = useState(0);
  const [campusOpen, setCampusOpen] = useState(false);

  const { width } = useWindowDimensions();
  const wide = width >= WIDE_BREAKPOINT;
  const styles = useStyles();
  const { colors, scheme } = useAppTheme();
  const insets = useSafeAreaInsets();

  // Renews the token in the background (or logs out if that fails).
  const onUnauthorized = useCallback(() => onExpired(), [onExpired]);

  useEffect(() => {
    edt
      .getSalles(token)
      .then((list) => {
        setCampuses(list);
        if (!list.some((c) => c.letter === DEFAULT_CAMPUS)) setCampus(ALL);
      })
      .catch(async (e) => {
        if (e instanceof UnauthorizedError && !(await edt.isTokenValid(token))) onUnauthorized();
        else setError(String(e));
      });
  }, [token, onUnauthorized]);

  const pinned = usePinnedRooms();
  const pinnedCodes = useMemo(() => new Set(pinned.map((p) => p.code)), [pinned]);
  const rooms = useMemo(() => {
    if (!campuses) return [];
    const q = normalizeSearch(query);
    return campuses
      .filter((c) => campus === ALL || c.letter === campus)
      .flatMap((c) => pinnedFirst(c.names, pinned))
      .filter((r) => !q || normalizeSearch(r.searchString).includes(q));
  }, [campuses, campus, query, pinned]);

  // Only the rooms on screen (and a few below) are loaded: each one is a request to the
  // university's API, and "All campuses" lists every room of the university.
  const [reach, setReach] = useState(INITIAL_REACH);
  const onReach = useCallback(
    (rows: number) => setReach((r) => Math.max(r, Math.ceil(rows / REACH_STEP) * REACH_STEP)),
    [],
  );
  const codes = useMemo(() => rooms.slice(0, reach).map((r) => r.code), [rooms, reach]);
  const { get, version, refresh } = useRoomEvents(token, codes, onUnauthorized);
  const loaded = codes.filter((c) => get(c) !== undefined).length;

  // LIVE = cursor follows the current time on today's timetable.
  const isLive = cursor === null && day === todayKey();
  const goLive = () => {
    setCursor(null);
    setDay(todayKey());
    setRecenter((n) => n + 1);
  };

  const campusOptions = [
    { value: ALL, label: t('rooms.allCampuses'), detail: String(campuses?.reduce((n, c) => n + c.names.length, 0) ?? '') },
    ...(campuses ?? []).map((c) => ({ value: c.letter, label: c.letter, detail: String(c.names.length) })),
  ];
  const campusLabel = campus === ALL ? t('rooms.all') : campus;

  const filterBar = (
    <View style={[styles.filterBar, wide ? styles.filterBarTop : styles.filterBarBottom]}>
      <View style={styles.search}>
        <Icon name="search-line" size={18} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder={wide ? t('rooms.searchWide') : t('rooms.search')}
          placeholderTextColor={colors.textFaint}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          keyboardAppearance={scheme}
        />
        {!!query && (
          <Pressable
            onPress={() => setQuery('')}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={t('rooms.clearSearch')}
          >
            <Icon name="close-circle-fill" size={18} color={colors.textFaint} />
          </Pressable>
        )}
      </View>
      <Pressable
        onPress={() => setCampusOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={t('rooms.campusA11y', { campus: campusLabel })}
        style={styles.campusButton}
      >
        <Icon name="map-pin-2-line" size={16} color={colors.textSecondary} />
        <Text style={styles.campusText} numberOfLines={1}>
          {campusLabel}
        </Text>
        <Icon name="arrow-down-s-line" size={18} color={colors.textMuted} />
      </Pressable>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {wide && filterBar}

      <View style={styles.flex}>
        {error ? (
          <View style={styles.center}>
            <Text style={styles.error}>{error}</Text>
          </View>
        ) : !campuses ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.textMuted} />
          </View>
        ) : (
          <RoomTimeline
            rooms={rooms}
            day={day}
            getEvents={get}
            version={version}
            cursor={cursor}
            onCursorChange={setCursor}
            recenter={recenter}
            pinned={pinnedCodes}
            onTogglePin={togglePinnedRoom}
            onReach={onReach}
          />
        )}
      </View>

      {!wide && filterBar}

      <DateBar
        day={day}
        onDayChange={setDay}
        dateLabel={wide ? dayLabel(day) : shortDayLabel(day)}
        dateA11yLabel={dayLabel(day)}
        live={isLive}
        onLive={goLive}
        onRefresh={refresh}
      />

      {/* Status line, always at the bottom (the tab bar handles the safe area below it) */}
      <View style={styles.statusBar}>
        <Text style={styles.muted}>
          {tn('rooms.count', rooms.length)}
          {loaded < codes.length ? t('rooms.loadingCount', { loaded, total: codes.length }) : ''}
        </Text>
      </View>

      <OptionSheet
        visible={campusOpen}
        title={t('rooms.campus')}
        options={campusOptions}
        value={campus}
        onClose={() => setCampusOpen(false)}
        onSelect={(c) => {
          setCampus(c);
          setCampusOpen(false);
        }}
      />
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((c) => ({
  flex: { flex: 1, backgroundColor: c.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 16, backgroundColor: c.bg },

  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: c.bg,
  },
  filterBarTop: { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: c.border },
  filterBarBottom: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: c.border },
  search: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 8,
    paddingHorizontal: 10,
  },
  searchInput: { flex: 1, paddingVertical: 8, fontSize: 15, color: c.text },
  campusButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: 160,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 8,
  },
  campusText: { fontSize: 14, color: c.text, flexShrink: 1 },

  statusBar: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: c.surfaceAlt,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
  },
  muted: { color: c.textMuted, fontSize: 12 },
  error: { color: c.danger },
}));
