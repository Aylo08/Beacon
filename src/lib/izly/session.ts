// Izly session: mon-espace.izly.fr is an ASP.NET MVC site with Forms
// Authentication and no API, so we log in like its form does.
//
// Login: GET /Home/Logon (anti-forgery token in the form + cookies) → POST
// Username / Password (6-digit code) / __RequestVerificationToken / ReturnUrl →
// 302 with the `.ASPXAUTH` cookie. Cookies are handled by hand (credentials:
// 'omit'), never through the WebView/system cookie stores.
//
// The credentials (captured on the official page, see app/izly-login.tsx) and the
// cookies live in the Keychain; the cookies are also kept in memory so requests
// don't hit the Keychain each time. Izly blocks the account after a few wrong
// codes, so credentials it rejects are deleted at once and never retried.
import { fetch } from 'expo/fetch';
import type { Credentials } from '../credentials';
import { absorbCookies, cookieHeader, inputValue, sameJar, type CookieJar } from '../http';
import { getJson, removeItem, setJson } from '../storage';
import { errorText } from './parse';

export const IZLY_HOST = 'mon-espace.izly.fr';
export const IZLY_ORIGIN = `https://${IZLY_HOST}`;
export const IZLY_LOGON_URL = `${IZLY_ORIGIN}/Home/Logon?ReturnUrl=%2f`;
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

export class IzlyInvalidCredentialsError extends Error {}
export class IzlyNotSignedInError extends Error {}
class SessionExpiredError extends Error {
  /** What Izly answered, to explain the failure if signing in again doesn't help. */
  detail = '';
}

const CREDS_KEY = 'izly_credentials';
const COOKIE_KEY = 'izly_session';

export async function getIzlyCredentials(): Promise<Credentials | null> {
  const c = await getJson<Credentials>(CREDS_KEY);
  return c?.username && c.password ? c : null;
}

// ---- Cookie jar (memory + Keychain) -------------------------------------------

/** undefined = not read from the Keychain yet. */
let jarCache: CookieJar | null | undefined;

async function getJar(): Promise<CookieJar | null> {
  if (jarCache === undefined) jarCache = await getJson<CookieJar>(COOKIE_KEY);
  return jarCache;
}

async function saveJar(jar: CookieJar) {
  if (jarCache && sameJar(jarCache, jar)) return;
  jarCache = jar;
  await setJson(COOKIE_KEY, jar);
}

/** Forgets the session and credentials (other Izly data: see clearIzly). */
export async function clearIzlySession() {
  jarCache = null;
  await Promise.all([removeItem(CREDS_KEY), removeItem(COOKIE_KEY)]);
}

// ---- Login ------------------------------------------------------------------

const isLogonRedirect = (res: Response) =>
  res.status >= 300 && res.status < 400 && /\/Home\/Logon/i.test(res.headers.get('location') ?? '');

/** Headless form login; returns the session cookies. */
async function login({ username, password }: Credentials): Promise<CookieJar> {
  const page = await fetch(IZLY_LOGON_URL, { headers: { 'User-Agent': UA }, credentials: 'omit', redirect: 'manual' });
  let jar = absorbCookies({}, page);
  const token = inputValue(await page.text(), '__RequestVerificationToken');
  if (!token) throw new Error(`Formulaire de connexion Izly illisible (HTTP ${page.status})`);

  const res = await fetch(`${IZLY_ORIGIN}/Home/Logon`, {
    method: 'POST',
    redirect: 'manual',
    credentials: 'omit',
    headers: {
      'User-Agent': UA,
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: IZLY_ORIGIN,
      Referer: IZLY_LOGON_URL,
      Cookie: cookieHeader(jar),
    },
    body: new URLSearchParams({ __RequestVerificationToken: token, ReturnUrl: '/', Username: username, Password: password }).toString(),
  });
  jar = absorbCookies(jar, res);
  if (jar['.ASPXAUTH']) return jar;
  // The form comes back (200) when Izly rejects the identifier / code.
  if (res.status === 200) throw new IzlyInvalidCredentialsError('Identifiant ou code secret Izly refusé');
  throw new Error(`Réponse inattendue d’Izly (HTTP ${res.status})`);
}

/** Logs in with `creds` and stores them with the new session. Throws IzlyInvalidCredentialsError. */
export async function izlySignIn(creds: Credentials) {
  const jar = await login(creds);
  await Promise.all([setJson(CREDS_KEY, creds), saveJar(jar)]);
}

