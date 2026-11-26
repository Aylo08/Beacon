// Home header ("now bar"): today's date and what matters right now, on a
// background that follows the context (see HeroBackground). Class, restaurant
// and bus views share one layout: text on the left, the key number on the right.
//  - class in progress → colour of its type, subject, room · hours, ring of the time left;
//  - no class today / weekend / public holiday → orange, "Bonne journée";
//  - no class left today → night sky, "Bonne nuit", bus back to the home stop;
//  - next class starts within 15 min (first class, after lunch; 10 min when
//    waiting between classes) → colour of its type, ring filling up until it
//    starts (no bus: you're already on campus or on your way);
//  - between classes while the restaurants are open → rose, Crous attendance (ring = share served);
//  - otherwise (travel slot, before the first class, waiting) → teal: bus
//    between campuses / from the home stop (route left, next departure right),
//    else countdown to the next class.
// When a bus is shown while the restaurants are open, both restaurants'
// attendance is shown under it as chips. A strip of today's classes closes the
// bar, except when a bus or the restaurant fills it. A debug override (dev builds) can fake it all.
import { useMemo } from 'react';
import type { EdgeInsets } from 'react-native-safe-area-context';
import { ActivityIndicator, Text, View } from 'react-native';
import { nextDepartures, samePlace, type Departure, type Timetable } from '../lib/bus';
import { useBusPrefs } from '../lib/busPrefs';
import { attendancePercent, isRestoOpen, RESTOS, restoForCampus, spansLunch, type Attendance } from '../lib/crous';
import { stopForCampus, toItems, useRoomCampuses, type Item } from '../lib/classPlaces';
import { usePersonalData } from '../lib/personalData';
import { useSession } from '../lib/sessionContext';
import { makeStyles, useAppTheme } from '../lib/theme';
import { useDebug, withDebugLimited } from '../lib/debugOverride';
import { dateLabel, formatMinutes, parisParts, weekday } from '../lib/time';
import { useRealtime, useTimetable } from '../lib/useBus';
import { useAttendance, useNow } from '../lib/useLive';
import Svg, { Circle } from 'react-native-svg';
import { HeroBackground, type HeroMode } from './HeroBackground';
import { Icon } from './Icon';
import { t, type TranslationKey } from '../lib/i18n';

const TICK_MS = 15_000;
/** How long before a class the bar switches to announcing it: first class / end of lunch… */
const SOON_MS = 15 * 60_000;
/** …and when simply waiting between classes. */
const SOON_WAITING_MS = 10 * 60_000;

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
    const travelFrom = slot && stopForCampus(campusOf(slotPrev?.room), busPrefs, true);
    const travelTo = slot && stopForCampus(campusOf(slotNext?.room), busPrefs, true);
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

  // Not fetched while a class is about to start: that view doesn't show the bus.
  const showBus = !!bus && !soon;
  const { timetable, error: busError } = useTimetable(focused && showBus);
  const rt = useRealtime(focused && showBus);

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
        <View style={styles.classRow}>
          <View style={styles.classText}>
            <Text style={styles.kicker}>
              {t('now.inProgress')}
              {current.type ? ` · ${current.type.toUpperCase()}` : ''}
            </Text>
            <Text style={styles.subject} numberOfLines={2}>
              {current.subject}
            </Text>
            <ClassMeta item={current} />
          </View>
          <Ring progress={progress} label={formatDuration((current.end - now) / 60000)} />
        </View>
      </View>
    );
  } else if (soon) {
    const wait = formatDuration((soon.start - now) / 60000);
    content = (
      <View
        accessibilityLabel={`${t('now.soonA11y', { wait, subject: soon.subject })}${soon.room ? t('now.soonRoomA11y', { room: soon.room }) : ''}`}
      >
        <View style={styles.classRow}>
          <View style={styles.classText}>
            <Text style={styles.kicker}>
              {t('now.next')}
              {soon.type ? ` · ${soon.type.toUpperCase()}` : ''}
            </Text>
            <Text style={styles.subject} numberOfLines={2}>
              {soon.subject}
            </Text>
            <ClassMeta item={soon} />
          </View>
          {/* Fills up as the class gets closer. */}
          <Ring progress={1 - (soon.start - now) / soonMs} label={wait} />
        </View>
      </View>
    );
  } else if (mode === 'free') {
    const wd = weekday(today);
    content = (
      <>
        <View style={styles.row}>
          <Icon name="sun-line" size={22} color={colors.onAccent} />
          <Text style={styles.greeting}>{t('now.goodDay')}</Text>
        </View>
        <Text style={styles.detail}>
          {holidayToday ? t('now.holiday') : wd === 0 || wd === 6 ? t('now.weekend') : t('now.noClassToday')}
        </Text>
      </>
    );
  } else if (mode === 'night') {
    const late = nowMin >= 18 * 60 || nowMin < 5 * 60;
    content = (
      <>
        <View style={styles.row}>
          <Icon name={late ? 'moon-line' : 'check-line'} size={22} color={colors.onAccent} />
          <Text style={styles.greeting}>{late ? t('now.goodNight') : t('now.dayOver')}</Text>
        </View>
        <Text style={styles.detail}>{t('now.noMoreClasses')}</Text>
        {busBlock ? <View style={styles.section}>{busBlock}</View> : compactNext}
        {needsHomeStop && <HomeStopHint />}
      </>
    );
  } else if (bus) {
    content = busBlock;
  } else if (lunch) {
    const percent = attendance && attendancePercent(attendance);
    content = (
      <>
        <View style={styles.classRow}>
          <View style={styles.classText}>
            <View style={styles.row}>
              <Icon name="restaurant-line" size={14} color={colors.onAccent} />
              <Text style={styles.kicker}>{t('now.resto')}</Text>
            </View>
            {attendance ? (
              <>
                <Text style={styles.subject} numberOfLines={2}>
                  {attendance.name}
                </Text>
                <View style={styles.row}>
                  <Text style={styles.hours}>
                    {attendance.count}
                    {attendance.capacity ? ` / ${attendance.capacity}` : ''} {t('now.meals')}
                  </Text>
                  {attendance.full && (
                    <View style={styles.pill}>
                      <Text style={styles.pillText}>{t('resto.full')}</Text>
                    </View>
                  )}
                </View>
                {!attendance.upToDate && <Text style={styles.detail}>{t('now.stale')}</Text>}
              </>
            ) : crousError ? (
              <Text style={styles.detail}>{t('now.attendanceUnavailable', { error: crousError })}</Text>
            ) : (
              <ActivityIndicator color={colors.onAccent} style={styles.spinner} />
            )}
          </View>
          {percent != null ? (
            <Ring progress={percent / 100} label={`${percent} %`} />
          ) : (
            attendance && <Text style={styles.big}>{attendance.count}</Text>
          )}
        </View>
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
        {!loading && mode !== 'free' && todays.length > 0 && (current || soon || (!bus && !lunch)) && <DayStrip items={todays} now={now} />}
      </View>
    </View>
  );
}

