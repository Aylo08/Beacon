// "Réglages": theme, bus stops, account. The "Développement" section only
// exists in development builds (`__DEV__` is false and dropped in release).
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View, Platform } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemePicker } from '../components/Buttons';
import { BusSettings } from '../components/BusSettings';
import { Icon } from '../components/Icon';
import { setDebugPanel, useDebug } from '../lib/debugOverride';
import { useSession } from '../lib/sessionContext';
import { makeStyles, useAppTheme } from '../lib/theme';

export default function SettingsScreen() {
  const styles = useStyles();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { signOut } = useSession();
  const { panel } = useDebug();

  return (
    <ScrollView
      style={styles.flex}
      // The native header is translucent on iOS: inset the content below it.
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[styles.content, { paddingBottom: (Platform.OS === 'ios' ? 0 : insets.bottom) + 24 }]}
    >
      <Section title="Apparence">
        <ThemePicker />
      </Section>

      <Section>
        <BusSettings />
      </Section>

      <Section title="Compte">
        <Pressable
          onPress={async () => {
            await signOut();
            router.dismissAll();
          }}
          accessibilityRole="button"
          style={({ pressed }) => [styles.logout, pressed && styles.pressed]}
        >
          <Icon name="logout-box-r-line" size={18} color={colors.danger} />
          <Text style={styles.logoutText}>Se déconnecter</Text>
        </Pressable>
      </Section>

      {__DEV__ && (
        <Section title="Développement">
          <View style={styles.row}>
            <Icon name="bug-line" size={18} color={colors.primary} />
            <View style={styles.flex1}>
              <Text style={styles.label}>Panneau de debug</Text>
              <Text style={styles.hint}>Affiche en haut de l’accueil des scénarios pour forcer la barre « maintenant ».</Text>
            </View>
            <Switch value={panel} onValueChange={setDebugPanel} />
          </View>
        </Section>
      )}
    </ScrollView>
  );
}

function Section({ title, children }: { title?: string; children: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.card}>
      {title && <Text style={styles.cardTitle}>{title}</Text>}
      {children}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  flex: { flex: 1, backgroundColor: c.bg },
  flex1: { flex: 1 },
  content: { padding: 16, gap: 14, width: '100%', maxWidth: 720, alignSelf: 'center' },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
    borderRadius: 14,
    padding: 12,
    gap: 12,
    backgroundColor: c.bg,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: c.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  label: { fontSize: 14, fontWeight: '600', color: c.text },
  hint: { fontSize: 12, color: c.textMuted },
  pressed: { backgroundColor: c.pressed },
  logout: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.danger,
  },
  logoutText: { color: c.danger, fontSize: 15, fontWeight: '600' },
}));
