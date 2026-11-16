// Fetches the student card data from the ENT. The WebView goes through CAS with
// the ENT service (the timetable login does this right after its own ticket, so
// the CAS session is reused); once it is on ent.univ-avignon.fr we run
// a script inside the page (injected after every load, it only acts on the ENT) (same origin, so its session cookies apply) that:
//   1. GET /uPortal/api/v5-1/userinfo → a short-lived JWT for the signed-in user
//   2. GET /EtiquetteUserUapv/getInfoUser with that JWT → the card data
//   3. tries to read the photo as a data URL (falls back to a direct download)
// and posts the result back to the app.
import { useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { ENT_CAS_LOGIN_URL } from '../lib/edt';
import type { EntInfoUser } from '../lib/studentCard';
import { allowOnly, trustedMessage } from '../lib/webview';
import { makeStyles, useAppTheme } from '../lib/theme';

const ENT_HOST = 'ent.univ-avignon.fr';
const HOSTS = ['cas.univ-avignon.fr', ENT_HOST];

export const ENT_FETCH_SCRIPT = `(function () {
  if (location.hostname !== '${ENT_HOST}' || window.__beaconCard) return;
  window.__beaconCard = true;
  var post = function (m) { window.ReactNativeWebView.postMessage(JSON.stringify(m)); };
  post({ type: 'started' });
  (async function () {
    try {
      var r = await fetch('/uPortal/api/v5-1/userinfo', { credentials: 'include' });
      var jwt = r.ok ? (await r.text()).trim() : '';
      var sub = '';
      try { sub = JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub || ''; } catch (e) {}
      if (!sub || sub === 'guest') { window.__beaconCard = false; post({ type: 'notSignedIn' }); return; }
      var res = await fetch('/EtiquetteUserUapv/getInfoUser', { headers: { Authorization: jwt }, credentials: 'include' });
      if (!res.ok) throw new Error('getInfoUser: HTTP ' + res.status);
      var info = await res.json();
      var photo = null;
      if (info.photo_visible !== false && info.photo_path) {
        try {
          var blob = await (await fetch(info.photo_path, { credentials: 'include' })).blob();
          if (blob.type.indexOf('image/') === 0) {
            photo = await new Promise(function (resolve, reject) {
              var fr = new FileReader();
              fr.onload = function () { resolve(fr.result); };
              fr.onerror = reject;
              fr.readAsDataURL(blob);
            });
          }
        } catch (e) { /* cross-origin: the app downloads it instead */ }
      }
      post({ type: 'card', info: info, photo: photo });
    } catch (e) {
      window.__beaconCard = false;
      post({ type: 'error', message: String(e && e.message || e) });
    }
  })();
})();
true;`;

export type EntMessage =
  | { type: 'card'; info: EntInfoUser; photo: string | null }
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

export function EntCardFetcher({
  onResult,
  onError,
}: {
  onResult: (info: EntInfoUser, photoDataUrl: string | null) => void;
  onError: (message: string) => void;
}) {
  const done = useRef(false);
  const styles = useStyles();
  const { colors } = useAppTheme();
  // 'login': the user is on CAS (WebView visible); 'fetching': on the ENT, script running.
  const [phase, setPhase] = useState<'login' | 'fetching'>('login');

  const onMessage = (e: WebViewMessageEvent) => {
    if (done.current) return;
    const msg = trustedMessage<EntMessage>(e, [ENT_HOST]);
    if (!msg) return;
    if (msg.type === 'card') {
      done.current = true;
      onResult(msg.info, msg.photo);
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
        source={{ uri: ENT_CAS_LOGIN_URL }}
        incognito // same as the timetable login: don't keep a CAS session around
        injectedJavaScript={ENT_FETCH_SCRIPT}
        onLoadStart={(e) => {
          if (!isEnt(e.nativeEvent.url)) setPhase('login');
        }}
        onMessage={onMessage}
        onShouldStartLoadWithRequest={(req) => allowOnly(req, HOSTS)}
        style={styles.flex}
      />
      {phase === 'fetching' && (
        <View style={[StyleSheet.absoluteFill, styles.overlay]}>
          <ActivityIndicator color={colors.textMuted} />
          <Text style={styles.muted}>Récupération de la carte…</Text>
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
