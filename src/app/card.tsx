// "Carte étudiant": shows the cached digital student card; signs in to the ENT
// to fetch (or refresh) it when needed.
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, useWindowDimensions, View, Platform } from 'react-native';
import { Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton } from '../components/Buttons';
import { EntCardFetcher } from '../components/EntCardFetcher';
import { FullscreenBarcode } from '../components/FullscreenBarcode';
import { Icon } from '../components/Icon';
import { StudentCardView } from '../components/StudentCardView';
import { barcodeValue, loadStudentCard, saveStudentCard, type StudentCard } from '../lib/studentCard';
import { makeStyles, useAppTheme } from '../lib/theme';

export default function CardScreen() {
  const styles = useStyles();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
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
            card ? <IconButton icon="close-line" label="Annuler" onPress={() => setFetching(false)} /> : null
          ) : (
            <IconButton icon="refresh-line" label="Actualiser la carte" onPress={startFetch} />
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
    <ScrollView
      style={styles.flex}
      // The native header is translucent on iOS: inset the content below it.
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[styles.content, { paddingBottom: (Platform.OS === 'ios' ? 0 : insets.bottom) + 24 }]}
    >
      {header}
      {card && <StudentCardView card={card} width={cardWidth} />}
      {error && <Text style={styles.error}>Impossible de récupérer la carte : {error}</Text>}
      {card ? (
        <>
          <Pressable
            onPress={() => setBarcodeOpen(true)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          >
            <Icon name="barcode-line" color="#fff" size={18} />
            <Text style={styles.buttonText}>Afficher le code-barres</Text>
          </Pressable>
          <Text style={styles.muted}>
            Mise à jour le {new Date(card.fetchedAt).toLocaleDateString('fr-FR')} · disponible hors connexion
          </Text>
          <FullscreenBarcode
            value={barcodeValue(card)}
            caption={`${card.lastName} ${card.firstName}`}
            visible={barcodeOpen}
            onClose={() => setBarcodeOpen(false)}
          />
        </>
      ) : (
        <Pressable onPress={startFetch} accessibilityRole="button" style={styles.button}>
          <Icon name="login-box-line" color="#fff" size={18} />
          <Text style={styles.buttonText}>Se connecter à l&apos;ENT</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const useStyles = makeStyles((c) => ({
  flex: { flex: 1, backgroundColor: c.bg },
  content: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg },
  muted: { color: c.textMuted, fontSize: 13, textAlign: 'center' },
  error: { color: c.danger, fontSize: 14, textAlign: 'center' },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: c.moved,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
  },
  pressed: { opacity: 0.8 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
}));
