// "Carte étudiant": shows the cached digital student card; signs in to the ENT
// to fetch (or refresh) it when needed.
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Text, useWindowDimensions, View } from 'react-native';
import { Stack } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton, PrimaryButton } from '../components/Buttons';
import { EntCardFetcher } from '../components/EntCardFetcher';
import { FullscreenBarcode } from '../components/FullscreenBarcode';
import { StudentCardView } from '../components/StudentCardView';
import { barcodeValue, loadStudentCard, saveStudentCard, type StudentCard } from '../lib/studentCard';
import { makeStyles, useAppTheme } from '../lib/theme';
import { intlLocale, t } from '../lib/i18n';

export default function CardScreen() {
  const styles = useStyles();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const headerHeight = useHeaderHeight();
  // undefined while reading the cache.
  const [card, setCard] = useState<StudentCard | null | undefined>(undefined);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [barcodeOpen, setBarcodeOpen] = useState(false);

  useEffect(() => {
    loadStudentCard().then((c) => {
      setCard(c);
      if (!c) setFetching(true);
    });
  }, []);

  const startFetch = () => {
    setError(null);
    setFetching(true);
  };

  const header = (
    <Stack.Screen
      options={{
        headerRight: () =>
          fetching ? (
            card ? <IconButton icon="close-line" label={t('card.cancel')} onPress={() => setFetching(false)} /> : null
          ) : (
            <IconButton icon="refresh-line" label={t('card.refresh')} onPress={startFetch} />
          ),
      }}
    />
  );

  if (fetching) {
    return (
      <>
        {header}
        <EntCardFetcher
          onResult={async (info, photo) => {
            try {
              setCard(await saveStudentCard(info, photo));
            } catch (e) {
              setError(String(e));
            }
            setFetching(false);
          }}
          onError={(message) => {
            setError(message);
            setFetching(false);
          }}
        />
      </>
    );
  }

  if (card === undefined) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.textMuted} />
      </View>
    );
  }

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
      {error && <Text style={styles.error}>{t('card.fetchError', { error })}</Text>}
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
        <PrimaryButton icon="login-box-line" label={t('card.signInEnt')} onPress={startFetch} />
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  flex: { flex: 1, backgroundColor: c.bg },
  content: { alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg },
  muted: { color: c.textMuted, fontSize: 13, textAlign: 'center' },
  error: { color: c.danger, fontSize: 14, textAlign: 'center' },
}));
