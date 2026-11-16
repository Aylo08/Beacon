// Small helpers for the sites we talk to without an API (CAS, Izly): cookies
// handled by hand and values read from server-rendered HTML.
// No react-native imports: also usable by the web server routes.

/** Cookie name → value. */
export type CookieJar = Record<string, string>;

/** The response's Set-Cookie headers (several come back joined with ", " outside Node). */
function setCookies(res: Response): string[] {
  const h = res.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof h.getSetCookie === 'function') return h.getSetCookie();
  // "a=1; Path=/, b=2; Expires=Thu, 01 Jan 2026 …": split only before "name=".
  return (res.headers.get('set-cookie') ?? '').split(/,(?=\s*[^;,=\s]+=)/);
}

/** Returns `jar` updated with the response's cookies (an empty value deletes the cookie). */
export function absorbCookies(jar: CookieJar, res: Response): CookieJar {
  const next = { ...jar };
  for (const header of setCookies(res)) {
    const pair = header.split(';')[0].trim();
    const eq = pair.indexOf('=');
    if (eq <= 0) continue;
    const value = pair.slice(eq + 1);
    if (value) next[pair.slice(0, eq)] = value;
    else delete next[pair.slice(0, eq)];
  }
  return next;
}

export const cookieHeader = (jar: CookieJar) =>
  Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');

export function sameJar(a: CookieJar, b: CookieJar) {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
}

export function decodeEntities(s: string) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/** Visible text of an HTML fragment, whitespace collapsed. */
export const textOf = (html: string) => decodeEntities(html.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();

/** Decoded `value` of the first `<input name="…">` (hidden form fields, tokens). */
export function inputValue(html: string, name: string): string | null {
  const tag = html.match(new RegExp(`<input[^>]*name="${name}"[^>]*>`))?.[0];
  const value = tag?.match(/value="([^"]*)"/)?.[1];
  return value == null ? null : decodeEntities(value);
}

/** Hostname of `url`, or null if it doesn't parse. */
export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}
