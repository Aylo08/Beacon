// "Bus": from one stop — any ORIZO stop, or any ZOU! coach / train stop around
// Avignon (Châteaurenard, Saint-Rémy…: lib/stopCatalog) — the next TRIPS trips to
// where you're going, then the next departures of every line there with their
// destination. Where you're going follows today's classes, like the now bar: the
// campus stop of the next class (the Centre-ville / Agroparc stops chosen in the
// settings), else, once classes are over, the home stop. The trips combine ORIZO
// and ZOU! with their transfers and walks (lib/journey, scheduled times); pressing
// one opens the full trip. The stop is picked from the whole catalog (searchable),
// by "Locate me" (the nearest stop), or by the place button: the stop of the
// nearest place among home and the two campuses; its icon shows which place is
// nearest. The position stays in memory. ORIZO departures use the GTFS-RT feed
// (polled every 30 s while visible), ZOU! ones the timetable. The ZOU! timetable
// (≈ 15 MB the first time) is only loaded when needed: a ZOU! stop is selected,
// the stop list is open, or it is already on the device.
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { router, useIsFocused } from 'expo-router';
import * as Location from 'expo-location';
import { Icon } from '../components/Icon';
import { LineBadge } from '../components/LineBadge';
import { StopPicker, type PinnedStop } from '../components/StopPicker';
import { TripSummary, waitLabel } from '../components/TripSummary';
import {
  campusChangeStop,
  CAMPUS_STOPS,
  CENTRE_STOPS,
  nearestStop,
  samePlace,
  stopDepartures,
  type Departure,
  type Timetable,
} from '../lib/bus';
import { setWidgetStop, useBusPrefs, type BusPrefs } from '../lib/busPrefs';
import { stopForCampus, toItems, useRoomCampuses } from '../lib/classPlaces';
import { useDebug, withDebugLimited } from '../lib/debugOverride';
import { distanceM } from '../lib/gtfs';
import { t } from '../lib/i18n';
import { planFromStop, type Journey, type RideLeg } from '../lib/journey';
import { isZouStopKey, stopCatalog, stopLabel, type CatalogStop } from '../lib/stopCatalog';
import { usePersonalData } from '../lib/personalData';
import { useSession } from '../lib/sessionContext';
import { makeStyles, useAppTheme } from '../lib/theme';
import { formatTime, parisParts } from '../lib/time';
import { openTrip } from '../lib/tripStore';
import { useRealtime, useTimetable, useZouTimetable } from '../lib/useBus';
import { useNow } from '../lib/useLive';
import { zouCached, zouDepartures } from '../lib/zou';

/** Trips shown, then departure rows. */
const TRIPS = 4;
const ROWS = 4;

