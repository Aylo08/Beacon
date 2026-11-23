// "Bus": next departures of every line (bus and tram) from one stop, each with
// its destination. The stop is picked from the whole network (searchable), by
// "Locate me" (the nearest stop), or by the place button: the stop of the
// nearest place among home and the two campuses (the Centre-ville / Agroparc
// stops chosen in the settings); its icon shows which place is nearest. The
// next bus to each campus is pinned first. The position stays in memory.
// Realtime from the ORIZO GTFS-RT feed (polled every 30 s while visible), else
// the timetable.
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useIsFocused } from 'expo-router';
import * as Location from 'expo-location';
import { Icon } from '../components/Icon';
import { StopPicker, type PinnedStop } from '../components/StopPicker';
import {
  campusChangeStop,
  CAMPUS_STOPS,
  CENTRE_STOPS,
  nearestStop,
  nextDepartures,
  samePlace,
  stopDepartures,
  type Departure,
  type Timetable,
} from '../lib/bus';
import type { RealtimeFeed } from '../lib/gtfsRt';
import { setWidgetStop, useBusPrefs, type BusPrefs } from '../lib/busPrefs';
import { useDebug, withDebugLimited } from '../lib/debugOverride';
import { makeStyles, useAppTheme } from '../lib/theme';
import { formatMinutes, parisParts } from '../lib/time';
import { useRealtime, useTimetable } from '../lib/useBus';
import { useNow } from '../lib/useLive';
import { t } from '../lib/i18n';

/** Rows shown, pinned ones included. */
const ROWS = 4;

const sameDeparture = (a: Departure, b: Departure) => a.tripId === b.tripId && a.scheduled === b.scheduled;

type Pinned = { to: string; departure: Departure };

/** Departures from `from`: the next one to each of `targets` pinned first, then the others, ROWS in all. */
function stopList(tt: Timetable, rt: RealtimeFeed | null, from: string, targets: string[], now: number) {
  const pinned: Pinned[] = [];
  for (const to of targets) {
    const d = nextDepartures(tt, rt, from, to, now, 1)[0];
    if (d) pinned.push({ to, departure: d });
  }
  const others = stopDepartures(tt, rt, from, now, ROWS + pinned.length)
    .filter((d) => !pinned.some((p) => sameDeparture(p.departure, d)))
    .slice(0, Math.max(0, ROWS - pinned.length));
  return { pinned, others };
}

/** Current position: a recent fix if there is one (fast), else a fresh one. Stops are a few hundred metres apart. */
async function currentPosition(): Promise<[number, number]> {
  const pos =
    (await Location.getLastKnownPositionAsync({ maxAge: 60_000, requiredAccuracy: 100 })) ??
    (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }));
  return [pos.coords.latitude, pos.coords.longitude];
}

type Place = { kind: 'home' | 'campus'; /** Stop to select. */ stop: string; /** Stops locating the place. */ near: readonly string[] };

/** Home (if set), Centre-ville and Agroparc, each with the stop the user chose for it. */
const places = ({ homeStop, centreStop, campusStop }: BusPrefs): Place[] => [
  ...(homeStop ? [{ kind: 'home' as const, stop: homeStop, near: [homeStop] }] : []),
  { kind: 'campus', stop: centreStop, near: CENTRE_STOPS },
  { kind: 'campus', stop: campusStop, near: CAMPUS_STOPS },
];

/** The place nearest to `here` (distance to the nearest of its stops), or null. */
function nearestPlace(tt: Timetable, list: Place[], here: [number, number]): Place | null {
  let best: { place: Place; distance: number } | null = null;
  for (const place of list) {
    const d = nearestStop(tt, [...place.near], here);
    if (d && (!best || d.distance < best.distance)) best = { place, distance: d.distance };
  }
  return best?.place ?? null;
}

