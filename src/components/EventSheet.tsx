// Details of a class: subject, time, room, teachers, groups…
import { StyleSheet, Text, View } from 'react-native';
import type { RoomEvent } from '../lib/edt';
import { parseTitle } from '../lib/events';
import { eventColors, makeStyles, useAppTheme } from '../lib/theme';
import { dayLabel, formatMinutes, parisParts } from '../lib/time';
import { Icon, type IconName } from './Icon';
import { Sheet } from './Sheet';
import { t } from '../lib/i18n';

const FIELD_ICONS: Record<string, IconName> = {
  Salle: 'map-pin-2-line',
  Salles: 'map-pin-2-line',
  Enseignant: 'user-line',
  Enseignants: 'user-line',
  TD: 'group-line',
  Promotion: 'group-line',
  Promotions: 'group-line',
};

export function EventSheet({ event, onClose }: { event: RoomEvent | null; onClose: () => void }) {
  return <Sheet visible={!!event} onClose={onClose}>{event && <Details event={event} />}</Sheet>;
}

function Details({ event }: { event: RoomEvent }) {
  const styles = useStyles();
  const { colors } = useAppTheme();
  const c = eventColors(colors, event.type);
  const fields = parseTitle(event.title);
  const subject = fields.find((f) => f.key === 'Matière')?.value ?? fields[0]?.key ?? t('event.class');
  const start = parisParts(new Date(event.start));
  const end = parisParts(new Date(event.end));
  const rest = fields.filter((f) => f.key !== 'Matière' && f.key !== 'Type' && f.value);

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        {!!event.type && (
          <View style={[styles.badge, { backgroundColor: c.bg, borderColor: c.border }]}>
            <Text style={[styles.badgeText, { color: c.text }]}>{event.type}</Text>
          </View>
        )}
        <Text style={[styles.subject, event.type === 'Annulation' && styles.cancelled]}>{subject}</Text>
      </View>

      <Row icon="time-line">
        {dayLabel(start.day)} · {formatMinutes(start.minutes)}–
        {start.day === end.day ? formatMinutes(end.minutes) : `${dayLabel(end.day)} ${formatMinutes(end.minutes)}`}
      </Row>
      {rest.map((f, i) => (
        <Row key={i} icon={FIELD_ICONS[f.key] ?? 'book-open-line'} label={FIELD_ICONS[f.key] ? undefined : f.key}>
          {f.value}
        </Row>
      ))}
      {!!event.memo && <Row icon="book-open-line">{event.memo}</Row>}
    </View>
  );
}

function Row({ icon, label, children }: { icon: IconName; label?: string; children: React.ReactNode }) {
  const styles = useStyles();
  const { colors } = useAppTheme();
  return (
    <View style={styles.row}>
      <Icon name={icon} size={18} color={colors.textMuted} />
      <Text style={styles.rowText} selectable>
        {label ? <Text style={styles.rowLabel}>{label} : </Text> : null}
        {children}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: { gap: 10, padding: 4 },
  head: { gap: 8, marginBottom: 4 },
  badge: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  subject: { fontSize: 18, fontWeight: '700', color: c.text },
  cancelled: { textDecorationLine: 'line-through', color: c.textMuted },
  row: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
  },
  rowText: { flex: 1, fontSize: 14, color: c.text },
  rowLabel: { fontWeight: '600', color: c.textSecondary },
}));
