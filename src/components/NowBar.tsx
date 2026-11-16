// Home header ("now bar"): today's date and what matters right now, on a
// background that follows the context (see HeroBackground):
//  - class in progress → colour of its type, class · room, remaining-time bar;
//  - no class today / weekend / public holiday → orange, "Bonne journée";
//  - no class left today → night sky, "Bonne nuit", bus back to the home stop;
//  - between classes while the restaurants are open → red, Crous attendance;
//  - otherwise (travel slot, before the first class, waiting) → grey: bus
//    between campuses / from the home stop, else countdown to the next class.
// When a bus is shown while the restaurants are open, both restaurants'
// attendance is shown under it. A debug override (dev builds) can fake it all.
import { useEffect, useMemo, useState } from 'react';
import type { EdgeInsets } from 'react-native-safe-area-context';
import { ActivityIndicator, Text, View } from 'react-native';
import { CENTRE_STOP, nextDepartures, type Departure, type Timetable } from '../lib/bus';
import { useBusPrefs } from '../lib/busPrefs';
import { campusOfRoom, isRestoOpen, RESTOS, restoForCampus, type Attendance } from '../lib/crous';
import type { RoomEvent } from '../lib/edt';
import { normalizeSearch, titleField } from '../lib/events';
import { usePersonalData } from '../lib/personalData';
import { useSession } from '../lib/sessionContext';
import { makeStyles, useAppTheme } from '../lib/theme';
import { useDebug } from '../lib/debugOverride';
import { dateLabel, formatMinutes, parisParts, weekday } from '../lib/time';
import { useRealtime, useTimetable } from '../lib/useBus';
import { useAttendance, useNow } from '../lib/useLive';
import { HeroBackground, type HeroMode } from './HeroBackground';
import { Icon } from './Icon';

const TICK_MS = 15_000;

type Item = {
  start: number;
  end: number;
  day: string;
  startMin: number;
  endMin: number;
  subject: string;
  room?: string;
  type: string;
};

const toItem = (e: RoomEvent): Item => {
  const s = new Date(e.start);
  const end = new Date(e.end);
  const sp = parisParts(s);
  return {
    start: s.getTime(),
    end: end.getTime(),
    day: sp.day,
    startMin: sp.minutes,
    endMin: parisParts(end).minutes,
    subject: titleField(e.title, 'Matière') ?? e.title.split('\n')[0] ?? e.type,
    room: titleField(e.title, 'Salle', 'Salles'),
    type: e.type,
  };
};

const toItems = (events: RoomEvent[] | null) =>
  (events ?? [])
    .filter((e) => e.type !== 'Annulation')
    .map(toItem)
    .filter((i) => i.end - i.start < 12 * 3600_000) // skip all-day markers (holidays)
    .sort((a, b) => a.start - b.start);

/** 35 → "35 min", 95 → "1 h 35", 1600 → "1 j 2 h" */
export function formatDuration(totalMin: number) {
  const m = Math.max(0, Math.ceil(totalMin));
  if (m < 60) return `${m} min`;
  if (m < 24 * 60) return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
  const d = Math.floor(m / (24 * 60));
  const h = Math.floor((m % (24 * 60)) / 60);
  return h ? `${d} j ${h} h` : `${d} j`;
}

const hhmm = (ms: number) => formatMinutes(parisParts(new Date(ms)).minutes);

/** Campus name of each room (via the room list), resolved lazily. undefined = still loading. */
function useRoomCampuses(token: string | null | undefined, rooms: (string | undefined)[], overrides?: Record<string, string>) {
  const [known, setKnown] = useState<Record<string, string | null>>({});
  const missing = [...new Set(rooms.filter((r): r is string => !!r && !(r in known) && !overrides?.[r]))];
  const key = missing.join('\n');
  useEffect(() => {
    if (!token || !key) return;
    let cancelled = false;
    for (const room of key.split('\n')) {
      campusOfRoom(token, room)
        .catch(() => null)
        .then((c) => !cancelled && setKnown((k) => ({ ...k, [room]: c })));
    }
    return () => {
      cancelled = true;
    };
  }, [token, key]);
  return (room: string | undefined): string | null | undefined => (room ? (overrides?.[room] ?? known[room]) : null);
}

/** Bus stop serving a campus: St Lazare for Centre-ville, the chosen Agroparc stop otherwise. */
function stopForCampus(campus: string | null | undefined, campusStop: string): string | null {
  if (!campus) return null;
  const c = normalizeSearch(campus);
  if (c.includes('nondefini')) return null;
  return c.includes('centre') ? CENTRE_STOP : campusStop;
}

