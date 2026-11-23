// Fallback when there are no usable saved credentials for the headless fetch
// (lib/entCard.ts): fetches the student card data through the ENT login page.
// The WebView goes through CAS with the ENT service; once it is on ent.univ-avignon.fr we run
// a script inside the page (same origin, so its session cookies apply; it only acts on the ENT) that:
//   1. GET /uPortal/api/v5-1/userinfo → a short-lived JWT for the signed-in user
//   2. GET /EtiquetteUserUapv/getInfoUser with that JWT → the card data
// and posts the result back to the app (the photo is downloaded by the app afterwards).
//
// The script is injected at document start, not only after the page has loaded: the
// logged-in portal never fires its load event (some of its portlets hang), and the
// script only needs the session cookies, not the page. The after-load injection is
// kept as a fallback; a flag on the page makes it run once. On Android the
// document-start script can be lost while the new page commits, so if nothing is
// heard from the ENT within a few seconds the WebView moves to a tiny ENT page
// (`ENT_LIGHT_PAGE`), whose load event does fire (`useEntPageFallback`).
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { ENT_CAS_LOGIN_URL } from '../lib/edt';
import type { EntInfoUser } from '../lib/studentCard';
import { allowOnly, newMessageNonce, postScript, trustedMessage } from '../lib/webview';
import { makeStyles, useAppTheme } from '../lib/theme';
import { t } from '../lib/i18n';

const ENT_HOST = 'ent.univ-avignon.fr';
const HOSTS = ['cas.univ-avignon.fr', ENT_HOST];
/** Per request made by the page script. */
const REQUEST_TIMEOUT_MS = 15_000;
/** Whole fetch once the ENT page is reached (2 requests). */
const FETCH_TIMEOUT_MS = 60_000;
/** A tiny page on the ENT (a plain Tomcat "not found" page: no scripts or images, loads at once). */
const ENT_LIGHT_PAGE = `https://${ENT_HOST}/uPortal/beacon-card`;
/** How long to wait for the script on the portal before moving to `ENT_LIGHT_PAGE`. */
const LIGHT_PAGE_DELAY_MS = 5_000;

const entFetchScript = (nonce: string) => `(function () {
  if (location.hostname !== '${ENT_HOST}' || window.__beaconCard) return;
  window.__beaconCard = true;
  var post = ${postScript(nonce)};
  // Keep the browser's own fetch: the page's scripts load polyfills after us.
  var nativeFetch = window.fetch.bind(window);
  post({ type: 'started' });
  // Every request has a timeout, so a server that never answers shows an error instead of an endless spinner.
  var get = function (url, opts, step) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, ${REQUEST_TIMEOUT_MS});
    opts.signal = ctrl.signal;
    return nativeFetch(url, opts).then(
      function (r) { clearTimeout(timer); return r; },
      function (e) { clearTimeout(timer); throw new Error(step + ': ' + (e && e.name === 'AbortError' ? 'timeout' : String(e && e.message || e))); }
    );
  };
  (async function () {
    try {
      var r = await get('/uPortal/api/v5-1/userinfo', { credentials: 'include' }, 'userinfo');
      if (!r.ok) throw new Error('userinfo: HTTP ' + r.status);
      var jwt = (await r.text()).trim();
      var sub = '';
      try { sub = JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub || ''; } catch (e) {}
      if (!sub || sub === 'guest') { window.__beaconCard = false; post({ type: 'notSignedIn' }); return; }
      var res = await get('/EtiquetteUserUapv/getInfoUser', { headers: { Authorization: jwt }, credentials: 'include' }, 'getInfoUser');
      if (!res.ok) throw new Error('getInfoUser: HTTP ' + res.status);
      var info = await res.json();
      post({ type: 'card', info: info });
    } catch (e) {
      window.__beaconCard = false;
      post({ type: 'error', message: String(e && e.message || e) });
    }
  })();
})();
true;`;

export type EntMessage =
  | { type: 'card'; info: EntInfoUser }
  | { type: 'started' }
  | { type: 'notSignedIn' }
  | { type: 'error'; message: string };

export const isEnt = (url: string) => {
  try {
    return new URL(url).hostname === ENT_HOST;
  } catch {
    return false;
  }
};

/**
 * WebView source + handlers that move to `ENT_LIGHT_PAGE` when the card script
 * hasn't reported anything a few seconds after an ENT page started loading.
 * Call `onEntMessage()` for every trusted ENT message.
 */
function useEntPageFallback(initialUri: string) {
  const [uri, setUri] = useState(initialUri);
  const heard = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const onLoadStart = (url: string) => {
    if (!isEnt(url) || heard.current || timer.current) return;
    timer.current = setTimeout(() => {
      if (!heard.current) setUri(ENT_LIGHT_PAGE);
    }, LIGHT_PAGE_DELAY_MS);
  };
  const onEntMessage = () => {
    heard.current = true;
  };
  return { uri, setUri, onLoadStart, onEntMessage };
}

export function EntCardFetcher({
  onResult,
  onError,
}: {
  onResult: (info: EntInfoUser) => void;
  onError: (message: string) => void;
}) {
  const done = useRef(false);
  const styles = useStyles();
  const { colors } = useAppTheme();
  // 'login': the user is on CAS (WebView visible); 'fetching': on the ENT, script running.
  const [phase, setPhase] = useState<'login' | 'fetching'>('login');
  const fallback = useEntPageFallback(ENT_CAS_LOGIN_URL);
  const [nonce] = useState(newMessageNonce);
  const script = entFetchScript(nonce);

  // Safety net if the page script never reports back (e.g. the ENT page changed).
  useEffect(() => {
    if (phase !== 'fetching') return;
    const timer = setTimeout(() => {
      if (done.current) return;
      done.current = true;
      onError('timeout');
    }, FETCH_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [phase, onError]);

  const onMessage = (e: WebViewMessageEvent) => {
    if (done.current) return;
    const msg = trustedMessage<EntMessage>(e, [ENT_HOST], nonce);
    if (!msg) return;
    fallback.onEntMessage();
    if (msg.type === 'card') {
      if (typeof msg.info?.uid !== 'string') return; // malformed: keep waiting (the timeout reports it)
      done.current = true;
      onResult(msg.info);
    } else if (msg.type === 'started') {
      setPhase('fetching');
    } else if (msg.type === 'notSignedIn') {
      setPhase('login'); // ENT guest page: let the user sign in
    } else {
      done.current = true;
      onError(msg.message);
    }
  };

  return (
    <View style={styles.flex}>
      <WebView
        source={{ uri: fallback.uri }}
        incognito // same as the timetable login: don't keep a CAS session around
        injectedJavaScriptBeforeContentLoaded={script}
        injectedJavaScript={script}
        onLoadStart={(e) => {
          if (!isEnt(e.nativeEvent.url)) setPhase('login');
          fallback.onLoadStart(e.nativeEvent.url);
        }}
        onMessage={onMessage}
        onShouldStartLoadWithRequest={(req) => allowOnly(req, HOSTS)}
        style={styles.flex}
      />
      {phase === 'fetching' && (
        <View style={[StyleSheet.absoluteFill, styles.overlay]}>
          <ActivityIndicator color={colors.textMuted} />
          <Text style={styles.muted}>{t('card.fetching')}</Text>
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  flex: { flex: 1 },
  overlay: { alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: c.bg },
  muted: { color: c.textMuted, fontSize: 14 },
}));