/** Pin + room, then the class hours: "📍 S2.05 · 14:00 – 15:30". */
function ClassMeta({ item }: { item: Item }) {
  const styles = useStyles();
  const { colors } = useAppTheme();
  return (
    <View style={styles.row}>
      {item.room && (
        <>
          <Icon name="map-pin-2-line" size={16} color={colors.onAccent} />
          <Text style={styles.room} numberOfLines={1}>
            {item.room}
          </Text>
        </>
      )}
      <Text style={styles.hours}>
        {hhmm(item.start)} – {hhmm(item.end)}
      </Text>
    </View>
  );
}

const RING = 76;
const RING_STROKE = 6;

/** Circular gauge with a duration in the middle (time left in class / before it starts). */
function Ring({ progress, label }: { progress: number; label: string }) {
  const styles = useStyles();
  const { colors } = useAppTheme();
  const r = (RING - RING_STROKE) / 2;
  const circumference = 2 * Math.PI * r;
  const p = Math.min(1, Math.max(0, progress));
  return (
    <View style={styles.ring} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={RING} height={RING}>
        <Circle cx={RING / 2} cy={RING / 2} r={r} stroke="rgba(255,255,255,0.25)" strokeWidth={RING_STROKE} fill="none" />
        <Circle
          cx={RING / 2}
          cy={RING / 2}
          r={r}
          stroke={colors.onAccent}
          strokeWidth={RING_STROKE}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference * p} ${circumference}`}
          transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
        />
      </Svg>
      <View style={styles.ringCenter}>
        <Text style={styles.ringLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
          {label}
        </Text>
      </View>
    </View>
  );
}

/**
 * Today at a glance: one segment per class between the first start and the last end,
 * past classes faded, the current one solid, and a tick at the current time.
 */
function DayStrip({ items, now }: { items: Item[]; now: number }) {
  const styles = useStyles();
  const start = items[0].start;
  const end = Math.max(...items.map((i) => i.end));
  const span = Math.max(1, end - start);
  const pct = (ms: number) => ((ms - start) / span) * 100;
  const nowPct = pct(now);
  return (
    <View style={styles.strip} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.stripTrack}>
        {items.map((i, index) => (
          <View
            key={`${i.start}-${index}`}
            style={[
              styles.stripSeg,
              {
                left: `${pct(i.start)}%`,
                width: `${pct(i.end) - pct(i.start)}%`,
                opacity: i.end <= now ? 0.35 : i.start <= now ? 1 : 0.6,
              },
            ]}
          />
        ))}
        {nowPct >= 0 && nowPct <= 100 && <View style={[styles.stripNow, { left: `${nowPct}%` }]} />}
      </View>
      <View style={styles.stripLabels}>
        <Text style={styles.stripLabel}>{hhmm(start)}</Text>
        <Text style={styles.stripLabel}>{hhmm(end)}</Text>
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

  const [d, ...later] = deps ?? [];
  const lineColor = d ? (timetable!.lineColors[d.line]?.bg ?? colors.accent) : colors.accent;

  // Two lines: route + next departure, then the arrival note (or the trip kind) + later departures.
  let note: string = t(BUS_TITLES[plan.kind]);
  if (!deps && error) note = t('bus.unavailable', { error });
  else if (deps && !d) note = t('now.noBus24h');
  else if (d && plan.arriveBy && plan.context) note = arrivalNote(d, plan.arriveBy, plan.context);

  return (
    <View style={styles.bus}>
      <View style={styles.row}>
        <Icon name="bus-line" size={16} color={colors.onAccent} />
        <Text style={styles.route} numberOfLines={1}>
          {plan.from} → {plan.to}
        </Text>
        {d ? (
          <View style={styles.busNext}>
            {/* Stretched together: the limited-stop tag is exactly as tall as the line badge. */}
            <View style={styles.badges}>
              <View style={[styles.lineBadge, { backgroundColor: colors.onAccent }]}>
                <Text style={[styles.lineText, { color: lineColor }]}>{d.line}</Text>
              </View>
              {d.limited && <LimitedTag />}
            </View>
            <Text style={styles.busEta}>{eta(d, now)}</Text>
            <LiveIcon live={d.realtime} size={14} />
          </View>
        ) : (
          !deps && !error && <ActivityIndicator color={colors.onAccent} style={styles.busNext} />
        )}
      </View>
      <View style={styles.row}>
        <Text style={[styles.detail, styles.busNote]} numberOfLines={1}>
          {note}
        </Text>
        {later.length > 0 && (
          <Text style={styles.laterText} numberOfLines={1}>
            {t('now.then', { times: later.map((x) => eta(x, now)).join(' · ') })}
          </Text>
        )}
      </View>
    </View>
  );
}

/** Wait before a departure: "6 min" (or the time when ≥ 1 h, "Now" when due). */
function eta(d: Departure, now: number) {
  const mins = Math.round((d.expected - now) / 60_000);
  if (mins <= 0) return t('bus.now');
  if (mins >= 60) return hhmm(d.expected);
  return t('duration.min', { m: mins });
}

/** Limited-stop trip (C3 DIRECT): a bolt next to the line badge, spelled out for screen readers. */
function LimitedTag() {
  const styles = useStyles();
  const { colors } = useAppTheme();
  return (
    <View style={styles.limited} accessible accessibilityLabel={t('bus.limited')}>
      <Icon name="flashlight-fill" size={14} color={colors.onAccent} />
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
  date: { fontSize: 15, fontWeight: '700', color: c.onAccent, opacity: 0.85, flexShrink: 1 },
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
  room: { fontSize: 16, fontWeight: '800', color: c.onAccent, flexShrink: 1 },
  hours: { fontSize: 13, color: c.onAccent, opacity: 0.8, fontVariant: ['tabular-nums'] },
  subject: { fontSize: 22, fontWeight: '800', color: c.onAccent },
  classRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  classText: { flex: 1, gap: 4 },
  ring: { width: RING, height: RING },
  ringCenter: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', padding: RING_STROKE + 4 },
  ringLabel: { fontSize: 16, fontWeight: '800', color: c.onAccent, fontVariant: ['tabular-nums'], textAlign: 'center' },
  strip: { marginTop: 10, gap: 4 },
  stripTrack: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.15)' },
  stripSeg: { position: 'absolute', top: 0, bottom: 0, borderRadius: 4, backgroundColor: c.onAccent },
  stripNow: { position: 'absolute', top: -4, height: 16, width: 3, marginLeft: -1.5, borderRadius: 2, backgroundColor: c.onAccent },
  stripLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  stripLabel: { fontSize: 11, fontWeight: '600', color: c.onAccent, opacity: 0.7, fontVariant: ['tabular-nums'] },
  greeting: { fontSize: 20, fontWeight: '800', color: c.onAccent },
  big: { fontSize: 24, fontWeight: '800', color: c.onAccent, fontVariant: ['tabular-nums'] },
  detail: { fontSize: 13, color: c.onAccent, opacity: 0.9 },
  compactNext: { marginTop: 6 },
  hint: { marginTop: 6, fontSize: 12 },
  pill: { backgroundColor: c.live, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  pillText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  spinner: { alignSelf: 'flex-start', marginVertical: 6 },
  restos: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 10 },
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
  laterText: { fontSize: 13, fontWeight: '600', color: c.onAccent, opacity: 0.85, fontVariant: ['tabular-nums'] },
  bus: { gap: 4 },
  route: { fontSize: 17, fontWeight: '800', color: c.onAccent, flex: 1 },
  busNext: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 'auto' },
  busEta: { fontSize: 20, fontWeight: '800', color: c.onAccent, fontVariant: ['tabular-nums'] },
  busNote: { flex: 1 },
  lineBadge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  badges: { flexDirection: 'row', alignItems: 'stretch', gap: 4 },
  limited: { borderWidth: 1.5, borderColor: c.onAccent, borderRadius: 6, paddingHorizontal: 4, justifyContent: 'center' },
  lineText: { fontSize: 15, fontWeight: '800' },
}));
