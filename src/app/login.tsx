// Native login: show the real CAS page in a WebView and intercept the redirect
// back to edt.univ-avignon.fr so we capture the ticket before that page uses it.
// The submitted credentials are kept in the Keychain so an expired token can be
// renewed silently (see sessionContext), and so the student card can be fetched
// in the background right after login (lib/studentCard.ts) without blocking here.
import { useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { router } from 'expo-router';
import { CAS_LOGIN_URL, edt, extractTicket } from '../lib/edt';
import { saveCredentials, type Credentials } from '../lib/credentials';
import { useSession } from '../lib/sessionContext';
import { refreshStudentCard } from '../lib/studentCard';
import { allowOnly, trustedMessage } from '../lib/webview';
import { makeStyles, useAppTheme } from '../lib/theme';

// On the CAS page, mark the fields for password AutoFill and report what the user submits so it can be saved in the
// Keychain (only once the login succeeds) for silent re-login later.
const CAPTURE_CREDENTIALS = `(function () {
  if (location.hostname !== 'cas.univ-avignon.fr') return;
  var form = document.querySelector('input[name="password"]') && document.querySelector('input[name="password"]').form;
  if (!form || form.__beacon) return;
  form.__beacon = true;
  // Standard autofill hints so the iOS keyboard offers the Passwords (key) button.
  var user = form.querySelector('input[name="username"]');
  if (user) user.setAttribute('autocomplete', 'username');
  form.querySelector('input[name="password"]').setAttribute('autocomplete', 'current-password');
  form.addEventListener('submit', function () {
    var u = form.querySelector('input[name="username"]'), p = form.querySelector('input[name="password"]');
    if (u && p && u.value && p.value) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'credentials', username: u.value, password: p.value }));
    }
  }, true);
})();
true;`;

const CAS_HOST = 'cas.univ-avignon.fr';
/** Pages this WebView may show (the edt.univ-avignon.fr redirect is intercepted before loading). */
const HOSTS = [CAS_HOST];

type Status = 'cas' | 'exchanging' | { error: string };

export default function Login() {
  const handled = useRef(false);
  const { signIn } = useSession();
  const styles = useStyles();
  const { colors } = useAppTheme();
  const [status, setStatus] = useState<Status>('cas');
  const submitted = useRef<Credentials | null>(null);

  const onTicket = async (ticket: string) => {
    if (handled.current) return;
    handled.current = true;
    setStatus('exchanging');
    try {
      const { token } = await edt.exchangeTicket(ticket);
      if (submitted.current) await saveCredentials(submitted.current);
      submitted.current = null;
      await signIn(token);
    } catch (e) {
      setStatus({ error: String(e) });
      return;
    }
    // Logged in. The student card is fetched in the background (needs the saved credentials).
    refreshStudentCard().catch(() => {});
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const onMessage = (e: WebViewMessageEvent) => {
    const cas = trustedMessage<{ type: 'credentials' } & Credentials>(e, [CAS_HOST]);
    if (cas?.type === 'credentials' && status === 'cas' && typeof cas.username === 'string' && typeof cas.password === 'string') {
      submitted.current = { username: cas.username, password: cas.password };
    }
  };

  return (
    <View style={styles.flex}>
      <WebView
        source={{ uri: CAS_LOGIN_URL }}
        incognito // start from a clean CAS session each time
        injectedJavaScript={CAPTURE_CREDENTIALS}
        onMessage={onMessage}
        onShouldStartLoadWithRequest={(req) => {
          const ticket = extractTicket(req.url);
          if (ticket) {
            onTicket(ticket);
            return false; // block the load so the official app never consumes the ticket
          }
          return allowOnly(req, HOSTS);
        }}
        // Fallback for platforms that don't route redirects through the hook above.
        onNavigationStateChange={(nav) => {
          const ticket = extractTicket(nav.url);
          if (ticket) onTicket(ticket);
        }}
        style={styles.flex}
      />
      {status !== 'cas' && (
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          {typeof status === 'object' ? (
            <Text style={styles.error}>{status.error}</Text>
          ) : (
            <ActivityIndicator color={colors.textMuted} />
          )}
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  flex: { flex: 1, backgroundColor: c.bg },
  center: { alignItems: 'center', justifyContent: 'center', gap: 12, padding: 16, backgroundColor: c.bg },
  error: { color: c.danger },
}));
