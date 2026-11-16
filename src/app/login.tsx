// Native login: show the real CAS page in a WebView and intercept the redirect
// back to edt.univ-avignon.fr so we capture the ticket before that page uses it.
// The same WebView (same CAS session) then goes through CAS again with the ENT
// service, which signs in without asking for the password, to fetch the student card.
// The submitted credentials are kept in the Keychain so an expired token can be
// renewed silently (see sessionContext).
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { router } from 'expo-router';
import { ENT_FETCH_SCRIPT, type EntMessage } from '../components/EntCardFetcher';
import { CAS_LOGIN_URL, edt, ENT_CAS_LOGIN_URL, extractTicket } from '../lib/edt';
import { saveCredentials, type Credentials } from '../lib/credentials';
import { useSession } from '../lib/sessionContext';
import { saveStudentCard } from '../lib/studentCard';
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

/** Give up on the student card after this long: it can be fetched later from its screen. */
const CARD_TIMEOUT_MS = 20_000;

type Status = 'cas' | 'exchanging' | 'card' | { error: string };

export default function Login() {
  const handled = useRef(false);
  const finished = useRef(false);
  const { signIn } = useSession();
  const styles = useStyles();
  const { colors } = useAppTheme();
  const [status, setStatus] = useState<Status>('cas');
  const [uri, setUri] = useState(CAS_LOGIN_URL);
  const submitted = useRef<Credentials | null>(null);

  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  useEffect(() => {
    if (status !== 'card') return;
    const t = setTimeout(finish, CARD_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [status]);

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
    // Logged in. Reuse the CAS session for the ENT to cache the student card.
    setStatus('card');
    setUri(ENT_CAS_LOGIN_URL);
  };

  const onMessage = async (e: WebViewMessageEvent) => {
    let msg: EntMessage | ({ type: 'credentials' } & Credentials);
    try {
      msg = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    if (msg.type === 'credentials') {
      if (status === 'cas') submitted.current = { username: msg.username, password: msg.password };
      return;
    }
    if (status !== 'card') return;
    if (msg.type === 'card') {
      await saveStudentCard(msg.info, msg.photo).catch(() => {});
      finish();
    } else if (msg.type === 'error' || msg.type === 'notSignedIn') {
      finish(); // not blocking: the card screen can retry
    }
  };

  return (
    <View style={styles.flex}>
      <WebView
        source={{ uri }}
        incognito // start from a clean CAS session each time
        injectedJavaScript={CAPTURE_CREDENTIALS + ENT_FETCH_SCRIPT} // each only acts on its own host
        onMessage={onMessage}
        onLoadEnd={(e) => {
          // A CAS page that renders here (instead of redirecting) means SSO didn't apply.
          if (status === 'card' && e.nativeEvent.url.startsWith('https://cas.univ-avignon.fr/')) finish();
        }}
        onShouldStartLoadWithRequest={(req) => {
          const ticket = extractTicket(req.url);
          if (ticket) {
            onTicket(ticket);
            return false; // block the load so the official app never consumes the ticket
          }
          return true;
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
            <>
              <ActivityIndicator color={colors.textMuted} />
              {status === 'card' && <Text style={styles.muted}>Récupération de la carte étudiant…</Text>}
            </>
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
  muted: { color: c.textMuted, fontSize: 14 },
}));
