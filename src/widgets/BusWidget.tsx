// "Bus": from one stop — any ORIZO stop, or any ZOU! stop around Avignon
// (Châteaurenard, Saint-Rémy…: lib/stopCatalog) — the next trips to the chosen
// campus (Sainte-Marthe or Agroparc, ZOU! and ORIZO with their transfers:
// lib/journey), then the next departures of every line there with their
// destination. The stop is picked from the whole catalog (searchable), by
// "Locate me" (the nearest stop), or by the place button: the stop of the
// nearest place among home and the two campuses (the Centre-ville / Agroparc
// stops chosen in the settings); its icon shows which place is nearest. The
// position stays in memory. ORIZO departures use the GTFS-RT feed (polled every
// 30 s while visible); ZOU! departures and the campus trips are scheduled times.
// The ZOU! timetable (≈ 15 MB the first time) is only loaded when needed: a ZOU!
// stop is selected, the stop list is open, or it is already on the device.
import { Fragment, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { router, useIsFocused } from 'expo-router';
import * as Location from 'expo-location';
import { Segmented } from '../components/Buttons';
import { Icon } from '../components/Icon';
import { LineBadge } from '../components/LineBadge';
import { StopPicker, type PinnedStop } from '../components/StopPicker';
import { CAMPUS_STOPS, CENTRE_STOPS, distanceM, nearestStop, stopDepartures, type Departure, type Timetable } from '../lib/bus';
import { setDestination, setWidgetStop, useBusPrefs, type BusPrefs } from '../lib/busPrefs';
import { CAMPUSES, campusById } from '../lib/campuses';
import { useDebug, withDebugLimited } from '../lib/debugOverride';
import { t, tn } from '../lib/i18n';
import { planFromStop, type Journey, type RideLeg } from '../lib/journey';
import { isZouStopKey, stopCatalog, stopLabel, type CatalogStop } from '../lib/stopCatalog';
import { makeStyles, useAppTheme } from '../lib/theme';
import { formatDuration, formatTime } from '../lib/time';
import { openTrip } from '../lib/tripStore';
import { useRealtime, useTimetable, useZouTimetable } from '../lib/useBus';
import { useNow } from '../lib/useLive';
import { zouCached, zouDepartures } from '../lib/zou';

/** Trips to the campus shown, then departures: ROWS in all. */
const TRIPS = 2;
const ROWS = 5;

const hhmm = formatTime;

/** "Maintenant", "12 min", or the time when an hour or more away. */
function waitLabel(at: number, now: number) {
  const mins = Math.max(0, Math.round((at - now) / 60_000));
  return mins === 0 ? t('bus.now') : mins < 60 ? t('duration.min', { m: mins }) : hhmm(at);
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

/** The catalog stop nearest to `here`. */
function nearestCatalogStop(catalog: CatalogStop[], here: [number, number]): CatalogStop | null {
  let best: { stop: CatalogStop; distance: number } | null = null;
  for (const stop of catalog) {
    const distance = distanceM(here, [stop.lat, stop.lon]);
    if (!best || distance < best.distance) best = { stop, distance };
  }
  return best?.stop ?? null;
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

const firstRide = (j: Journey) => j.legs.find((l): l is RideLeg => l.kind === 'ride') ?? null;

export function BusWidget() {
  const focused = useIsFocused();
  const styles = useStyles();
  const { colors } = useAppTheme();
  const prefs = useBusPrefs();
  const { homeStop, campusStop, widgetStop, destination } = prefs;
  const { timetable, error } = useTimetable(focused);
  const rt = useRealtime(focused);
  const now = useNow(15_000, focused);
  const { limitedBuses } = useDebug();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [locating, setLocating] = useState<'stop' | 'place' | null>(null);
  const [locateError, setLocateError] = useState<string | null>(null);
  const [here, setHere] = useKnownPosition(focused);
  // Read once: a ZOU! timetable already on the device is cheap to load.
  const [zouOnDevice] = useState(zouCached);

  const stopKey = widgetStop ?? campusStop;
  const zouStop = isZouStopKey(stopKey);
  const needZou = zouStop || pickerOpen || zouOnDevice;
  const { timetable: zou, error: zouError } = useZouTimetable(focused && needZou);
  // Waiting for ZOU! (needed, still loading): don't show ORIZO-only trips that would then change.
  const zouPending = needZou && !zou && !zouError;

  const catalog = useMemo(() => (timetable || zou ? stopCatalog(timetable, zou) : null), [timetable, zou]);
  const stop = useMemo(() => catalog?.find((s) => s.key === stopKey) ?? null, [catalog, stopKey]);
  const label = stop ?? stopLabel(stopKey);
  const campus = campusById(destination) ?? CAMPUSES[0];

  // Trips to the campus: recomputed every minute (scheduled times).
  const minute = Math.floor(now / 60_000);
  const trips = useMemo(
    () => (stop && !zouPending ? planFromStop(timetable, zou, stop, campus, minute * 60_000, TRIPS) : null),
    [timetable, zou, stop, campus, minute, zouPending],
  );

  // Departures of every line there, minus the first vehicle of the trips above.
  const departures = useMemo(() => {
    if (!stop) return null;
    const orizoDeps = timetable && stop.orizo ? stopDepartures(timetable, rt, stop.orizo, now, ROWS) : [];
    const zouDeps = zou && stop.zou.length ? zouDepartures(zou, stop.zou, now, ROWS) : [];
    const shown = (trips ?? []).map(firstRide).filter((r): r is RideLeg => r !== null);
    return [...orizoDeps, ...zouDeps]
      .filter((d) => !shown.some((r) => r.line === d.line && (r.network === 'zou') === (d.network === 'zou') && Math.abs(r.start - d.scheduled) < 60_000))
      .sort((a, b) => a.expected - b.expected)
      .slice(0, Math.max(1, ROWS - (trips?.length ?? 0)));
  }, [timetable, zou, rt, stop, now, trips]);

  const placeList = places(prefs);
  // Icon of the place button: the nearest place once a position is known, else a campus.
  const guessed = timetable && here ? nearestPlace(timetable, placeList, here) : null;
  const placeIcon = guessed?.kind === 'home' ? 'home-5-line' : 'graduation-cap-line';
  // Home first, then every campus stop (each on its own row).
  const pinnedStops: PinnedStop[] = [
    ...(homeStop ? [{ name: homeStop, icon: 'home-5-line' as const, a11y: t('bus.homeStopA11y', { stop: homeStop }) }] : []),
    ...[...CENTRE_STOPS, ...CAMPUS_STOPS].map((name) => ({ name, icon: 'graduation-cap-line' as const, a11y: t('bus.campusStopA11y', { stop: name }) })),
  ];

  /** `stop`: the nearest stop of the catalog. `place`: the stop of the nearest place (home / campuses). */
  const locate = async (kind: 'stop' | 'place') => {
    if (!timetable || !catalog || locating) return;
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
      const key = kind === 'stop' ? nearestCatalogStop(catalog, pos)?.key : nearestPlace(timetable, placeList, pos)?.stop;
      if (key) setWidgetStop(key);
      else setLocateError(t('bus.locateFailed'));
    } catch {
      setLocateError(t('bus.locateFailed'));
    } finally {
      setLocating(null);
    }
  };

  const loadError = error && !timetable && !zou ? error : zouStop && zouError && !zou ? zouError : null;

  return (
    <View style={styles.wrap}>
      <View style={styles.toolbar}>
        <Pressable
          onPress={() => setPickerOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={t('bus.stopA11y', { stop: label.town ? `${label.name}, ${label.town}` : label.name })}
          style={({ pressed }) => [styles.stopButton, pressed && styles.pressed]}
        >
          <Icon name="map-pin-2-line" size={16} color={colors.textSecondary} />
          <Text style={styles.stopText} numberOfLines={1}>
            {label.name}
            {!!label.town && <Text style={styles.stopTown}> · {label.town}</Text>}
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

      <Segmented
        label={t('bus.destination')}
        options={CAMPUSES.map((c) => ({ value: c.id, label: c.name }))}
        value={campus.id}
        onChange={setDestination}
      />

      {loadError ? (
        <Text style={[styles.muted, styles.pad]}>{t('bus.unavailable', { error: loadError })}</Text>
      ) : !stop || !departures ? (
        catalog && !zouPending ? (
          // Saved stop no longer in the timetables.
          <Text style={[styles.muted, styles.pad]}>{t('bus.noStop')}</Text>
        ) : (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.textMuted} />
            {zouPending && !zouOnDevice && <Text style={[styles.muted, styles.flex]}>{t('bus.trip.loadingZou')}</Text>}
          </View>
        )
      ) : (
        <>
          <View style={styles.pinned}>
            <Text style={styles.pinnedLabel} numberOfLines={1}>
              {t('bus.trip.title', { campus: campus.name })}
            </Text>
            {!trips ? (
              <View style={styles.loading}>
                <ActivityIndicator size="small" color={colors.textMuted} />
                {!zouOnDevice && <Text style={styles.muted}>{t('bus.trip.loadingZou')}</Text>}
              </View>
            ) : trips.length === 0 ? (
              <Text style={styles.muted}>{t('bus.trip.none', { campus: campus.name })}</Text>
            ) : (
              trips.map((j) => (
                <TripRow
                  key={`${j.departure}-${j.arrival}`}
                  journey={j}
                  now={now}
                  from={label.town ? `${label.name} · ${label.town}` : label.name}
                  to={campus.name}
                />
              ))
            )}
            {zouError && !zouStop && needZou && <Text style={styles.muted}>{t('bus.trip.zouError', { error: zouError })}</Text>}
          </View>
          <Departures list={withDebugLimited(departures, limitedBuses)} now={now} lineColors={timetable?.lineColors ?? {}} />
          <Text style={[styles.muted, styles.footer]}>
            {rt ? t('bus.footerLive') : t('bus.footerScheduled')}
            {'\n'}
            {t('bus.trip.footer')}
          </Text>
        </>
      )}

      <StopPicker
        visible={pickerOpen}
        title={t('bus.chooseStop')}
        value={stopKey}
        stops={catalog}
        error={error}
        note={zouPending ? t('bus.zouLoading') : null}
        pinned={pinnedStops}
        onSelect={(key) => {
          if (key) setWidgetStop(key);
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

/** One trip to the campus: times, duration, lines and changes; pressing it opens the full trip. */
function TripRow({ journey, now, from, to }: { journey: Journey; now: number; from: string; to: string }) {
  const styles = useStyles();
  const { colors } = useAppTheme();
  // Consecutive rides on the same line (a line split into two trips, e.g. 04 at Montfavet) show as one.
  const rides = journey.legs
    .filter((l): l is RideLeg => l.kind === 'ride')
    .filter((r, i, all) => i === 0 || r.network !== all[i - 1].network || r.line !== all[i - 1].line);
  const duration = formatDuration(journey.arrival - journey.departure);
  const changes =
    rides.length === 0
      ? t('bus.trip.walk')
      : rides.length === 1
        ? t('bus.trip.direct')
        : rides.length === 2
          ? t('bus.trip.transferAt', { transfers: tn('bus.trip.transfers', 1), stop: rides[1].from.name })
          : tn('bus.trip.transfers', rides.length - 1);
  const lines = rides.map((r) => (r.network === 'zou' ? `ZOU! ${r.line}` : r.line)).join(', ');
  return (
    <Pressable
      onPress={() => {
        openTrip({ journey, from, to });
        router.push('/trip');
      }}
      style={({ pressed }) => [styles.trip, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityHint={t('bus.trip.open')}
      accessibilityLabel={t('bus.trip.a11y', {
        departure: hhmm(journey.departure),
        arrival: hhmm(journey.arrival),
        duration,
        lines: lines || t('bus.trip.walk'),
        transfers: changes,
      })}
    >
      <View style={styles.tripTop}>
        <Text style={styles.tripTimes}>
          {hhmm(journey.departure)} → {hhmm(journey.arrival)}
          <Text style={styles.tripDuration}> · {duration}</Text>
        </Text>
        <Text style={styles.wait}>{rides.length ? waitLabel(journey.departure, now) : ''}</Text>
      </View>
      <View style={styles.tripLines}>
        {rides.length === 0 ? (
          <Icon name="walk-line" size={16} color={colors.textSecondary} />
        ) : (
          rides.map((r, i) => (
            <Fragment key={i}>
              {i > 0 && <Icon name="arrow-right-s-line" size={14} color={colors.textFaint} />}
              <LineBadge line={r.line} color={r.color} zou={r.network === 'zou'} train={r.mode === 'train'} />
            </Fragment>
          ))
        )}
        <Text style={[styles.muted, styles.flex]} numberOfLines={1}>
          {changes}
        </Text>
        <Icon name="arrow-right-s-line" size={18} color={colors.textMuted} />
      </View>
    </Pressable>
  );
}

function Departures({ list, now, lineColors }: { list: Departure[]; now: number; lineColors: Timetable['lineColors'] }) {
  const styles = useStyles();
  return (
    <View style={styles.section}>
      {list.length === 0 && <Text style={styles.muted}>{t('bus.none24h')}</Text>}
      {list.map((d) => (
        <DepartureRow key={`${d.tripId}-${d.scheduled}`} d={d} now={now} lineColors={lineColors} />
      ))}
    </View>
  );
}

function DepartureRow({ d, now, lineColors }: { d: Departure; now: number; lineColors: Timetable['lineColors'] }) {
  const styles = useStyles();
  const { colors } = useAppTheme();
  const color = d.color ?? lineColors[d.line] ?? { bg: colors.primary, text: '#fff' };
  const delay = Math.round((d.expected - d.scheduled) / 60_000);
  const wait = waitLabel(d.expected, now);
  const zou = d.network === 'zou';

  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={t('bus.a11y', {
        line: `${zou ? 'ZOU! ' : ''}${d.line} → ${d.headsign}`,
        time: hhmm(d.expected),
        status: `${d.canceled ? t('bus.a11yCanceled') : t('bus.a11yIn', { wait })}${d.limited ? t('bus.limitedA11y') : ''}`,
        arrival: hhmm(d.arrival),
      })}
    >
      <LineBadge line={d.line} color={color} zou={zou} limited={d.limited} />
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
  flex: { flex: 1 },
  pad: { paddingVertical: 8 },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
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
  stopTown: { fontSize: 13, fontWeight: '400', color: c.textMuted },
  locateButton: { width: TOOL_SIZE, height: TOOL_SIZE, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: c.surfaceAlt },
  pressed: { opacity: 0.6 },
  error: { fontSize: 12, color: c.danger },
  section: { gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  times: { flex: 1 },
  pinned: { gap: 6, padding: 8, marginHorizontal: -8, borderRadius: 10, backgroundColor: c.surfaceAlt },
  pinnedLabel: { fontSize: 11, fontWeight: '700', color: c.primary, letterSpacing: 0.3 },
  trip: { gap: 4 },
  tripTop: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  tripTimes: { flex: 1, fontSize: 15, fontWeight: '700', color: c.text, fontVariant: ['tabular-nums'] },
  tripDuration: { fontSize: 13, fontWeight: '400', color: c.textMuted },
  tripLines: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headsign: { fontSize: 15, fontWeight: '600', color: c.text },
  scheduled: { fontSize: 12, fontWeight: '400', color: c.textFaint, textDecorationLine: 'line-through' },
  canceled: { textDecorationLine: 'line-through', color: c.textMuted },
  right: { alignItems: 'flex-end' },
  wait: { fontSize: 15, fontWeight: '700', color: c.text, fontVariant: ['tabular-nums'] },
  status: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  muted: { fontSize: 12, color: c.textMuted },
  footer: { fontSize: 11 },
}));
