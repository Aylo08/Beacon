// Tabs (Accueil / Mon EDT / Salles / Payer), shown only when logged in; otherwise a login prompt.
import { ActivityIndicator, Text, View } from "react-native";
import { router } from "expo-router";
import { Tabs } from "expo-router/js-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "../../components/Icon";
import { PrimaryButton, ThemeToggle } from "../../components/Buttons";
import { PersonalDataProvider } from "../../lib/personalData";
import { useSession } from "../../lib/sessionContext";
import { makeStyles, useAppTheme } from "../../lib/theme";
import { t } from '../../lib/i18n';

export default function TabsLayout() {
  const { token } = useSession();
  const { colors } = useAppTheme();
  const styles = useStyles();

  if (token === undefined) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.textMuted} />
      </View>
    );
  }
  if (!token) return <LoggedOut />;

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

function LoggedOut() {
  const { message } = useSession();
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useAppTheme();
  return (
    <View style={styles.flex}>
      <View
        style={[
          styles.top,
          { paddingTop: insets.top + 8, paddingRight: insets.right + 12 },
        ]}
      >
        <ThemeToggle />
      </View>
      <View style={styles.center}>
        <Icon name="calendar-2-line" size={48} color={colors.text} />
        <Text style={styles.title}>Beacon</Text>
        {message && <Text style={styles.muted}>{message}</Text>}
        <View style={styles.button}>
          <PrimaryButton
            icon="login-box-line"
            label={t("common.signIn")}
            onPress={() => router.push("/login")}
          />
        </View>
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  flex: { flex: 1, backgroundColor: c.bg },
  top: { flexDirection: "row", justifyContent: "flex-end" },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 16,
    backgroundColor: c.bg,
  },
  title: { fontSize: 24, fontWeight: "800", color: c.text },
  muted: { color: c.textMuted, fontSize: 13, textAlign: "center" },
  button: { marginTop: 8 },
}));