type BusPlan = { kind: 'travel' | 'toCampus' | 'home'; from: string; to: string; context?: string; arriveBy?: number };

export function NowBar({ focused, insets }: { focused: boolean; insets: EdgeInsets }) {
  const data = usePersonalData();
  const { override } = useDebug();
  const { token } = useSession();
  const { homeStop, campusStop } = useBusPrefs();
  const styles = useStyles();
  const { colors } = useAppTheme();
  const realNow = useNow(TICK_MS, focused);
  // Debug scenario: its fake clock keeps running from when it was picked.
  const now = override ? override.now + (realNow - override.setAt) : realNow;
  const events = override ? override.events : data.events;
  const travel = override ? override.travel : data.travel;
  const holidays = override ? override.holidays : data.holidays;
  const { day: today, minutes: nowMin } = parisParts(new Date(now));

  const items = useMemo(() => toItems(events), [events]);
  const travelItems = useMemo(() => toItems(travel), [travel]);

  const current = items.find((i) => i.start <= now && now < i.end);
  const next = items.find((i) => i.start > now);
  const todays = items.filter((i) => i.day === today);
  const first = todays[0];
  const last = todays.at(-1);
  const beforeFirst = !!first && now < first.start;
  const afterLast = !!last && now >= last.end;
  const holidayToday = (holidays ?? []).some((h) => Date.parse(h.start) <= now && now < Date.parse(h.end));

  // Travel slot: previous class (ended around its start) → next class (starts around its end).
  const slot = travelItems.find((i) => i.start <= now && now < i.end);
  const slotPrev = slot && [...todays].reverse().find((i) => i.end <= slot.start + 5 * 60_000);
  const slotNext = slot && todays.find((i) => i.start >= slot.end - 5 * 60_000);

  // Last class today (else today's next one) → which restaurant to show.
  const lunchRef = [...todays].reverse().find((i) => i.end <= now) ?? todays.find((i) => i.start > now);

  const campusOf = useRoomCampuses(
    token,
    [slotPrev?.room, slotNext?.room, first?.room, last?.room, lunchRef?.room],
    override?.campuses,
  );

  // Which bus (if any) to show.
  let bus: BusPlan | null = null;
  let needsHomeStop = false;
  if (!current) {
    const travelFrom = slot && stopForCampus(campusOf(slotPrev?.room), campusStop);
    const travelTo = slot && stopForCampus(campusOf(slotNext?.room), campusStop);
    if (slot && travelFrom && travelTo && travelFrom !== travelTo) {
      bus = { kind: 'travel', from: travelFrom, to: travelTo, context: slotNext?.subject, arriveBy: slotNext?.start };
    } else if (beforeFirst || afterLast) {
      const campus = stopForCampus(campusOf((beforeFirst ? first : last)?.room), campusStop);
      if (!homeStop) needsHomeStop = true;
      else if (campus && campus !== homeStop) {
        bus = beforeFirst
          ? { kind: 'toCampus', from: homeStop, to: campus, context: first!.subject, arriveBy: first!.start }
          : { kind: 'home', from: campus, to: homeStop };
      }
    }
  }
  // Lunch only between classes (on campus): before the first / after the last class, the bus wins.
  const lunch = !current && !bus && !beforeFirst && !afterLast && isRestoOpen(now);

  const loading = data.loading && !events;
  const mode: HeroMode = loading
    ? 'loading'
    : current
      ? 'class'
      : holidayToday || todays.length === 0
        ? 'free'
        : afterLast
          ? 'night'
          : lunch
            ? 'lunch'
            : 'waiting';

  const { timetable, error: busError } = useTimetable(focused && !!bus);
  const rt = useRealtime(focused && !!bus);

  const lunchCampus = campusOf(lunchRef?.room);
  const restoId = lunch && lunchCampus !== undefined ? restoForCampus(lunchCampus) : null;
  const { attendance, error: crousError } = useAttendance(restoId, lunch && focused);
  // Bus + restaurants open at the same time: show both restaurants under the bus.
  // Not at the end of the day: you're heading home, the restaurants don't matter.
  const busAndLunch = !!bus && bus.kind !== 'home' && isRestoOpen(now);
  const restoA = useAttendance(busAndLunch ? RESTOS[0].id : null, busAndLunch && focused);
  const restoB = useAttendance(busAndLunch ? RESTOS[1].id : null, busAndLunch && focused);

  const compactNext = next && <NextLine next={next} now={now} compact />;
  const busBlock = bus && (
    <>
      <BusCard plan={bus} timetable={timetable} error={busError} rt={rt} now={now} />
      {busAndLunch && (
        <View style={styles.restos}>
          <Icon name="restaurant-line" size={14} color={colors.onAccent} />
          <RestoChip label={RESTOS[0].label} attendance={restoA.attendance} failed={!!restoA.error} />
          <RestoChip label={RESTOS[1].label} attendance={restoB.attendance} failed={!!restoB.error} />
        </View>
      )}
    </>
  );

  let content;
  if (loading) {
    content = <ActivityIndicator color={colors.onAccent} style={styles.spinner} />;
  } else if (current) {
    const progress = Math.min(1, Math.max(0, (now - current.start) / (current.end - current.start)));
    content = (
      <View accessibilityLabel={`En cours : ${current.subject}, fin dans ${formatDuration((current.end - now) / 60000)}`}>
        <Text style={styles.kicker}>EN COURS{current.type ? ` · ${current.type.toUpperCase()}` : ''}</Text>
        <Text style={styles.title} numberOfLines={1}>
          {[current.subject, current.room].filter(Boolean).join(' · ')}
        </Text>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${progress * 100}%` }]} />
        </View>
        <Text style={styles.detail}>Reste {formatDuration((current.end - now) / 60000)}</Text>
      </View>
    );
  } else if (mode === 'free') {
    const wd = weekday(today);
    content = (
      <>
        <Text style={styles.greeting}>Bonne journée !</Text>
        <Text style={styles.detail}>
          {holidayToday ? 'Jour férié, pas de cours' : wd === 0 || wd === 6 ? 'C’est le week-end' : 'Pas de cours aujourd’hui'}
        </Text>
      </>
    );
  } else if (mode === 'night') {
    const late = nowMin >= 18 * 60 || nowMin < 5 * 60;
    content = (
      <>
        <Text style={styles.greeting}>{late ? 'Bonne nuit' : 'Journée terminée'}</Text>
        <Text style={styles.detail}>Plus de cours aujourd’hui</Text>
        {busBlock ? <View style={styles.section}>{busBlock}</View> : compactNext}
        {needsHomeStop && <HomeStopHint />}
      </>
    );
  } else if (bus) {
    content = busBlock;
  } else if (lunch) {
    content = (
      <>
        <View style={styles.row}>
          <Icon name="restaurant-line" size={14} color={colors.onAccent} />
          <Text style={styles.kicker} numberOfLines={1}>
            RESTO U{attendance ? ` · ${attendance.name}` : ''}
          </Text>
        </View>
        {attendance ? (
          <>
            <View style={styles.row}>
              <Text style={styles.big}>{attendance.count}</Text>
              <Text style={styles.detail}>repas</Text>
              {attendance.full && (
                <View style={styles.pill}>
                  <Text style={styles.pillText}>Complet</Text>
                </View>
              )}
            </View>
            {!attendance.upToDate && <Text style={styles.detail}>Données non à jour</Text>}
          </>
        ) : crousError ? (
          <Text style={styles.detail}>Affluence indisponible ({crousError})</Text>
        ) : (
          <ActivityIndicator color={colors.onAccent} style={styles.spinner} />
        )}
        {compactNext}
      </>
    );
  } else if (next) {
    content = (
      <>
        <NextLine next={next} now={now} compact={false} />
        {needsHomeStop && <HomeStopHint />}
      </>
    );
  } else {
    content = <Text style={styles.title}>Aucun cours à venir</Text>;
  }

  return (
    <View style={[styles.hero, { paddingTop: insets.top + 10, paddingLeft: insets.left + 16, paddingRight: insets.right + 16 }]}>
      <HeroBackground mode={mode} classType={current?.type} />
      <View style={styles.inner}>
        <View style={styles.dateRow}>
          <Text style={styles.date}>{dateLabel(today)}</Text>
          {override && <Text style={styles.debugTag}>DEBUG · {override.label}</Text>}
        </View>
        <View style={styles.content}>{content}</View>
      </View>
    </View>
  );
}

function HomeStopHint() {
  const styles = useStyles();
  return <Text style={[styles.detail, styles.hint]}>Choisissez votre arrêt de bus dans les réglages pour voir le prochain C3.</Text>;
}

/** "Agroparc 142" (+ "complet") in the compact restaurants line. */
function RestoChip({ label, attendance, failed }: { label: string; attendance: Attendance | null; failed: boolean }) {
  const styles = useStyles();
  return (
    <View style={styles.chip}>
      <Text style={styles.chipLabel}>{label}</Text>
      <Text style={styles.chipValue}>{attendance ? attendance.count : failed ? '–' : '…'}</Text>
      {attendance?.full && (
        <View style={styles.pill}>
          <Text style={styles.pillText}>Complet</Text>
        </View>
      )}
    </View>
  );
}

const BUS_TITLES: Record<BusPlan['kind'], string> = {
  travel: 'TEMPS DE DÉPLACEMENT',
  toCampus: 'BUS VERS LE CAMPUS',
  home: 'RETOUR',
};

function BusCard({
  plan,
  timetable,
  error,
  rt,
  now,
}: {
  plan: BusPlan;
  timetable: Timetable | null;
  error: string | null;
  rt: Parameters<typeof nextDepartures>[1];
  now: number;
}) {
  const styles = useStyles();
  const { colors } = useAppTheme();
  const deps = useMemo(
    // A few extra in case some are cancelled; cancelled buses aren't shown.
    () => (timetable ? nextDepartures(timetable, rt, plan.from, plan.to, now, 6).filter((x) => !x.canceled).slice(0, 3) : null),
    [timetable, rt, plan.from, plan.to, now],
  );

  const header = (
    <View style={styles.row}>
      <Icon name="bus-line" size={14} color={colors.onAccent} />
      <Text style={styles.kicker} numberOfLines={1}>
        {BUS_TITLES[plan.kind]} · {plan.from} → {plan.to}
      </Text>
    </View>
  );

  if (!deps) {
    return (
      <>
        {header}
        {error ? (
          <Text style={styles.detail}>Horaires indisponibles ({error})</Text>
        ) : (
          <ActivityIndicator color={colors.onAccent} style={styles.spinner} />
        )}
      </>
    );
  }
  const [d, ...later] = deps;
  if (!d) {
    return (
      <>
        {header}
        <Text style={styles.title}>Aucun bus dans les prochaines 24 h</Text>
      </>
    );
  }

  const color = timetable!.lineColors[d.line];
  return (
    <>
      {header}
      <EtaRow first={d} later={later} now={now} lineColor={color?.bg ?? colors.accent} />
      {plan.arriveBy && plan.context && (
        <Text style={styles.detail} numberOfLines={1}>
          {arrivalNote(d, plan.arriveBy, plan.context)}
        </Text>
      )}
    </>
  );
}

const ROW_GAP = 8;
const LATER_MARGIN = 4;

/**
 * Line badge + next ETA (big) + up to two later ETAs (small), on one line only:
 * later ETAs that wouldn't fit are dropped. An invisible copy of the row
 * measures each part.
 */
function EtaRow({ first, later, now, lineColor }: { first: Departure; later: Departure[]; now: number; lineColor: string }) {
  const styles = useStyles();
  const { colors } = useAppTheme();
  const [rowWidth, setRowWidth] = useState(0);
  const [mainWidth, setMainWidth] = useState(0);
  const [laterWidths, setLaterWidths] = useState<number[]>([]);

  const main = (
    <>
      <View style={[styles.lineBadge, { backgroundColor: colors.onAccent }]}>
        <Text style={[styles.lineText, { color: lineColor }]}>{first.line}</Text>
      </View>
      <Text style={styles.big}>{eta(first, now, true)}</Text>
      <LiveIcon live={first.realtime} size={16} />
    </>
  );
  const laterItem = (x: Departure, onLayout?: (w: number) => void) => (
    <View
      key={`${x.tripId}-${x.scheduled}`}
      style={styles.laterEta}
      onLayout={onLayout && ((e) => onLayout(e.nativeEvent.layout.width))}
    >
      <Text style={styles.laterText}>{eta(x, now, false)}</Text>
      <LiveIcon live={x.realtime} size={12} />
    </View>
  );

  // How many later ETAs fit after the main part (until measured, show none rather than overflow).
  let fit = 0;
  // Array.from, not slice: a sparse copy's holes would be skipped by every().
  const widths = Array.from({ length: later.length }, (_, i) => laterWidths[i]);
  if (rowWidth && mainWidth && widths.every((w) => w > 0)) {
    let used = mainWidth;
    for (const w of widths) {
      used += ROW_GAP + LATER_MARGIN + w;
      if (used > rowWidth) break;
      fit++;
    }
  }

  return (
    <View style={styles.etaRow} onLayout={(e) => setRowWidth(e.nativeEvent.layout.width)}>
      {/* Measurement copy: same content, invisible, never wraps. */}
      <View style={styles.measure} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={styles.row} onLayout={(e) => setMainWidth(e.nativeEvent.layout.width)}>
          {main}
        </View>
        {later.map((x, i) =>
          laterItem(x, (w) =>
            setLaterWidths((prev) => {
              if (prev[i] === w) return prev;
              const next = [...prev];
              next[i] = w;
              return next;
            }),
          ),
        )}
      </View>
      <View style={styles.row}>
        {main}
        {later.slice(0, fit).map((x) => laterItem(x))}
      </View>
    </View>
  );
}

/** Wait before a departure: "dans 6 min" / "6 min" (or the time when ≥ 1 h, "Maintenant" when due). */
function eta(d: Departure, now: number, long: boolean) {
  const mins = Math.round((d.expected - now) / 60_000);
  if (mins <= 0) return 'Maintenant';
  if (mins >= 60) return long ? `à ${hhmm(d.expected)}` : hhmm(d.expected);
  return long ? `dans ${mins} min` : `${mins} min`;
}

/** Realtime indicator: green when the time comes from the live feed, grey when scheduled only. */
function LiveIcon({ live, size }: { live: boolean; size: number }) {
  return (
    <View accessibilityLabel={live ? 'temps réel' : 'horaire théorique'}>
      <Icon name="rss-line" size={size} color={live ? '#4ade80' : '#9ca3af'} />
    </View>
  );
}

/** "Arrivée 12 min avant Algorithmique" / "Arrivée 5 min après le début de Algorithmique". */
function arrivalNote(d: Departure, classStart: number, subject: string) {
  const margin = Math.round((classStart - d.arrival) / 60_000);
  return margin >= 0 ? `Arrivée ${margin} min avant ${subject}` : `Arrivée ${-margin} min après le début de ${subject}`;
}

function NextLine({ next, now, compact }: { next: Item; now: number; compact: boolean }) {
  const styles = useStyles();
  const wait = formatDuration((next.start - now) / 60000);
  const what = [next.subject, next.room].filter(Boolean).join(' · ');
  if (compact) {
    return (
      <Text style={[styles.detail, styles.compactNext]} numberOfLines={1}>
        Prochain cours dans {wait} · {what}
      </Text>
    );
  }
  return (
    <>
      <Text style={styles.kicker}>PROCHAIN COURS</Text>
      <Text style={styles.big}>dans {wait}</Text>
      <Text style={styles.title} numberOfLines={1}>
        {what}
      </Text>
    </>
  );
}

const useStyles = makeStyles((c) => ({
  hero: { paddingBottom: 16, overflow: 'visible' },
  inner: { width: '100%', maxWidth: 720, alignSelf: 'center', gap: 8 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  date: { fontSize: 22, fontWeight: '800', color: c.onAccent, flexShrink: 1 },
  debugTag: {
    marginLeft: 'auto',
    fontSize: 10,
    fontWeight: '800',
    color: c.onAccent,
    backgroundColor: 'rgba(0,0,0,0.35)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  content: { gap: 3 },
  section: { gap: 3, marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  kicker: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, color: c.onAccent, opacity: 0.8, flexShrink: 1 },
  title: { fontSize: 16, fontWeight: '700', color: c.onAccent },
  greeting: { fontSize: 18, fontWeight: '800', color: c.onAccent },
  big: { fontSize: 24, fontWeight: '800', color: c.onAccent, fontVariant: ['tabular-nums'] },
  detail: { fontSize: 13, color: c.onAccent, opacity: 0.9 },
  compactNext: { marginTop: 6 },
  hint: { marginTop: 6, fontSize: 12 },
  track: { height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden', marginTop: 8, marginBottom: 4 },
  fill: { height: '100%', borderRadius: 3, backgroundColor: c.onAccent },
  pill: { backgroundColor: c.live, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  pillText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  spinner: { alignSelf: 'flex-start', marginVertical: 6 },
  restos: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipLabel: { fontSize: 13, color: c.onAccent, opacity: 0.9 },
  chipValue: { fontSize: 14, fontWeight: '800', color: c.onAccent, fontVariant: ['tabular-nums'] },
  etaRow: { overflow: 'hidden' },
  measure: { position: 'absolute', left: 0, top: 0, flexDirection: 'row', alignItems: 'center', gap: ROW_GAP, opacity: 0, width: 10000 },
  laterEta: { flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 4 },
  laterText: { fontSize: 15, fontWeight: '700', color: c.onAccent, opacity: 0.85, fontVariant: ['tabular-nums'] },
  lineBadge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  lineText: { fontSize: 15, fontWeight: '800' },
}));
