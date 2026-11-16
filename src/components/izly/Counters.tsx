// Izly counters (Crédits Izly, Repas sociaux, Points fidélité) as a row of tiles.
import { Text, View } from 'react-native';
import type { IzlyCounter } from '../../lib/izly';
import { makeStyles } from '../../lib/theme';

export function Counters({ counters }: { counters: IzlyCounter[] }) {
  const styles = useStyles();
  if (counters.length === 0) return null;
  return (
    <View style={styles.row}>
      {counters.map((c) => (
        <View key={c.typeId} style={styles.tile} accessible accessibilityLabel={`${c.label} : ${c.value}`}>
          <Text style={styles.value}>{c.value}</Text>
          <Text style={styles.label} numberOfLines={2}>
            {c.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  row: { flexDirection: 'row', gap: 10 },
  tile: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.border,
  },
  value: { fontSize: 18, fontWeight: '800', color: c.text, fontVariant: ['tabular-nums'] },
  label: { fontSize: 12, color: c.textMuted, textAlign: 'center' },
}));
