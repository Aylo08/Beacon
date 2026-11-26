// One trip in a line or two: departure → arrival times, duration, wait, the lines
// (badges) and the changes. Pressable: the Bus widget opens the full trip with it,
// the trip screen switches to another option.
import { Fragment } from 'react';
import { Pressable, Text, View } from 'react-native';
import { t, tn } from '../lib/i18n';
import type { Journey, RideLeg } from '../lib/journey';
import { makeStyles, useAppTheme } from '../lib/theme';
import { formatDuration, formatTime } from '../lib/time';
import { Icon } from './Icon';
import { LineBadge } from './LineBadge';

/** "Maintenant", "12 min", or the time when an hour or more away. */
export function waitLabel(at: number, now: number) {
  const mins = Math.max(0, Math.round((at - now) / 60_000));
  return mins === 0 ? t('bus.now') : mins < 60 ? t('duration.min', { m: mins }) : formatTime(at);
}

type Props = {
  journey: Journey;
  now: number;
  onPress: () => void;
  /** Spoken hint of the press. */
  hint: string;
  selected?: boolean;
};

export function TripSummary({ journey, now, onPress, hint, selected }: Props) {
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
      onPress={onPress}
      style={({ pressed }) => [styles.trip, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityHint={hint}
      accessibilityLabel={t('bus.trip.a11y', {
        departure: formatTime(journey.departure),
        arrival: formatTime(journey.arrival),
        duration,
        lines: lines || t('bus.trip.walk'),
        transfers: changes,
      })}
    >
      <View style={styles.top}>
        <Text style={[styles.times, selected && styles.selected]}>
          {formatTime(journey.departure)} → {formatTime(journey.arrival)}
          <Text style={styles.duration}> · {duration}</Text>
        </Text>
        <Text style={styles.wait}>{rides.length ? waitLabel(journey.departure, now) : ''}</Text>
      </View>
      <View style={styles.lines}>
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
        <Text style={styles.changes} numberOfLines={1}>
          {changes}
        </Text>
        {selected ? (
          <Icon name="check-line" size={18} color={colors.primary} />
        ) : (
          <Icon name="arrow-right-s-line" size={18} color={colors.textMuted} />
        )}
      </View>
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  trip: { gap: 4 },
  pressed: { opacity: 0.6 },
  top: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  times: { flex: 1, fontSize: 15, fontWeight: '700', color: c.text, fontVariant: ['tabular-nums'] },
  selected: { color: c.primary },
  duration: { fontSize: 13, fontWeight: '400', color: c.textMuted },
  wait: { fontSize: 15, fontWeight: '700', color: c.text, fontVariant: ['tabular-nums'] },
  lines: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  changes: { flex: 1, fontSize: 12, color: c.textMuted },
}));
