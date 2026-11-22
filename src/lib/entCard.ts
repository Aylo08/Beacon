// Headless fetch of the student card data from the ENT with the saved CAS
// credentials (no WebView): CAS ticket for the ENT service → uPortal validates it
// and sets its session cookie → /uPortal/api/v5-1/userinfo (a short-lived JWT for
// the signed-in user) → /EtiquetteUserUapv/getInfoUser with that JWT.
// We stop following redirects before the portal page itself: it is slow and never
// finishes loading, and only the session cookie is needed.
// Cookies are handled by hand (credentials: 'omit'), like casLogin.ts.
import { fetch } from 'expo/fetch';
import { casTicket } from './casLogin';
import type { Credentials } from './credentials';
import { absorbCookies, cookieHeader, type CookieJar } from './http';
import type { EntInfoUser } from './studentCard';

const ENT_HOST = 'ent.univ-avignon.fr';
const ENT = `https://${ENT_HOST}`;
export const ENT_SERVICE = `${ENT}/uPortal/Login`;
const UA = 'Mozilla/5.0 (Beacon timetable client)';
const TIMEOUT_MS = 15_000;

async function get(url: string, jar: CookieJar, headers: Record<string, string> = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Cookie: cookieHeader(jar), ...headers },
      credentials: 'omit',
      redirect: 'manual',
      signal: ctrl.signal,
    });
    return { res, body: await res.text() };
  } catch (e) {
    throw new Error(ctrl.signal.aborted ? `${new URL(url).pathname}: timeout` : String(e instanceof Error ? e.message : e));
  } finally {
    clearTimeout(timer);
  }
}

/** `sub` claim of a JWT ('' if unreadable). */
function jwtSubject(jwt: string): string {
  try {
    const part = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(part + '='.repeat((4 - (part.length % 4)) % 4))).sub ?? '';
  } catch {
    return '';
  }
}

/** The ENT's card data for these credentials. Throws InvalidCredentialsError (from casTicket) if CAS rejects them. */
export async function fetchEntInfo(creds: Credentials): Promise<EntInfoUser> {
  const ticket = await casTicket(ENT_SERVICE, creds.username, creds.password);

  // uPortal validates the ticket, then bounces through /uPortal/Login and /uPortal/api/cookiecheck.
  let jar: CookieJar = {};
  let url = `${ENT_SERVICE}?ticket=${encodeURIComponent(ticket)}`;
  for (let i = 0; i < 8; i++) {
    const { res } = await get(url, jar);
    jar = absorbCookies(jar, res);
    const location = res.headers.get('location');
    if (!location || res.status < 300 || res.status >= 400) break;
    const next = new URL(location, url);
    if (next.hostname !== ENT_HOST || !/^\/uPortal\/(Login|api\/cookiecheck)/.test(next.pathname)) break;
    url = next.href;
  }

  const userinfo = await get(`${ENT}/uPortal/api/v5-1/userinfo`, jar);
  if (!userinfo.res.ok) throw new Error(`userinfo: HTTP ${userinfo.res.status}`);
  const jwt = userinfo.body.trim();
  const sub = jwtSubject(jwt);
  if (!sub || sub === 'guest') throw new Error('ENT: not signed in');

  const card = await get(`${ENT}/EtiquetteUserUapv/getInfoUser`, jar, { Authorization: jwt });
  if (!card.res.ok) throw new Error(`getInfoUser: HTTP ${card.res.status}`);
  const info = JSON.parse(card.body) as EntInfoUser;
  if (!info?.uid) throw new Error('getInfoUser: unexpected response');
  return info;
}
