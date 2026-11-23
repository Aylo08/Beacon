// "Payer": Izly account — balance + pay by QR code, counters and history.
// Data and refresh logic: lib/izly/useIzlyAccount; pieces: components/izly/.
import { useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OutlineButton, PrimaryButton } from '../../components/Buttons';
import { Icon } from '../../components/Icon';
import { BalanceCard } from '../../components/izly/BalanceCard';
import { Counters } from '../../components/izly/Counters';
import { OperationHistory } from '../../components/izly/OperationHistory';
import { QrPayModal } from '../../components/izly/QrPayModal';
import { confirmPayment } from '../../lib/payLock';
import { useIzlyAccount } from '../../lib/izly/useIzlyAccount';
import { BRAND, makeStyles, useAppTheme } from '../../lib/theme';
import { t } from '../../lib/i18n';

export default function PayScreen() {
  const styles = useStyles();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { linked, balance, counters, operations, error, pulling, refresh, pull, unlink } = useIzlyAccount();
  const [qrOpen, setQrOpen] = useState(false);

  if (linked === undefined) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.textMuted} />
      </View>
    );
  }

  // The scroll view starts below the status bar so the pull-to-refresh spinner isn't hidden behind it.
  return (
    <View style={[styles.flex, { paddingTop: insets.top }]}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        refreshControl={
          linked ? (
            <RefreshControl refreshing={pulling} onRefresh={pull} tintColor={colors.textMuted} colors={[BRAND.izly]} />
          ) : undefined
        }
      >
        <Text style={styles.title}>{t('pay.title')}</Text>

        {!linked ? (
          <View style={styles.card}>
            <Icon name="wallet-3-line" size={40} color={BRAND.izly} />
            <Text style={styles.cardTitle}>Izly</Text>
            <Text style={styles.hint}>{t('pay.intro')}</Text>
            {error && <Text style={styles.error}>{error}</Text>}
            <PrimaryButton
              icon="login-box-line"
              label={t('pay.signIn')}
              color={BRAND.izly}
              onPress={() => router.push('/izly-login')}
            />
          </View>
        ) : (
          <>
            <BalanceCard
              balance={balance}
              // Face ID / fingerprint / passcode first: no code is requested from Izly unless it succeeds.
              onPay={async () => {
                if (await confirmPayment()) setQrOpen(true);
              }}
            />
            {error && <Text style={styles.error}>{error}</Text>}
            {counters && <Counters counters={counters} />}
            <OperationHistory operations={operations} />
            <View style={styles.footer}>
              <OutlineButton icon="logout-box-r-line" label={t('pay.signOut')} danger onPress={unlink} />
            </View>
            <QrPayModal
              visible={qrOpen}
              onClose={() => {
                setQrOpen(false);
                refresh(); // a payment may just have happened
              }}
            />
          </>
        )}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  flex: { flex: 1, backgroundColor: c.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg },
  content: { padding: 16, paddingTop: 12, paddingBottom: 32, gap: 14, width: '100%', maxWidth: 720, alignSelf: 'center' },
  title: { fontSize: 28, fontWeight: '800', color: c.text },
  card: { alignItems: 'center', gap: 10, padding: 20, borderRadius: 14, borderWidth: 1, borderColor: c.border },
  cardTitle: { fontSize: 20, fontWeight: '700', color: c.text },
  hint: { fontSize: 13, color: c.textMuted, textAlign: 'center' },
  error: { color: c.danger, fontSize: 13, textAlign: 'center' },
  footer: { marginTop: 10 },
}));
