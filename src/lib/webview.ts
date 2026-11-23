// Guards for the login WebViews (CAS, ENT, Izly). They run scripts that read
// credentials or account data, so they must only ever show the expected sites:
// other links (help, password reset…) open in the system browser instead, and
// messages are only trusted when they come from the expected host *and* carry
// the WebView's nonce. The nonce matters on Android, where the message bridge is
// exposed to every frame (cross-origin iframes included) and the event's URL is
// the top page's: only our injected script (main frame only) knows the nonce.
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

/** A random per-WebView secret for `postScript` / `trustedMessage` (keep it with `useState(newMessageNonce)`). */
export function newMessageNonce(): string {
  const bytes = new Uint8Array(16);
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Source of a JS function `(message) => void` posting `message` (an object) to the app, signed with `nonce`. */
export const postScript = (nonce: string) =>
  `function (m) { m.nonce = ${JSON.stringify(nonce)}; window.ReactNativeWebView.postMessage(JSON.stringify(m)); }`;

/** The message's parsed JSON if it was posted by a page on `hosts` with `nonce` (see postScript), else null. */
export function trustedMessage<T>(e: WebViewMessageEvent, hosts: readonly string[], nonce: string): T | null {
  const host = hostOf(e.nativeEvent.url);
  if (!host || !hosts.includes(host)) return null;
  try {
    const data = JSON.parse(e.nativeEvent.data) as { nonce?: unknown } | null;
    return data && typeof data === 'object' && data.nonce === nonce ? (data as T) : null;
  } catch {
    return null;
  }
}
