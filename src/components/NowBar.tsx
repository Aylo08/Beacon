// Home header ("now bar"): today's date and what matters right now, on a
// background that follows the context (see HeroBackground):
//  - class in progress → colour of its type, class · room, remaining-time bar;
//  - no class today / weekend / public holiday → orange, "Bonne journée";
//  - no class left today → night sky, "Bonne nuit", bus back to the home stop;
//  - next class starts within 15 min (first class, after lunch; 10 min when
//    waiting between classes) → colour of
//    its type, class · room in big, the bus (if any) as a compact line;
//  - between classes while the restaurants are open → red, Crous attendance;
//  - otherwise (travel slot, before the first class, waiting) → grey: bus
//    between campuses / from the home stop, else countdown to the next class.
// When a bus is shown while the restaurants are open, both restaurants'
// attendance is shown under it. A debug override (dev builds) can fake it all.
import { useEffect, useMemo, useState } from 'react';
import type { EdgeInsets } from 'react-native-safe-area-context';
import { ActivityIndicator, Text, View } from 'react-native';
import { nextDepartures, samePlace, type Departure, type Timetable } from '../lib/bus';
import { useBusPrefs } from '../lib/busPrefs';
import { attendancePercent, campusOfRoom, isRestoOpen, RESTOS, restoForCampus, spansLunch, type Attendance } from '../lib/crous';
import type { RoomEvent } from '../lib/edt';
import { normalizeSearch, titleField } from '../lib/events';
import { usePersonalData } from '../lib/personalData';
import { useSession } from '../lib/sessionContext';
import { makeStyles, useAppTheme } from '../lib/theme';
import { useDebug, withDebugLimited } from '../lib/debugOverride';
import { dateLabel, formatMinutes, parisParts, weekday } from '../lib/time';
import { useRealtime, useTimetable } from '../lib/useBus';
import { useAttendance, useNow } from '../lib/useLive';
import { HeroBackground, type HeroMode } from './HeroBackground';
import { Icon } from './Icon';
import { t, type TranslationKey } from '../lib/i18n';

const TICK_MS = 15_000;
/** How long before a class the bar switches to announcing it: first class / end of lunch… */
const SOON_MS = 15 * 60_000;
/** …and when simply waiting between classes. */
const SOON_WAITING_MS = 10 * 60_000;

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
  if (m < 60) return t('duration.min', { m });
  if (m < 24 * 60) return t('duration.hours', { h: Math.floor(m / 60), mm: String(m % 60).padStart(2, '0') });
  const d = Math.floor(m / (24 * 60));
  const h = Math.floor((m % (24 * 60)) / 60);
  return h ? t('duration.daysHours', { d, h }) : t('duration.days', { d });
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

/** Bus stop serving a campus: the chosen Centre-ville stop for Centre-ville, the chosen Agroparc stop otherwise. */
function stopForCampus(campus: string | null | undefined, stops: { centreStop: string; campusStop: string }): string | null {
  if (!campus) return null;
  const c = normalizeSearch(campus);
  if (c.includes('nondefini')) return null;
  return c.includes('centre') ? stops.centreStop : stops.campusStop;
}

type BusPlan = { kind: 'travel' | 'toCampus' | 'home'; from: string; to: string; context?: string; arriveBy?: number };

