// Client for the Beacon server (repo GeoffreyGx/BeaconServer): anonymous statistics (`analytics.ts`)
// and static content with a manifest (`content.ts`). The university services are still called
// directly; this server only hosts what the maintainer controls.
//
// The URL is inlined at build time from EXPO_PUBLIC_BEACON_API_URL (`.env.local`, EAS environment or
// the CI repo variable BEACON_API_URL). Unset → every server feature is off and nothing is sent.
const API_URL = (process.env.EXPO_PUBLIC_BEACON_API_URL ?? '').replace(/\/+$/, '');

/** Whether this build has a Beacon server to talk to. */
export const beaconApiAvailable = API_URL !== '';

/** Absolute URL for a server path ("/v1/…") or an already absolute URL (manifest file URLs). */
export const beaconUrl = (path: string) => (/^https?:\/\//.test(path) ? path : `${API_URL}${path}`);

/**
 * fetch() against the Beacon server. The timeout covers the whole exchange, including `read` (the
 * body), so a server that accepts the connection but never finishes answering can't hang the
 * caller. Throws on network errors / timeout; HTTP errors are left to `read` (check `res.ok`).
 */
export async function beaconRequest<T = Response>(
  path: string,
  init: RequestInit = {},
  { timeoutMs = 10_000, read }: { timeoutMs?: number; read?: (res: Response) => Promise<T> } = {},
): Promise<T> {
  if (!beaconApiAvailable) throw new Error('Beacon server not configured');
  const ctrl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      ctrl.abort();
      reject(new Error('Beacon server timeout'));
    }, timeoutMs);
  });
  try {
    const exchange = fetch(beaconUrl(path), { ...init, signal: ctrl.signal }).then((res) =>
      read ? read(res) : (res as T),
    );
    return await Promise.race([exchange, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
