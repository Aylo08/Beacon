// First-launch onboarding, shown by the tabs layout instead of the app:
//  1. "welcome" — what Beacon is, privacy, university login (required; shown
//     again whenever the user is logged out);
//  2. "izly"    — optional Izly login;
//  3. "prefs"   — appearance and language, home / Agroparc stops, location.
// Steps 2–3 run once per device (lib/onboarding).
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t } from '../lib/i18n';
import { useIzlyLinked } from '../lib/izly';
import { completeOnboarding } from '../lib/onboarding';
import { useSession } from '../lib/sessionContext';
import { BRAND, makeStyles, useAppTheme } from '../lib/theme';
import { BusSettings } from './BusSettings';
import { PrimaryButton, ThemePicker } from './Buttons';
import { Icon, type IconName } from './Icon';
import { LanguagePicker } from './LanguagePicker';

const STEPS = 3;

/** The university login step (when logged out). */
export function WelcomeStep() {
  const { message } = useSession();
  const styles = useStyles();
  const { colors } = useAppTheme();
  return (
    <Frame
      step={1}
      footer={<PrimaryButton icon="login-box-line" label={t('onboarding.uniLogin')} onPress={() => router.push('/login')} />}
    >
      <Icon name="calendar-2-line" size={48} color={colors.primary} />
      <Text style={styles.title}>{t('onboarding.welcomeTitle')}</Text>
      <Text style={styles.body}>{t('onboarding.welcomeBody')}</Text>
      <Feature icon="calendar-2-line" text={t('onboarding.featureTimetable')} />
      <Feature icon="building-2-line" text={t('onboarding.featureRooms')} />
      <Feature icon="bus-line" text={t('onboarding.featureBus')} />
      <Feature icon="wallet-3-line" text={t('onboarding.featureIzly')} />
      <Privacy text={t('onboarding.privacy')} />
      {message && <Text style={styles.warning}>{message}</Text>}
    </Frame>
  );
}

/** Steps 2 (Izly) and 3 (preferences), once logged in. */
export function SetupSteps() {
  const [step, setStep] = useState<'izly' | 'prefs'>('izly');
  return step === 'izly' ? <IzlyStep onNext={() => setStep('prefs')} /> : <PrefsStep onBack={() => setStep('izly')} />;
}

function IzlyStep({ onNext }: { onNext: () => void }) {
  const styles = useStyles();
  const { colors } = useAppTheme();
  const linked = useIzlyLinked();
  return (
    <Frame
      step={2}
      footer={
        linked ? (
          <PrimaryButton label={t('onboarding.continue')} onPress={onNext} />
        ) : (
          <>
            <PrimaryButton icon="login-box-line" label={t('pay.signIn')} color={BRAND.izly} onPress={() => router.push('/izly-login')} />
            <Pressable onPress={onNext} accessibilityRole="button" hitSlop={8} style={styles.skip}>
              <Text style={styles.skipText}>{t('onboarding.skip')}</Text>
            </Pressable>
          </>
        )
      }
    >
      <Icon name="wallet-3-line" size={48} color={BRAND.izly} />
      <Text style={styles.title}>{t('onboarding.izlyTitle')}</Text>
      <Text style={styles.body}>{t('onboarding.izlyBody')}</Text>
      {linked && (
        <View style={styles.done}>
          <Icon name="check-line" size={18} color={colors.freeText} />
          <Text style={styles.doneText}>{t('settings.izlyLinked')}</Text>
        </View>
      )}
      <Privacy text={t('onboarding.izlyPrivacy')} />
    </Frame>
  );
}

type Permission = 'unknown' | 'granted' | 'denied' | 'asking';

