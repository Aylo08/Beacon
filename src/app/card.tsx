// "Carte étudiant": shows the cached digital student card. Fetching / refreshing
// happens in the background with the saved credentials (lib/studentCard.ts) while
// the current card stays on screen; the ENT login page (EntCardFetcher) is only
// used when there are no usable saved credentials.
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Text, useWindowDimensions, View } from 'react-native';
import { Stack } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton, PrimaryButton } from '../components/Buttons';
import { EntCardFetcher } from '../components/EntCardFetcher';
import { FullscreenBarcode } from '../components/FullscreenBarcode';
import { StudentCardView } from '../components/StudentCardView';
import {
  barcodeValue,
  loadStudentCard,
  refreshStudentCard,
  saveStudentCard,
  studentCardState,
  useStudentCard,
} from '../lib/studentCard';
import { makeStyles, useAppTheme } from '../lib/theme';
import { intlLocale, t } from '../lib/i18n';

export default function CardScreen() {
  const styles = useStyles();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const headerHeight = useHeaderHeight();
  const { card, refreshing, photoLoading, error, needsLogin } = useStudentCard();
  // Signing in through the ENT page (no usable saved credentials).
  const [entLogin, setEntLogin] = useState(false);
  const [entError, setEntError] = useState<string | null>(null);
  const [barcodeOpen, setBarcodeOpen] = useState(false);

  useEffect(() => {
    loadStudentCard().then(() => {
      if (!studentCardState().card) refreshStudentCard();
    });
  }, []);

  const refresh = () => {
    setEntError(null);
    if (needsLogin) setEntLogin(true);
    else refreshStudentCard();
  };

  const header = (
    <Stack.Screen
      options={{
        headerRight: () =>
          entLogin ? (
            <IconButton icon="close-line" label={t('card.cancel')} onPress={() => setEntLogin(false)} />
          ) : refreshing || photoLoading ? (
            <ActivityIndicator color={colors.textMuted} />
          ) : (
            <IconButton icon="refresh-line" label={t('card.refresh')} onPress={refresh} />
          ),
      }}
    />
  );

  if (entLogin) {
    return (
      <>
        {header}
        <EntCardFetcher
          onResult={(info) => {
            setEntLogin(false);
            saveStudentCard(info).catch((e) => setEntError(String(e)));
          }}
          onError={(message) => {
            setEntError(message);
            setEntLogin(false);
          }}
        />
      </>
    );
  }

  if (card === undefined || (card === null && refreshing)) {
    return (
      <View style={styles.center}>
        {header}
        <ActivityIndicator color={colors.textMuted} />
        {card === null && <Text style={styles.muted}>{t('card.fetching')}</Text>}
      </View>
    );
  }

  const shownError = entError ?? error;
  const cardWidth = Math.min(width - insets.left - insets.right - 32, 640);
  return (
    // Not scrollable: everything fits, centred in the space below the header
    // (translucent on iOS, so the content starts under it there).
    <View
      style={[
        styles.flex,
        styles.content,
        { paddingTop: (Platform.OS === 'ios' ? headerHeight : 0) + 16, paddingBottom: insets.bottom + 16 },
      ]}
    >
      {header}
      {card && <StudentCardView card={card} width={cardWidth} />}
      {card?.photoMissing && <Text style={styles.warning}>{t('card.photoUnavailable')}</Text>}
      {shownError && <Text style={styles.error}>{t('card.fetchError', { error: shownError })}</Text>}
      {card ? (
        <>
          <PrimaryButton icon="barcode-line" label={t('card.showBarcode')} onPress={() => setBarcodeOpen(true)} />
          <Text style={styles.muted}>
            {t('card.updated', { date: new Date(card.fetchedAt).toLocaleDateString(intlLocale()) })}
          </Text>
          <FullscreenBarcode
            value={barcodeValue(card)}
            caption={`${card.lastName} ${card.firstName}`}
            visible={barcodeOpen}
            onClose={() => setBarcodeOpen(false)}
          />
        </>
      ) : (
        <PrimaryButton icon="login-box-line" label={t('card.signInEnt')} onPress={() => setEntLogin(true)} />
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  flex: { flex: 1, backgroundColor: c.bg },
  content: { alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: c.bg },
  muted: { color: c.textMuted, fontSize: 13, textAlign: 'center' },
  error: { color: c.danger, fontSize: 14, textAlign: 'center' },
  warning: { color: c.danger, fontSize: 13, textAlign: 'center', maxWidth: 480 },
}));
