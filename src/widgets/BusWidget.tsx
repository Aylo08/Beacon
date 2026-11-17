// "Bus": next departures of every line from one stop, each with its
// destination. The stop is picked from the whole network (searchable), or by
// "Locate me": the nearest of the home stop, St Lazare / Université and the
// Agroparc stop (chosen in the settings). The next bus to each of the two
// campuses (St Lazare / Université, the Agroparc stop) is pinned first.
// Realtime from the ORIZO GTFS-RT feed (polled every 30 s while visible), else
// the timetable.
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useIsFocused } from 'expo-router';
import * as Location from 'expo-location';
import { Icon } from '../components/Icon';
import { StopPicker } from '../components/StopPicker';
import { CENTRE_STOP, nearestStop, nextDepartures, stopDepartures, type Departure, type Timetable } from '../lib/bus';
import type { RealtimeFeed } from '../lib/gtfsRt';
import { setWidgetStop, useBusPrefs } from '../lib/busPrefs';
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

/** Current position: a recent fix if there is one (fast), else a fresh one. */
async function currentPosition(): Promise<[number, number]> {
  const pos =
    (await Location.getLastKnownPositionAsync({ maxAge: 2 * 60_000, requiredAccuracy: 300 })) ??
    (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
  return [pos.coords.latitude, pos.coords.longitude];
}

export function BusWidget() {
  const focused = useIsFocused();
  const styles = useStyles();
  const { colors } = useAppTheme();
  const { homeStop, campusStop, widgetStop } = useBusPrefs();
  const { timetable, error } = useTimetable(focused);
  const rt = useRealtime(focused);
  const now = useNow(15_000, focused);
  const { limitedBuses } = useDebug();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);

  const stop = widgetStop ?? campusStop;
  const list = useMemo(
    () => timetable && stopList(timetable, rt, stop, [CENTRE_STOP, campusStop].filter((x) => x !== stop), now),
    [timetable, rt, stop, campusStop, now],
  );

  const locate = async () => {
    if (!timetable || locating) return;
    setLocating(true);
    setLocateError(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setLocateError(t('bus.locateDenied'));
        return;
      }
      const candidates = [homeStop, CENTRE_STOP, campusStop].filter((x): x is string => !!x);
      const best = nearestStop(timetable, candidates, await currentPosition());
      if (best) setWidgetStop(best.name);
      else setLocateError(t('bus.locateFailed'));
    } catch {
      setLocateError(t('bus.locateFailed'));
    } finally {
      setLocating(false);
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
        <Pressable
          onPress={locate}
          disabled={!timetable || locating}
          accessibilityRole="button"
          accessibilityLabel={t('bus.locate')}
          accessibilityState={{ busy: locating, disabled: !timetable }}
          style={({ pressed }) => [styles.locateButton, (pressed || !timetable) && styles.pressed]}
        >
          {locating ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Icon name="focus-3-line" size={20} color={colors.primary} />
          )}
        </Pressable>
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
  // Limited-stop trips ("DIRECT") show the label under the line number, in the badge.
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
        {d.limited && <Text style={[styles.limitedText, { color: color.text }]}>{t('bus.limited')}</Text>}
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

const useStyles = makeStyles((c) => ({
  wrap: { padding: 12, gap: 12 },
  pad: { paddingVertical: 8 },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stopButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: c.surfaceAlt,
  },
  stopText: { flex: 1, fontSize: 14, fontWeight: '600', color: c.text },
  locateButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: c.surfaceAlt },
  pressed: { opacity: 0.6 },
  error: { fontSize: 12, color: c.danger },
  section: { gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  badge: { minWidth: 34, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, alignItems: 'center' },
  badgeText: { fontSize: 13, fontWeight: '800' },
  limitedText: { fontSize: 9, fontWeight: '700', marginTop: -1 },
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
