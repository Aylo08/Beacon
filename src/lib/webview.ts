// Guards for the login WebViews (CAS, ENT, Izly). They run scripts that read
// credentials or account data, so they must only ever show the expected sites:
// other links (help, password reset…) open in the system browser instead, and
// messages are only trusted when they come from the expected host.
import { Linking } from 'react-native';
import type { ShouldStartLoadRequest, WebViewMessageEvent } from 'react-native-webview/lib/WebViewTypes';
import { hostOf } from './http';

/**
 * `onShouldStartLoadWithRequest` helper: true for https pages on `hosts` (and for
 * sub-frames, which the page itself controls); other http(s) links are handed to
 * the system browser, anything else (custom schemes, file:, javascript:) is blocked.
 */
export function allowOnly(req: ShouldStartLoadRequest, hosts: readonly string[]): boolean {
  if (req.isTopFrame === false) return true;
  if (req.url === 'about:blank') return true;
  const host = hostOf(req.url);
  if (req.url.startsWith('https://') && host && hosts.includes(host)) return true;
  if (/^https?:\/\//.test(req.url)) Linking.openURL(req.url).catch(() => {});
  return false;
}

/** The message's parsed JSON if it was posted by a page on `hosts`, else null. */
export function trustedMessage<T>(e: WebViewMessageEvent, hosts: readonly string[]): T | null {
  const host = hostOf(e.nativeEvent.url);
  if (!host || !hosts.includes(host)) return null;
  try {
    return JSON.parse(e.nativeEvent.data) as T;
  } catch {
    return null;
  }
}