export function NowBar({ focused, insets }: { focused: boolean; insets: EdgeInsets }) {
  const data = usePersonalData();
  const { override } = useDebug();
  const { token } = useSession();
  const busPrefs = useBusPrefs();
  const { homeStop } = busPrefs;
  const styles = useStyles();
  const { colors } = useAppTheme();
  const realNow = useNow(TICK_MS, focused);
  // Debug scenario: its fake clock keeps running from when it was picked.
  // (The clock ticks every TICK_MS: right after picking, realNow can still be older than setAt.)
  const now = override ? override.now + Math.max(0, realNow - override.setAt) : realNow;
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
  // Class about to start (today): announced in big, bus / lunch shrink to one line.
  // Lunch break: the gap since the previous class overlaps the restaurants' hours.
  const prevToday = [...todays].reverse().find((i) => i.end <= now);
  const afterLunch = !!next && !!prevToday && spansLunch(prevToday.endMin, next.startMin);
  const soonMs = beforeFirst || afterLunch || isRestoOpen(now) ? SOON_MS : SOON_WAITING_MS;
  const soon = !current && next && next.day === today && next.start - now <= soonMs ? next : null;
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
    const travelFrom = slot && stopForCampus(campusOf(slotPrev?.room), busPrefs);
    const travelTo = slot && stopForCampus(campusOf(slotNext?.room), busPrefs);
    if (slot && travelFrom && travelTo && !samePlace(travelFrom, travelTo)) {
      bus = { kind: 'travel', from: travelFrom, to: travelTo, context: slotNext?.subject, arriveBy: slotNext?.start };
    } else if (beforeFirst || afterLast) {
      const campus = stopForCampus(campusOf((beforeFirst ? first : last)?.room), busPrefs);
      if (!homeStop) needsHomeStop = true;
      else if (campus && !samePlace(campus, homeStop)) {
        bus = beforeFirst
          ? { kind: 'toCampus', from: homeStop, to: campus, context: first!.subject, arriveBy: first!.start }
          : { kind: 'home', from: campus, to: homeStop };
      }
    }
  }
  // Lunch only between classes (on campus): before the first / after the last class, the bus wins.
  // Not either once the next class is about to start.
  const lunch = !current && !soon && !bus && !beforeFirst && !afterLast && isRestoOpen(now);

  const loading = data.loading && !events;
  const mode: HeroMode = loading
    ? 'loading'
    : current || soon
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
  const busAndLunch = !!bus && bus.kind !== 'home' && !soon && isRestoOpen(now);
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
      <View accessibilityLabel={t('now.inProgressA11y', { subject: current.subject, left: formatDuration((current.end - now) / 60000) })}>
        <Text style={styles.kicker}>
          {t('now.inProgress')}
          {current.type ? ` · ${current.type.toUpperCase()}` : ''}
        </Text>
        <Text style={styles.title} numberOfLines={1}>
          {[current.subject, current.room].filter(Boolean).join(' · ')}
        </Text>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${progress * 100}%` }]} />
        </View>
        <Text style={styles.detail}>{t('now.left', { left: formatDuration((current.end - now) / 60000) })}</Text>
      </View>
    );
  } else if (soon) {
    const wait = formatDuration((soon.start - now) / 60000);
    content = (
      <View
        accessibilityLabel={`${t('now.soonA11y', { wait, subject: soon.subject })}${soon.room ? t('now.soonRoomA11y', { room: soon.room }) : ''}`}
      >
        <Text style={styles.kicker}>
          {t('now.soon', { wait: wait.toUpperCase() })}
          {soon.type ? ` · ${soon.type.toUpperCase()}` : ''} · {hhmm(soon.start)}
        </Text>
        <Text style={styles.title} numberOfLines={2}>
          {soon.subject}
        </Text>
        {soon.room && (
          <View style={styles.row}>
            <Icon name="map-pin-2-line" size={18} color={colors.onAccent} />
            <Text style={styles.room} numberOfLines={1}>
              {soon.room}
            </Text>
          </View>
        )}
        {bus && <CompactBus plan={bus} timetable={timetable} error={busError} rt={rt} now={now} />}
        {needsHomeStop && <HomeStopHint />}
      </View>
    );
  } else if (mode === 'free') {
    const wd = weekday(today);
    content = (
      <>
        <Text style={styles.greeting}>{t('now.goodDay')}</Text>
        <Text style={styles.detail}>
          {holidayToday ? t('now.holiday') : wd === 0 || wd === 6 ? t('now.weekend') : t('now.noClassToday')}
        </Text>
      </>
    );
  } else if (mode === 'night') {
    const late = nowMin >= 18 * 60 || nowMin < 5 * 60;
    content = (
      <>
        <Text style={styles.greeting}>{late ? t('now.goodNight') : t('now.dayOver')}</Text>
        <Text style={styles.detail}>{t('now.noMoreClasses')}</Text>
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
            {t('now.resto')}
            {attendance ? ` · ${attendance.name}` : ''}
          </Text>
        </View>
        {attendance ? (
          <>
            <View style={styles.row}>
              <Text style={styles.big}>{attendance.count}</Text>
              <Text style={styles.detail}>
                {attendance.capacity ? `/ ${attendance.capacity} ` : ''}
                {t('now.meals')}
              </Text>
              {attendance.full && (
                <View style={styles.pill}>
                  <Text style={styles.pillText}>{t('resto.full')}</Text>
                </View>
              )}
            </View>
            {attendance.capacity !== null && (
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${attendancePercent(attendance) ?? 0}%` }]} />
              </View>
            )}
            {!attendance.upToDate && <Text style={styles.detail}>{t('now.stale')}</Text>}
          </>
        ) : crousError ? (
          <Text style={styles.detail}>{t('now.attendanceUnavailable', { error: crousError })}</Text>
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
    content = <Text style={styles.title}>{t('now.noUpcoming')}</Text>;
  }

  return (
    <View style={[styles.hero, { paddingTop: insets.top + 10, paddingLeft: insets.left + 16, paddingRight: insets.right + 16 }]}>
      <HeroBackground mode={mode} classType={(current ?? soon)?.type} />
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
  return <Text style={[styles.detail, styles.hint]}>{t('now.homeStopHint')}</Text>;
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
          <Text style={styles.pillText}>{t('resto.full')}</Text>
        </View>
      )}
    </View>
  );
}

