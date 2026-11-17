// Tabs (Accueil / Mon EDT / Salles / Payer), shown once logged in and onboarded;
// otherwise the onboarding (components/Onboarding). "Payer" only exists with an
// Izly account connected.
import { ActivityIndicator, View } from "react-native";
import { Tabs } from "expo-router/js-tabs";
import { Icon } from "../../components/Icon";
import { SetupSteps, WelcomeStep } from "../../components/Onboarding";
import { useIzlyLinked } from "../../lib/izly";
import { useOnboardingDone } from "../../lib/onboarding";
import { PersonalDataProvider } from "../../lib/personalData";
import { useSession } from "../../lib/sessionContext";
import { makeStyles, useAppTheme } from "../../lib/theme";
import { t } from '../../lib/i18n';

export default function TabsLayout() {
  const { token } = useSession();
  const { colors } = useAppTheme();
  const styles = useStyles();

  const onboarded = useOnboardingDone();
  const izlyLinked = useIzlyLinked();

  if (token === undefined || onboarded === undefined) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.textMuted} />
      </View>
    );
  }
  if (!token) return <WelcomeStep />;
  if (!onboarded) return <SetupSteps />;

  return (
    <PersonalDataProvider>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarStyle: {
            backgroundColor: colors.bg,
            borderTopColor: colors.border,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: t("tabs.home"),
            tabBarIcon: ({ color, size }) => (
              <Icon name="home-5-line" color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="perso"
          options={{
            title: t("tabs.timetable"),
            tabBarIcon: ({ color, size }) => (
              <Icon name="calendar-2-line" color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="salles"
          options={{
            title: t("tabs.rooms"),
            tabBarIcon: ({ color, size }) => (
              <Icon name="building-2-line" color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="pay"
          options={{
            // Hidden (no tab button) without an Izly account: connect one in the settings.
            href: izlyLinked ? undefined : null,
            title: t("tabs.pay"),
            tabBarIcon: ({ color, size }) => (
              <Icon name="wallet-3-line" color={color} size={size} />
            ),
          }}
        />
      </Tabs>
    </PersonalDataProvider>
  );
}

const useStyles = makeStyles((c) => ({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: c.bg },
}));
