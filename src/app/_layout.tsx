import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SessionProvider } from '../lib/sessionContext';
import { AppThemeProvider, useAppTheme } from '../lib/theme';

export default function RootLayout() {
  return (
    <AppThemeProvider>
      <SessionProvider>
        <ThemedStack />
      </SessionProvider>
    </AppThemeProvider>
  );
}

function ThemedStack() {
  const { scheme, colors } = useAppTheme();
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  // Navigation theme drives native headers, the tab bar and screen backgrounds.
  const navTheme = {
    ...base,
    colors: {
      ...base.colors,
      background: colors.bg,
      card: colors.bg,
      text: colors.text,
      border: colors.border,
      primary: colors.primary,
    },
  };

  return (
    <ThemeProvider value={navTheme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'Beacon' }} />
        <Stack.Screen name="login" options={{ title: 'Connexion' }} />
      </Stack>
    </ThemeProvider>
  );
}