let relogin: Promise<CookieJar> | null = null;

/** Fresh session from the saved credentials (shared by concurrent callers). */
export function renewSession(): Promise<CookieJar> {
  relogin ??= (async () => {
    const creds = await getIzlyCredentials();
    if (!creds) throw new IzlyNotSignedInError();
    try {
      const jar = await login(creds);
      await saveJar(jar);
      return jar;
    } catch (e) {
      if (e instanceof IzlyInvalidCredentialsError) await clearIzlySession(); // never retry a wrong code
      throw e;
    }
  })().finally(() => {
    relogin = null;
  });
  return relogin;
}

// ---- Authenticated requests ---------------------------------------------------

export type RequestOptions = {
  method?: 'GET' | 'POST';
  /** Sent like the site's jQuery calls (X-Requested-With). */
  xhr?: boolean;
  /** Form-urlencoded body */
  body?: string;
  /** Page the request comes from (default: home) */
  referer?: string;
};

async function describe(res: Response) {
  const body = await res.text().catch(() => '');
  const where = isLogonRedirect(res) ? 'redirection vers la connexion' : `HTTP ${res.status}`;
  const msg = errorText(body);
  return msg ? `${where} — ${msg}` : where;
}

async function send(path: string, jar: CookieJar, { method = 'GET', xhr, body, referer = '/' }: RequestOptions) {
  const res = await fetch(`${IZLY_ORIGIN}${path}`, {
    method,
    headers: {
      'User-Agent': UA,
      Cookie: cookieHeader(jar),
      Referer: `${IZLY_ORIGIN}${referer}`,
      ...(xhr ? { 'X-Requested-With': 'XMLHttpRequest', Accept: '*/*' } : {}),
      ...(body != null ? { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', Origin: IZLY_ORIGIN } : {}),
    },
    body,
    credentials: 'omit',
    redirect: 'manual',
  });
  // Without a session Izly redirects to the login page (pages) or answers 500 (its XHR error handler
  // treats a bare 500 as "Votre session a expiré").
  if (isLogonRedirect(res) || res.status === 401 || res.status === 500) {
    const e = new SessionExpiredError();
    e.detail = await describe(res);
    throw e;
  }
  if (res.status !== 200) throw new Error(`Izly : ${await describe(res)} sur ${path}`);
  // Sliding expiration: Izly may hand out a renewed .ASPXAUTH, keep it.
  if (res.headers.get('set-cookie')) await saveJar(absorbCookies(jar, res));
  return res;
}

/** Runs `attempt` with the session, signing in again once if the session expired. */
async function withSession<T>(path: string, attempt: (jar: CookieJar) => Promise<T>): Promise<T> {
  const jar = await getJar();
  if (jar?.['.ASPXAUTH']) {
    try {
      return await attempt(jar);
    } catch (e) {
      if (!(e instanceof SessionExpiredError)) throw e;
    }
  }
  // Parallel calls: another one may already have signed in again meanwhile → reuse that session.
  const latest = await getJar();
  const fresh = latest?.['.ASPXAUTH'] && latest['.ASPXAUTH'] !== jar?.['.ASPXAUTH'] ? latest : await renewSession();
  try {
    return await attempt(fresh);
  } catch (e) {
    if (e instanceof SessionExpiredError) throw new Error(`Izly a refusé ${path} (${e.detail})`);
    throw e;
  }
}

/** Authenticated request, signing in again once if the session expired. */
export function izlyRequest(path: string, opts: RequestOptions = {}) {
  return withSession(path, (jar) => send(path, jar, opts));
}

/**
 * Authenticated page, as text. After a long idle time Izly can answer a page
 * with 200 but without the signed-in content (no redirect): `signedIn(html)`
 * false is then treated like an expired session (silent sign-in, one retry).
 */
export function izlyPage(path: string, signedIn: (html: string) => boolean, opts: RequestOptions = {}) {
  return withSession(path, async (jar) => {
    const html = await (await send(path, jar, opts)).text();
    if (!signedIn(html)) {
      const e = new SessionExpiredError();
      e.detail = `page inattendue${errorText(html) ? ` — ${errorText(html)}` : ''}`;
      throw e;
    }
    return html;
  });
}
