// Izly balance (pink card) with the "Payer par QR code" button.
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { formatEuros, type IzlyBalance } from '../../lib/izly';
import { BRAND, makeStyles } from '../../lib/theme';
import { Icon } from '../Icon';

export function BalanceCard({ balance, onPay }: { balance: IzlyBalance | null; onPay: () => void }) {
  const styles = useStyles();
  return (
    <View style={styles.card}>
      <Text style={styles.label}>SOLDE IZLY</Text>
      {balance ? (
        <Text style={styles.amount} accessibilityLabel={`Solde ${formatEuros(balance.amount)}`}>
          {formatEuros(balance.amount)}
        </Text>
      ) : (
        <ActivityIndicator color="#fff" style={styles.spinner} />
      )}
      {balance?.asOf && <Text style={styles.date}>au {balance.asOf}</Text>}
      <Pressable onPress={onPay} accessibilityRole="button" style={({ pressed }) => [styles.pay, pressed && styles.dim]}>
        <Icon name="qr-code-line" size={20} color={BRAND.izly} />
        <Text style={styles.payText}>Payer par QR code</Text>
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  card: { alignItems: 'center', gap: 4, padding: 20, paddingTop: 24, borderRadius: 18, backgroundColor: BRAND.izly },
  label: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '700', letterSpacing: 1 },
  amount: { color: '#fff', fontSize: 44, fontWeight: '800', fontVariant: ['tabular-nums'] },
  spinner: { marginVertical: 18 },
  date: { color: 'rgba(255,255,255,0.85)', fontSize: 13 },
  pay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 999,
  },
  payText: { color: BRAND.izly, fontSize: 16, fontWeight: '700' },
  dim: { opacity: 0.8 },
}));