function PrefsStep({ onBack }: { onBack: () => void }) {
  const styles = useStyles();
  const { colors } = useAppTheme();
  const [permission, setPermission] = useState<Permission>('unknown');

  useEffect(() => {
    Location.getForegroundPermissionsAsync()
      .then((p) => setPermission(p.granted ? 'granted' : p.canAskAgain ? 'unknown' : 'denied'))
      .catch(() => {});
  }, []);

  const ask = useCallback(async () => {
    setPermission('asking');
    try {
      const p = await Location.requestForegroundPermissionsAsync();
      setPermission(p.granted ? 'granted' : 'denied');
    } catch {
      setPermission('denied');
    }
  }, []);

  return (
    <Frame
      step={3}
      onBack={onBack}
      footer={<PrimaryButton icon="check-line" label={t('onboarding.finish')} onPress={completeOnboarding} />}
    >
      <Text style={styles.title}>{t('onboarding.prefsTitle')}</Text>
      <Text style={styles.body}>{t('onboarding.prefsBody')}</Text>

      <Card title={t('settings.appearance')}>
        <ThemePicker />
        <Text style={styles.label}>{t('settings.language')}</Text>
        <LanguagePicker />
      </Card>

      <Card>
        <BusSettings />
      </Card>

      <Card title={t('onboarding.locationTitle')}>
        <Text style={styles.hint}>{t('onboarding.locationBody')}</Text>
        {permission === 'granted' ? (
          <View style={styles.done}>
            <Icon name="check-line" size={18} color={colors.freeText} />
            <Text style={styles.doneText}>{t('onboarding.locationGranted')}</Text>
          </View>
        ) : permission === 'denied' ? (
          <Text style={styles.hint}>{t('onboarding.locationDenied')}</Text>
        ) : permission === 'asking' ? (
          <ActivityIndicator color={colors.textMuted} />
        ) : (
          <PrimaryButton icon="focus-3-line" label={t('onboarding.locationAllow')} onPress={ask} />
        )}
      </Card>
    </Frame>
  );
}

// ---- Layout pieces ---------------------------------------------------------

function Frame({ step, onBack, footer, children }: { step: number; onBack?: () => void; footer: ReactNode; children: ReactNode }) {
  const styles = useStyles();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.flex, { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }]}>
      <View style={styles.top}>
        {onBack ? (
          <Pressable onPress={onBack} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('onboarding.back')}>
            <Icon name="arrow-left-s-line" size={26} color={colors.textSecondary} />
          </Pressable>
        ) : (
          <View style={styles.backSpacer} />
        )}
        <View style={styles.dots} accessible accessibilityLabel={t('onboarding.step', { n: step, total: STEPS })}>
          {Array.from({ length: STEPS }, (_, i) => (
            <View key={i} style={[styles.dot, i + 1 === step && styles.dotOn]} />
          ))}
        </View>
        <View style={styles.backSpacer} />
      </View>
      <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
        {children}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>{footer}</View>
    </View>
  );
}

function Feature({ icon, text }: { icon: IconName; text: string }) {
  const styles = useStyles();
  const { colors } = useAppTheme();
  return (
    <View style={styles.feature}>
      <Icon name={icon} size={20} color={colors.primary} />
      <Text style={styles.featureText}>{text}</Text>
    </View>
  );
}

function Privacy({ text }: { text: string }) {
  const styles = useStyles();
  const { colors } = useAppTheme();
  return (
    <View style={styles.privacy}>
      <Icon name="lock-line" size={20} color={colors.freeText} />
      <Text style={styles.privacyText}>{text}</Text>
    </View>
  );
}

function Card({ title, children }: { title?: string; children: ReactNode }) {
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
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
  backSpacer: { width: 26 },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.border },
  dotOn: { width: 22, backgroundColor: c.primary },
  content: { padding: 20, gap: 14, width: '100%', maxWidth: 560, alignSelf: 'center', alignItems: 'stretch' },
  title: { fontSize: 26, fontWeight: '800', color: c.text },
  body: { fontSize: 15, lineHeight: 21, color: c.textSecondary },
  feature: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  featureText: { flex: 1, fontSize: 15, color: c.text },
  privacy: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: 12, backgroundColor: c.free },
  privacyText: { flex: 1, fontSize: 13, lineHeight: 18, color: c.freeText },
  warning: { fontSize: 13, color: c.danger, textAlign: 'center' },
  done: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  doneText: { fontSize: 14, fontWeight: '600', color: c.freeText },
  card: { borderWidth: 1, borderColor: c.border, borderRadius: 14, padding: 12, gap: 12 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: c.text },
  label: { fontSize: 14, fontWeight: '600', color: c.text },
  hint: { fontSize: 13, color: c.textMuted },
  footer: { paddingHorizontal: 20, paddingTop: 12, gap: 10, width: '100%', maxWidth: 560, alignSelf: 'center' },
  skip: { alignSelf: 'center', paddingVertical: 6 },
  skipText: { fontSize: 15, fontWeight: '600', color: c.textSecondary },
}));
