// "Réglages": theme and language, bus stops, account. The "Développement" section only
// exists in development builds (`__DEV__` is false and dropped in release).
import { useState, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OutlineButton, Segmented, ThemePicker } from '../components/Buttons';
import { BusSettings } from '../components/BusSettings';
import { Icon } from '../components/Icon';
import { OptionSheet } from '../components/OptionSheet';
import { setDebugPanel, useDebug } from '../lib/debugOverride';
import { useSession } from '../lib/sessionContext';
import { makeStyles, useAppTheme } from '../lib/theme';
import {
  CLASSICAL_LANGS,
  LANGUAGE_NAMES,
  setForcedLang,
  setUserLang,
  t,
  useForcedLang,
  useUserLang,
  type Lang,
} from '../lib/i18n';

export default function SettingsScreen() {
  const styles = useStyles();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { signOut } = useSession();
  const { panel } = useDebug();
  const forcedLang = useForcedLang();
  const userLang = useUserLang();
  const [debugLangOpen, setDebugLangOpen] = useState(false);

  return (
    <ScrollView
      style={styles.flex}
      // The native header is translucent on iOS: inset the content below it.
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[styles.content, { paddingBottom: (Platform.OS === 'ios' ? 0 : insets.bottom) + 24 }]}
    >
      <Section title={t('settings.appearance')}>
        <ThemePicker />
        <Text style={styles.label}>{t('settings.language')}</Text>
        <Segmented
          options={[
            { value: 'system', label: t('settings.languageSystem') },
            // Each language under its own name, whatever the current one.
            ...CLASSICAL_LANGS.map((l) => ({ value: l, label: LANGUAGE_NAMES[l] })),
          ]}
          value={userLang ?? 'system'}
          onChange={(v) => setUserLang(v === 'system' ? null : v)}
        />
      </Section>

      <Section>
        <BusSettings />
      </Section>

      <Section title={t('settings.account')}>
        <OutlineButton
          icon="logout-box-r-line"
          label={t('settings.signOut')}
          danger
          onPress={async () => {
            await signOut();
            router.dismissAll();
          }}
        />
      </Section>

      {__DEV__ && (
        <Section title={t('settings.dev')}>
          <View style={styles.row}>
            <Icon name="bug-line" size={18} color={colors.primary} />
            <View style={styles.flex1}>
              <Text style={styles.label}>{t('settings.debugPanel')}</Text>
              <Text style={styles.hint}>{t('settings.debugHint')}</Text>
            </View>
            <Switch value={panel} onValueChange={setDebugPanel} />
          </View>
          <Pressable
            onPress={() => setDebugLangOpen(true)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <Icon name="global-line" size={18} color={colors.primary} />
            <View style={styles.flex1}>
              <Text style={styles.label}>{t('settings.language')}</Text>
              <Text style={styles.hint}>{t('settings.debugLangHint')}</Text>
            </View>
            <Text style={styles.value} numberOfLines={1}>
              {forcedLang ? LANGUAGE_NAMES[forcedLang] : t('settings.languageSystem')}
            </Text>
            <Icon name="arrow-right-s-line" size={20} color={colors.textMuted} />
          </Pressable>
          <OptionSheet
            visible={debugLangOpen}
            title={t('settings.language')}
            options={[
              { value: 'system', label: t('settings.languageSystem') },
              ...(Object.keys(LANGUAGE_NAMES) as Lang[]).map((l) => ({ value: l, label: LANGUAGE_NAMES[l], detail: l })),
            ]}
            value={forcedLang ?? 'system'}
            onSelect={(v) => {
              setForcedLang(v === 'system' ? null : (v as Lang));
              setDebugLangOpen(false);
            }}
            onClose={() => setDebugLangOpen(false)}
          />
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
  value: { fontSize: 14, color: c.textSecondary, maxWidth: 120 },
  pressed: { opacity: 0.6 },
}));