/** Last known position if location is already allowed (no prompt, no GPS fix), for the place button's icon. */
function useKnownPosition(active: boolean) {
  const [here, setHere] = useState<[number, number] | null>(null);
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    (async () => {
      if (!(await Location.getForegroundPermissionsAsync()).granted) return;
      const pos = await Location.getLastKnownPositionAsync({ maxAge: 10 * 60_000, requiredAccuracy: 500 });
      if (pos && !cancelled) setHere([pos.coords.latitude, pos.coords.longitude]);
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [active]);
  return [here, setHere] as const;
}

export function BusWidget() {
  const focused = useIsFocused();
  const styles = useStyles();
  const { colors } = useAppTheme();
  const prefs = useBusPrefs();
  const { homeStop, centreStop, campusStop, widgetStop } = prefs;
  const { timetable, error } = useTimetable(focused);
  const rt = useRealtime(focused);
  const now = useNow(15_000, focused);
  const { limitedBuses } = useDebug();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [locating, setLocating] = useState<'stop' | 'place' | null>(null);
  const [locateError, setLocateError] = useState<string | null>(null);

  const [here, setHere] = useKnownPosition(focused);

  const stop = widgetStop ?? campusStop;
  // From Centre-ville, the bus to Agroparc is a campus change (Agrosciences → Grand Avignon, see campusChangeStop).
  const agroparcTarget = samePlace(stop, centreStop) ? campusChangeStop(campusStop) : campusStop;
  const list = useMemo(
    () => timetable && stopList(timetable, rt, stop, [centreStop, agroparcTarget].filter((x) => !samePlace(x, stop)), now),
    [timetable, rt, stop, centreStop, agroparcTarget, now],
  );
  const placeList = places(prefs);
  // Icon of the place button: the nearest place once a position is known, else a campus.
  const guessed = timetable && here ? nearestPlace(timetable, placeList, here) : null;
  const placeIcon = guessed?.kind === 'home' ? 'home-5-line' : 'graduation-cap-line';
  // Home first, then every campus stop (each on its own row).
  const pinnedStops: PinnedStop[] = [
    ...(homeStop ? [{ name: homeStop, icon: 'home-5-line' as const, a11y: t('bus.homeStopA11y', { stop: homeStop }) }] : []),
    ...[...CENTRE_STOPS, ...CAMPUS_STOPS].map((name) => ({ name, icon: 'graduation-cap-line' as const, a11y: t('bus.campusStopA11y', { stop: name }) })),
  ];

  /** `stop`: the nearest stop of the network. `place`: the stop of the nearest place (home / campuses). */
  const locate = async (kind: 'stop' | 'place') => {
    if (!timetable || locating) return;
    setLocating(kind);
    setLocateError(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setLocateError(t('bus.locateDenied'));
        return;
      }
      const pos = await currentPosition();
      setHere(pos);
      const name =
        kind === 'stop' ? nearestStop(timetable, Object.keys(timetable.stopCoords), pos)?.name : nearestPlace(timetable, placeList, pos)?.stop;
      if (name) setWidgetStop(name);
      else setLocateError(t('bus.locateFailed'));
    } catch {
      setLocateError(t('bus.locateFailed'));
    } finally {
      setLocating(null);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.toolbar}>
        <Pressable
          onPress={() => setPickerOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={t('bus.stopA11y', { stop })}
          style={({ pressed }) => [styles.stopButton, pressed && styles.pressed]}
        >
          <Icon name="map-pin-2-line" size={16} color={colors.textSecondary} />
          <Text style={styles.stopText} numberOfLines={1}>
            {stop}
          </Text>
          <Icon name="arrow-down-s-line" size={18} color={colors.textMuted} />
        </Pressable>
        <ToolButton
          icon={placeIcon}
          label={t('bus.nearestPlace')}
          busy={locating === 'place'}
          disabled={!timetable || !!locating}
          onPress={() => locate('place')}
        />
        <ToolButton
          icon="focus-3-line"
          label={t('bus.locate')}
          busy={locating === 'stop'}
          disabled={!timetable || !!locating}
          onPress={() => locate('stop')}
        />
      </View>
      {locateError && <Text style={styles.error}>{locateError}</Text>}

      {!list ? (
        error ? (
          <Text style={[styles.muted, styles.pad]}>{t('bus.unavailable', { error })}</Text>
        ) : (
          <ActivityIndicator color={colors.textMuted} style={styles.pad} />
        )
      ) : (
        <>
          <Departures list={list} limited={limitedBuses} now={now} lineColors={timetable!.lineColors} />
          <Text style={[styles.muted, styles.footer]}>{rt ? t('bus.footerLive') : t('bus.footerScheduled')}</Text>
        </>
      )}

      <StopPicker
        visible={pickerOpen}
        title={t('bus.chooseStop')}
        value={stop}
        timetable={timetable}
        error={error}
        pinned={pinnedStops}
        onSelect={(name) => {
          if (name) setWidgetStop(name);
          setLocateError(null);
          setPickerOpen(false);
        }}
        onClose={() => setPickerOpen(false)}
      />
    </View>
  );
}

function ToolButton({
  icon,
  label,
  busy,
  disabled,
  onPress,
}: {
  icon: 'home-5-line' | 'graduation-cap-line' | 'focus-3-line';
  label: string;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const styles = useStyles();
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy, disabled }}
      style={({ pressed }) => [styles.locateButton, (pressed || (disabled && !busy)) && styles.pressed]}
    >
      {busy ? <ActivityIndicator size="small" color={colors.primary} /> : <Icon name={icon} size={20} color={colors.primary} />}
    </Pressable>
  );
}