const hhmm = formatTime;

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
  const { homeStop, centreStop, campusStop, widgetStop } = prefs;
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
  const from = label.town ? `${label.name} · ${label.town}` : label.name;

  // Where you're going: the campus of today's next class, else (classes over) home. Unknown
  // (no timetable, no home stop, campus not found…): Centre-ville, or Agroparc from there.
  const { events } = usePersonalData();
  const { token } = useSession();
  const today = parisParts(new Date(now)).day;
  const items = useMemo(() => toItems(events), [events]);
  const nextClass = items.find((i) => i.start > now && i.day === today);
  const campusOf = useRoomCampuses(token, [nextClass?.room]);
  // Signed out: the room's campus can't be looked up.
  const nextCampus = nextClass && token ? campusOf(nextClass.room) : null;
  const destination: { name: string; home: boolean } | null =
    nextCampus === undefined
      ? null // campus still loading
      : nextClass
        ? { name: stopForCampus(nextCampus, prefs) ?? centreStop, home: false }
        : homeStop
          ? { name: homeStop, home: true }
          : { name: samePlace(stopKey, centreStop) ? campusChangeStop(campusStop) : centreStop, home: false };
  // Already there (on the campus of the next class, at home): no trip, the departures only.
  const target = destination && !samePlace(destination.name, stopKey) ? destination : null;
  const targetPos = target ? timetable?.stopCoords[target.name] : undefined;

  // Recomputed every minute (scheduled times).
  const minute = Math.floor(now / 60_000);
  const trips = useMemo(
    () =>
      stop && targetPos && !zouPending
        ? planFromStop(timetable, zou, stop, { lat: targetPos[0], lon: targetPos[1] }, minute * 60_000, TRIPS)
        : null,
    [timetable, zou, stop, targetPos, minute, zouPending],
  );

  // Departures of every line there, minus the first vehicle of the trips above.
  const departures = useMemo(() => {
    if (!stop) return null;
    const orizoDeps = timetable && stop.orizo ? stopDepartures(timetable, rt, stop.orizo, now, ROWS + 2) : [];
    const zouDeps = zou && stop.zou.length ? zouDepartures(zou, stop.zou, now, ROWS + 2) : [];
    const shown = (trips ?? []).map(firstRide).filter((r): r is RideLeg => !!r);
    const list = [...orizoDeps, ...zouDeps]
      .filter((d) => !shown.some((r) => r.line === d.line && (r.network === 'zou') === (d.network === 'zou') && Math.abs(r.start - d.scheduled) < 60_000))
      .sort((a, b) => a.expected - b.expected)
      .slice(0, ROWS);
    return withDebugLimited(list, limitedBuses);
  }, [timetable, zou, rt, stop, now, trips, limitedBuses]);

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
        <View style={styles.section}>
          {target && (
            <View style={styles.pinned}>
              <View style={styles.pinnedHeader}>
                <Icon name={target.home ? 'home-5-line' : 'graduation-cap-line'} size={14} color={colors.primary} />
                <Text style={styles.pinnedLabel} numberOfLines={1}>
                  {t('bus.trip.title', { campus: target.name })}
                </Text>
              </View>
              {!trips ? (
                <View style={styles.loading}>
                  <ActivityIndicator size="small" color={colors.textMuted} />
                  {zouPending && !zouOnDevice && <Text style={styles.muted}>{t('bus.trip.loadingZou')}</Text>}
                </View>
              ) : trips.length === 0 ? (
                <Text style={styles.muted}>{t('bus.trip.none', { campus: target.name })}</Text>
              ) : (
                trips.map((journey, i) => (
                  <TripSummary
                    // Two trips can share their times (same departure, changing elsewhere).
                    key={`${i}-${journey.departure}-${journey.arrival}`}
                    journey={journey}
                    now={now}
                    hint={t('bus.trip.open')}
                    onPress={() => {
                      openTrip({ journey, from, to: target.name, home: target.home });
                      router.push('/trip');
                    }}
                  />
                ))
              )}
            </View>
          )}
          {zouError && !zouStop && needZou && <Text style={styles.muted}>{t('bus.trip.zouError', { error: zouError })}</Text>}
          {departures.length === 0 && <Text style={styles.muted}>{t('bus.none24h')}</Text>}
          {departures.map((d) => (
            <DepartureRow key={`${d.tripId}-${d.scheduled}`} d={d} now={now} lineColors={timetable?.lineColors ?? {}} />
          ))}
          <Text style={[styles.muted, styles.footer]}>
            {rt ? t('bus.footerLive') : t('bus.footerScheduled')}
            {'\n'}
            {t('bus.trip.footer')}
          </Text>
        </View>
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
      {/* Limited-stop trips ("DIRECT") get a bolt next to the line number (the row's label spells it out). */}
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
  pinned: { gap: 10, padding: 8, marginHorizontal: -8, borderRadius: 10, backgroundColor: c.surfaceAlt },
  pinnedHeader: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pinnedLabel: { flex: 1, fontSize: 11, fontWeight: '700', color: c.primary, letterSpacing: 0.3 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  times: { flex: 1 },
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
