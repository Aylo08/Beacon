// Headless CAS login on the device (same steps as the web route
// src/app/api/cas-login+api.ts): load the login form, post the credentials and
// read the service ticket from the redirect without following it.
// Cookies are handled by hand (credentials: 'omit') so this never touches the
// WebView/system cookie stores.
import { fetch } from 'expo/fetch';

const CAS_LOGIN = 'https://cas.univ-avignon.fr/cas/login';
const UA = 'Mozilla/5.0 (Beacon timetable client)';

export class InvalidCredentialsError extends Error {}

/** "a=1; Path=/, b=2; Expires=Thu, 01 Jan 2026 …" → "a=1; b=2" */
function cookieHeader(res: Response): string {
  const raw = res.headers.get('set-cookie') ?? '';
  return raw
    .split(/,(?=\s*[^;,=\s]+=)/)
    .map((c) => c.split(';')[0].trim())
    .filter(Boolean)
    .join('; ');
}

function decodeEntities(s: string) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
}

/** Returns a one-time CAS ticket for `service`. Throws InvalidCredentialsError if CAS rejects them. */
export async function casTicket(service: string, username: string, password: string): Promise<string> {
  const url = `${CAS_LOGIN}?service=${encodeURIComponent(service)}`;
  const ticketFrom = (res: Response) => {
    const location = res.headers.get('location') ?? '';
    return location.startsWith(service) ? new URL(location).searchParams.get('ticket') : null;
  };

  // 1. Login form: session cookie + `execution` token.
  const page = await fetch(url, { headers: { 'User-Agent': UA }, credentials: 'omit', redirect: 'manual' });
  const html = await page.text();
  const execution = html.match(/<input[^>]*name="execution"[^>]*>/)?.[0]?.match(/value="([^"]*)"/)?.[1];
  if (!execution) throw new Error(`Could not read the CAS login form (HTTP ${page.status})`);

  // 2. Submit. Success is a 302 to `${service}?ticket=ST-…`; a wrong password re-renders the form.
  const submit = await fetch(url, {
    method: 'POST',
    redirect: 'manual',
    credentials: 'omit',
    headers: {
      'User-Agent': UA,
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: cookieHeader(page),
      Referer: url,
    },
    body: new URLSearchParams({
      username,
      password,
      execution: decodeEntities(execution),
      _eventId: 'submit',
      geolocation: '',
    }).toString(),
  });
  const ticket = ticketFrom(submit);
  if (ticket) return ticket;
  if (submit.status === 200 || submit.status === 401) throw new InvalidCredentialsError('Invalid username or password');
  throw new Error(`Unexpected CAS response (HTTP ${submit.status})`);
}