function Departures({
  list,
  limited,
  now,
  lineColors,
}: {
  list: { pinned: Pinned[]; others: Departure[] };
  /** Debug: mark departures as limited-stop. */
  limited: boolean;
  now: number;
  lineColors: Timetable['lineColors'];
}) {
  const styles = useStyles();
  const n = list.pinned.length;
  const all = withDebugLimited([...list.pinned.map((p) => p.departure), ...list.others], limited);
  return (
    <View style={styles.section}>
      {all.length === 0 && <Text style={styles.muted}>{t('bus.none24h')}</Text>}
      {list.pinned.map((p, i) => (
        <View key={p.to} style={styles.pinned}>
          <Text style={styles.pinnedLabel} numberOfLines={1}>
            {t('bus.pinnedTo', { stop: p.to })}
          </Text>
          <DepartureRow d={all[i]} now={now} lineColors={lineColors} />
        </View>
      ))}
      {all.slice(n).map((d) => (
        <DepartureRow key={`${d.tripId}-${d.scheduled}`} d={d} now={now} lineColors={lineColors} />
      ))}
    </View>
  );
}

const hhmm = (ms: number) => formatMinutes(parisParts(new Date(ms)).minutes);

function DepartureRow({ d, now, lineColors }: { d: Departure; now: number; lineColors: Timetable['lineColors'] }) {
  const styles = useStyles();
  const { colors } = useAppTheme();
  const color = lineColors[d.line] ?? { bg: colors.primary, text: '#fff' };
  // Limited-stop trips ("DIRECT") get a bolt next to the line number, in the badge (the row's label spells it out).
  const mins = Math.max(0, Math.round((d.expected - now) / 60_000));
  const delay = Math.round((d.expected - d.scheduled) / 60_000);
  const wait = mins === 0 ? t('bus.now') : mins < 60 ? t('duration.min', { m: mins }) : hhmm(d.expected);

  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={t('bus.a11y', {
        line: `${d.line} → ${d.headsign}`,
        time: hhmm(d.expected),
        status: `${d.canceled ? t('bus.a11yCanceled') : t('bus.a11yIn', { wait })}${d.limited ? t('bus.limitedA11y') : ''}`,
        arrival: hhmm(d.arrival),
      })}
    >
      <View style={[styles.badge, { backgroundColor: color.bg }]}>
        <Text style={[styles.badgeText, { color: color.text }]}>{d.line}</Text>
        {d.limited && <Icon name="flashlight-fill" size={12} color={color.text} />}
      </View>
      <View style={styles.times}>
        <Text style={[styles.headsign, d.canceled && styles.canceled]} numberOfLines={1}>
          {d.headsign}
        </Text>
        <Text style={[styles.muted, d.canceled && styles.canceled]}>
          {hhmm(d.expected)}
          {delay !== 0 && !d.canceled && <Text style={styles.scheduled}> {hhmm(d.scheduled)}</Text>}
        </Text>
      </View>
      <View style={styles.right}>
        {d.canceled ? (
          <Text style={[styles.wait, { color: colors.danger }]}>{t('bus.canceled')}</Text>
        ) : (
          <Text style={styles.wait}>{wait}</Text>
        )}
        {!d.canceled && (
          <View style={styles.status}>
            {d.realtime && <View style={[styles.dot, { backgroundColor: delay > 1 ? '#f59e0b' : '#22c55e' }]} />}
            <Text style={styles.muted}>
              {!d.realtime ? t('bus.scheduled') : delay > 0 ? `+${delay} min` : delay < 0 ? `${delay} min` : t('bus.onTime')}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

/** Height of the toolbar (stop selector and location buttons). */
const TOOL_SIZE = 38;

const useStyles = makeStyles((c) => ({
  wrap: { padding: 12, gap: 12 },
  pad: { paddingVertical: 8 },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stopButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: TOOL_SIZE, // same as the location buttons next to it
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: c.surfaceAlt,
  },
  stopText: { flex: 1, fontSize: 14, fontWeight: '600', color: c.text },
  locateButton: { width: TOOL_SIZE, height: TOOL_SIZE, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: c.surfaceAlt },
  pressed: { opacity: 0.6 },
  error: { fontSize: 12, color: c.danger },
  section: { gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  badge: {
    minWidth: 34,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  badgeText: { fontSize: 13, fontWeight: '800' },
  times: { flex: 1 },
  pinned: { gap: 4, padding: 8, marginHorizontal: -8, borderRadius: 10, backgroundColor: c.surfaceAlt },
  pinnedLabel: { fontSize: 11, fontWeight: '700', color: c.primary, letterSpacing: 0.3 },
  headsign: { fontSize: 15, fontWeight: '600', color: c.text },
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
