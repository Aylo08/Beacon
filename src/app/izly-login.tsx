// Izly login: the official mon-espace.izly.fr page in a WebView. We hide its
// cookie banner (Tealium, declined), let the code field accept typing/AutoFill,
// and capture what the user submits. When the form redirects to the home page
// (= Izly accepted the credentials) we block that load and sign in headlessly
// with them (lib/izly.ts) so the app gets its own session; the credentials are
// then kept in the Keychain to renew it.
import { useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { router } from 'expo-router';
import { PrimaryButton } from '../components/Buttons';
import type { Credentials } from '../lib/credentials';
import { IZLY_HOST, IZLY_LOGON_URL, IZLY_ORIGIN, izlySignIn } from '../lib/izly';
import { allowOnly, trustedMessage } from '../lib/webview';
import { makeStyles, useAppTheme } from '../lib/theme';
import { t } from '../lib/i18n';

// Before any page script: keep the consent modal invisible from the first frame.
const HIDE_CONSENT = `(function () {
  if (location.hostname !== 'mon-espace.izly.fr') return;
  var s = document.createElement('style');
  s.textContent = '#__tealiumGDPRecModal,#__tealiumGDPRcpPrefs{display:none!important}' +
    'body.privacy_prompt_overflow_hidden{overflow:auto!important}';
  (document.head || document.documentElement).appendChild(s);
})();
true;`;

const PAGE_SCRIPT = `(function () {
  if (location.hostname !== 'mon-espace.izly.fr' || window.__beacon) return;
  window.__beacon = true;

  // Decline the cookie prompt once Tealium has rendered it (only necessary cookies).
  var tries = 0;
  var timer = setInterval(function () {
    var no = document.getElementById('optout_prompt_submit');
    if (no) no.click();
    document.body && document.body.classList.remove('privacy_prompt_overflow_hidden');
    if (no || ++tries > 40) clearInterval(timer);
  }, 250);

  var user = document.getElementById('Username');
  var pin = document.getElementById('Password');
  if (!user || !pin || !pin.form) return;

  // AutoFill hints (the site sets autocomplete=off) and a typeable code field:
  // the site makes it readonly so the shuffled keypad is the only input.
  user.setAttribute('autocomplete', 'username');
  user.setAttribute('autocapitalize', 'none');
  pin.removeAttribute('readonly');
  pin.setAttribute('autocomplete', 'current-password');
  pin.setAttribute('inputmode', 'numeric');
  pin.setAttribute('pattern', '[0-9]*');

  // The keypad keeps its own copy of the code; make its keys append to the field
  // instead so typed/AutoFilled digits and taps mix correctly.
  document.addEventListener('click', function (e) {
    var key = e.target.closest && e.target.closest('.pin2 .digit');
    if (!key) return;
    e.preventDefault();
    e.stopPropagation();
    if (pin.value.length < 6) pin.value += key.getAttribute('data-id');
  }, true);

  pin.form.addEventListener('submit', function () {
    if (user.value && pin.value) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'credentials', username: user.value.trim(), password: pin.value }));
    }
  }, true);
})();
true;`;

/** The page Izly redirects to after a successful login (ReturnUrl=/). */
function isHome(url: string) {
  try {
    const u = new URL(url);
    return u.origin === IZLY_ORIGIN && u.pathname === '/';
  } catch {
    return false;
  }
}

type Status = 'form' | 'signing' | { error: string };

export default function IzlyLogin() {
  const styles = useStyles();
  const { colors } = useAppTheme();
  const [status, setStatus] = useState<Status>('form');
  const [attempt, setAttempt] = useState(0);
  const submitted = useRef<Credentials | null>(null);
  const handled = useRef(false);

  const onLoggedIn = async () => {
    if (handled.current) return;
    handled.current = true;
    const creds = submitted.current;
    submitted.current = null;
    if (!creds) {
      setStatus({ error: t('izly.credentialsMissing') });
      return;
    }
    setStatus('signing');
    try {
      await izlySignIn(creds);
    } catch (e) {
      setStatus({ error: e instanceof Error ? e.message : String(e) });
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace('/pay');
  };

  const onMessage = (e: WebViewMessageEvent) => {
    const msg = trustedMessage<{ type?: string; username?: unknown; password?: unknown }>(e, [IZLY_HOST]);
    if (msg?.type === 'credentials' && typeof msg.username === 'string' && typeof msg.password === 'string') {
      submitted.current = { username: msg.username, password: msg.password };
    }
  };

  const retry = () => {
    handled.current = false;
    submitted.current = null;
    setStatus('form');
    setAttempt((n) => n + 1); // remounts the WebView on a fresh login page
  };

  return (
    <View style={styles.flex}>
      <WebView
        key={attempt}
        source={{ uri: IZLY_LOGON_URL }}
        incognito // clean Izly session (and no leftover cookies) each time
        injectedJavaScriptBeforeContentLoaded={HIDE_CONSENT}
        injectedJavaScript={PAGE_SCRIPT}
        onMessage={onMessage}
        onShouldStartLoadWithRequest={(req) => {
          if (isHome(req.url)) {
            onLoggedIn();
            return false; // the app signs in on its own; no need to load the site
          }
          return allowOnly(req, [IZLY_HOST]); // help / CGU links open in the browser
        }}
        // Fallback for platforms that don't route redirects through the hook above.
        onNavigationStateChange={(nav) => {
          if (isHome(nav.url)) onLoggedIn();
        }}
        style={styles.flex}
      />
      {status !== 'form' && (
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          {typeof status === 'object' ? (
            <>
              <Text style={styles.error}>{status.error}</Text>
              <PrimaryButton label={t('common.retry')} onPress={retry} />
            </>
          ) : (
            <>
              <ActivityIndicator color={colors.textMuted} />
              <Text style={styles.muted}>{t('izly.signingIn')}</Text>
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
  error: { color: c.danger, textAlign: 'center' },
  muted: { color: c.textMuted, fontSize: 14 },
}));