const BUS_TITLES = {
  travel: 'now.busTravel',
  toCampus: 'now.busToCampus',
  home: 'now.busHome',
} as const satisfies Record<BusPlan['kind'], TranslationKey>;

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
  const { limitedBuses } = useDebug();
  const deps = useMemo(
    // A few extra in case some are cancelled; cancelled buses aren't shown.
    () =>
      timetable
        ? withDebugLimited(nextDepartures(timetable, rt, plan.from, plan.to, now, 6).filter((x) => !x.canceled).slice(0, 3), limitedBuses)
        : null,
    [timetable, rt, plan.from, plan.to, now, limitedBuses],
  );

  const header = (
    <View style={styles.row}>
      <Icon name="bus-line" size={14} color={colors.onAccent} />
      <Text style={styles.kicker} numberOfLines={1}>
        {t(BUS_TITLES[plan.kind])} · {plan.from} → {plan.to}
      </Text>
    </View>
  );

  if (!deps) {
    return (
      <>
        {header}
        {error ? (
          <Text style={styles.detail}>{t('bus.unavailable', { error })}</Text>
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
        <Text style={styles.title}>{t('now.noBus24h')}</Text>
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

/** One-line bus: "🚌 C3 6 min · 14 min · St Lazare → Agroparc" (when a class is about to start). */
function CompactBus({
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
  const { limitedBuses } = useDebug();
  const deps = useMemo(
    () =>
      timetable
        ? withDebugLimited(nextDepartures(timetable, rt, plan.from, plan.to, now, 4).filter((x) => !x.canceled).slice(0, 2), limitedBuses)
        : null,
    [timetable, rt, plan.from, plan.to, now, limitedBuses],
  );
  const d = deps?.[0];
  const lineColor = d ? (timetable!.lineColors[d.line]?.bg ?? colors.accent) : colors.accent;
  const route = `${plan.from} → ${plan.to}`;
  return (
    <View style={[styles.row, styles.compactBus]}>
      <Icon name="bus-line" size={14} color={colors.onAccent} />
      {d ? (
        <>
          <View style={[styles.lineBadgeSmall, { backgroundColor: colors.onAccent }]}>
            <Text style={[styles.lineTextSmall, { color: lineColor }]}>{d.line}</Text>
          </View>
          {d.limited && <LimitedTag small />}
          <Text style={styles.compactBusText} numberOfLines={1}>
            {deps!.map((x) => eta(x, now, false)).join(' · ')} · {route}
          </Text>
          <LiveIcon live={d.realtime} size={12} />
        </>
      ) : (
        <Text style={styles.compactBusText} numberOfLines={1}>
          {`${deps ? t('now.noBus') : error ? t('now.busUnavailable') : '…'} · ${route}`}
        </Text>
      )}
    </View>
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
      {first.limited && <LimitedTag />}
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
      {x.limited && <LimitedTag small />}
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

/** Wait before a departure: "in 6 min" / "6 min" (or the time when ≥ 1 h, "Now" when due). */
function eta(d: Departure, now: number, long: boolean) {
  const mins = Math.round((d.expected - now) / 60_000);
  if (mins <= 0) return t('bus.now');
  if (mins >= 60) return long ? t('now.etaAt', { time: hhmm(d.expected) }) : hhmm(d.expected);
  return long ? t('now.etaIn', { min: mins }) : t('duration.min', { m: mins });
}

/** "Direct" / "Limited" tag of a limited-stop trip (C3 DIRECT). */
function LimitedTag({ small }: { small?: boolean }) {
  const styles = useStyles();
  return (
    <View style={[styles.limited, small && styles.limitedSmall]} accessibilityLabel={t('bus.limitedA11y')}>
      <Text style={[styles.limitedText, small && styles.limitedTextSmall]}>{t('bus.limited')}</Text>
    </View>
  );
}

/** Realtime indicator: green when the time comes from the live feed, grey when scheduled only. */
function LiveIcon({ live, size }: { live: boolean; size: number }) {
  return (
    <View accessibilityLabel={live ? t('now.live') : t('now.scheduled')}>
      <Icon name="rss-line" size={size} color={live ? '#4ade80' : '#9ca3af'} />
    </View>
  );
}

/** "Arrives 12 min before Algorithmique" / "Arrives 5 min after Algorithmique starts". */
function arrivalNote(d: Departure, classStart: number, subject: string) {
  const margin = Math.round((classStart - d.arrival) / 60_000);
  return margin >= 0 ? t('now.arriveBefore', { min: margin, subject }) : t('now.arriveAfter', { min: -margin, subject });
}

function NextLine({ next, now, compact }: { next: Item; now: number; compact: boolean }) {
  const styles = useStyles();
  const wait = formatDuration((next.start - now) / 60000);
  const what = [next.subject, next.room].filter(Boolean).join(' · ');
  if (compact) {
    return (
      <Text style={[styles.detail, styles.compactNext]} numberOfLines={1}>
        {t('now.nextIn', { wait, what })}
      </Text>
    );
  }
  return (
    <>
      <Text style={styles.kicker}>{t('now.next')}</Text>
      <Text style={styles.big}>{t('now.in', { wait })}</Text>
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
  room: { fontSize: 22, fontWeight: '800', color: c.onAccent, flexShrink: 1 },
  compactBus: {
    gap: 6,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  compactBusText: { fontSize: 13, fontWeight: '600', color: c.onAccent, opacity: 0.9, flexShrink: 1, fontVariant: ['tabular-nums'] },
  lineBadgeSmall: { borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  lineTextSmall: { fontSize: 12, fontWeight: '800' },
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
  limited: { borderWidth: 1, borderColor: c.onAccent, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  limitedSmall: { borderRadius: 4, paddingHorizontal: 4, paddingVertical: 0 },
  limitedText: { fontSize: 12, fontWeight: '800', color: c.onAccent },
  limitedTextSmall: { fontSize: 11 },
  lineText: { fontSize: 15, fontWeight: '800' },
}));
