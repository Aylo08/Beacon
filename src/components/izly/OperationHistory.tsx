// Izly history: filter chips (all / payments / top-ups / transfers) and the
// operations grouped by day.
import { memo, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { formatEuros, type IzlyOperation, type OperationKind } from '../../lib/izly';
import { makeStyles, useAppTheme } from '../../lib/theme';
import { addDays, dateLabel, todayKey } from '../../lib/time';
import { Icon, type IconName } from '../Icon';

type Filter = 'all' | OperationKind;
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Tout' },
  { id: 'payment', label: 'Paiements' },
  { id: 'topup', label: 'Rechargements' },
  { id: 'transfer', label: 'Virements' },
];
const KIND_ICON: Record<OperationKind, IconName> = {
  topup: 'add-circle-line',
  payment: 'shopping-bag-3-line',
  transfer: 'bank-line',
};
const CREDIT = '#16a34a';

export function OperationHistory({ operations }: { operations: IzlyOperation[] | null }) {
  const styles = useStyles();
  const { colors } = useAppTheme();
  const [filter, setFilter] = useState<Filter>('all');

  const groups = useMemo(() => {
    const out: { day: string; items: IzlyOperation[] }[] = [];
    for (const o of operations ?? []) {
      if (filter !== 'all' && o.kind !== filter) continue;
      if (out.at(-1)?.day !== o.day) out.push({ day: o.day, items: [] });
      out.at(-1)!.items.push(o);
    }
    return out;
  }, [operations, filter]);

  return (
    <>
      <Text style={styles.title}>Historique</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {FILTERS.map((f) => {
          const selected = f.id === filter;
          return (
            <Pressable
              key={f.id}
              onPress={() => setFilter(f.id)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={[styles.chip, selected && styles.chipSelected]}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{f.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {operations === null ? (
        <ActivityIndicator color={colors.textMuted} />
      ) : groups.length === 0 ? (
        <Text style={styles.empty}>Aucune opération</Text>
      ) : (
        groups.map((g) => (
          <View key={g.day} style={styles.group}>
            <Text style={styles.day}>{relativeDay(g.day)}</Text>
            <View style={styles.list}>
              {g.items.map((o, i) => (
                <OperationRow key={`${o.kind}-${o.time}-${i}`} op={o} first={i === 0} />
              ))}
            </View>
          </View>
        ))
      )}
    </>
  );
}

const OperationRow = memo(function OperationRow({ op, first }: { op: IzlyOperation; first: boolean }) {
  const styles = useStyles();
  const { colors } = useAppTheme();
  const credit = op.amount > 0;
  const amount = `${credit ? '+' : ''}${formatEuros(op.amount)}`;
  return (
    <View
      style={[styles.row, !first && styles.rowBorder]}
      accessible
      accessibilityLabel={`${op.label}, ${op.time}, ${amount}${op.status !== 'success' ? `, ${op.statusText}` : ''}`}
    >
      <View style={[styles.icon, credit && styles.iconCredit]}>
        <Icon name={KIND_ICON[op.kind]} size={20} color={credit ? colors.onAccent : colors.textSecondary} />
      </View>
      <View style={styles.flex1}>
        <Text style={styles.label} numberOfLines={1}>
          {op.label}
        </Text>
        <Text style={styles.time}>{op.time}</Text>
      </View>
      <View style={styles.right}>
        <Text style={[styles.amount, credit && styles.amountCredit]}>{amount}</Text>
        {op.status !== 'success' && (
          <Text style={[styles.status, op.status === 'refunded' ? styles.statusRefunded : styles.statusPending]}>
            {op.statusText}
          </Text>
        )}
      </View>
    </View>
  );
});

/** "Aujourd'hui", "Hier", "Lundi 16 novembre" (+ year when not the current one) */
function relativeDay(day: string) {
  const today = todayKey();
  if (day === today) return "Aujourd'hui";
  if (day === addDays(today, -1)) return 'Hier';
  return day.slice(0, 4) === today.slice(0, 4) ? dateLabel(day) : `${dateLabel(day)} ${day.slice(0, 4)}`;
}

const useStyles = makeStyles((c) => ({
  flex1: { flex: 1 },
  title: { fontSize: 20, fontWeight: '800', color: c.text, marginTop: 6 },
  empty: { fontSize: 13, color: c.textMuted, textAlign: 'center' },
  chips: { gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: c.border },
  chipSelected: { backgroundColor: c.text, borderColor: c.text },
  chipText: { fontSize: 14, fontWeight: '600', color: c.textSecondary },
  chipTextSelected: { color: c.bg },
  group: { gap: 6 },
  day: { fontSize: 13, fontWeight: '700', color: c.textMuted },
  list: { borderRadius: 12, borderWidth: 1, borderColor: c.border, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10 },
  rowBorder: { borderTopWidth: 1, borderTopColor: c.border },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: c.pressed },
  iconCredit: { backgroundColor: CREDIT },
  label: { fontSize: 15, fontWeight: '600', color: c.text },
  time: { fontSize: 12, color: c.textMuted, fontVariant: ['tabular-nums'] },
  right: { alignItems: 'flex-end', gap: 2 },
  amount: { fontSize: 15, fontWeight: '700', color: c.text, fontVariant: ['tabular-nums'] },
  amountCredit: { color: CREDIT },
  status: { fontSize: 11, fontWeight: '600', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, overflow: 'hidden' },
  statusPending: { backgroundColor: c.pressed, color: c.textSecondary },
  statusRefunded: { backgroundColor: '#fef3c7', color: '#92400e' },
}));
