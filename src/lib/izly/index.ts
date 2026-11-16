// Izly account (Crous payments): balance, history, counters and pay-by-QR,
// read from mon-espace.izly.fr. See session.ts for the login and parse.ts for
// the page formats. Last results are cached to show instantly / offline.
import { File, Paths } from 'expo-file-system';
import { getJson, removeItem, setJson } from '../storage';
import {
  formatCounter,
  parisDateTime,
  parseBalance,
  parseOperations,
  sortOperations,
  type IzlyBalance,
  type IzlyCounter,
  type IzlyOperation,
  type OperationKind,
  type RawCounter,
} from './parse';
import { clearIzlySession, izlyRequest, renewSession } from './session';

export * from './parse';
export {
  getIzlyCredentials,
  IZLY_HOST,
  IZLY_LOGON_URL,
  IZLY_ORIGIN,
  IzlyInvalidCredentialsError,
  IzlyNotSignedInError,
  izlySignIn,
} from './session';

const BALANCE_KEY = 'izly_balance';
const COUNTERS_KEY = 'izly_counters';
/** The history is too big for the Keychain: kept in the app's (sandboxed, not shared) documents. */
const opsFile = () => new File(Paths.document, 'izly-operations.json');

/** Signs out of Izly on this device: credentials, session and cached data. */
export async function clearIzly() {
  await Promise.all([clearIzlySession(), removeItem(BALANCE_KEY), removeItem(COUNTERS_KEY)]);
  try {
    const f = opsFile();
    if (f.exists) f.delete();
  } catch {}
}

// ---- Balance ----------------------------------------------------------------

export const getCachedBalance = () => getJson<IzlyBalance>(BALANCE_KEY);

export async function fetchIzlyBalance(): Promise<IzlyBalance> {
  const parsed = parseBalance(await (await izlyRequest('/')).text());
  if (!parsed) throw new Error('Solde introuvable sur la page Izly');
  const balance = { ...parsed, fetchedAt: Date.now() };
  await setJson(BALANCE_KEY, balance);
  return balance;
}

// ---- History ----------------------------------------------------------------

const OPERATION_ENDPOINTS: Record<OperationKind, string> = {
  topup: '/Home/GetTopups',
  payment: '/Home/GetPayments',
  transfer: '/Home/GetBankAccountTransfers',
};

export async function getCachedOperations(): Promise<IzlyOperation[] | null> {
  try {
    const f = opsFile();
    return f.exists ? (JSON.parse(await f.text()) as IzlyOperation[]) : null;
  } catch {
    return null;
  }
}

/** Top-ups, payments and bank transfers merged, newest first. */
export async function fetchIzlyOperations(): Promise<IzlyOperation[]> {
  const lists = await Promise.all(
    (Object.keys(OPERATION_ENDPOINTS) as OperationKind[]).map(async (kind) =>
      parseOperations(await (await izlyRequest(OPERATION_ENDPOINTS[kind], { xhr: true })).text(), kind),
    ),
  );
  const ops = sortOperations(lists.flat());
  await opsFile()
    .write(JSON.stringify(ops))
    .catch(() => {});
  return ops;
}

// ---- Counters ---------------------------------------------------------------

export const getCachedCounters = () => getJson<IzlyCounter[]>(COUNTERS_KEY);

export async function fetchIzlyCounters(): Promise<IzlyCounter[]> {
  const raw = (await (await izlyRequest('/Home/GetCounters', { xhr: true })).json()) as RawCounter[];
  const counters = [...raw].sort((a, b) => a.Order - b.Order).map(formatCounter);
  await setJson(COUNTERS_KEY, counters);
  return counters;
}

// ---- Pay by QR code ---------------------------------------------------------

export type IzlyQrCode = {
  /** data: URI of the PNG */
  uri: string;
  /** Epoch ms after which the code is refused, null if unknown */
  validUntil: number | null;
};

/**
 * A new payment QR code (short-lived; never cached), like the "Payer" page:
 * `$.post('/Home/CreateQrCodeImg', { numberOfQrCodes: 1 })` →
 * `{ images: [<base64 png>], validityDate: "17/11/2026 00:09:00" }` (Paris time).
 */
export async function createIzlyQrCode(): Promise<IzlyQrCode> {
  const post = async () =>
    (
      await izlyRequest('/Home/CreateQrCodeImg', {
        method: 'POST',
        xhr: true,
        body: 'numberOfQrCodes=1',
        referer: '/Home/GenerateQRCode',
      })
    ).text();
  // The page also treats a 200 "SessionExpired" answer as an expired session.
  const expired = (t: string) => /^\s*"?SessionExpired"?\s*$/.test(t);
  let text = await post();
  if (expired(text)) {
    await renewSession();
    text = await post();
    if (expired(text)) throw new Error('Izly a refusé la nouvelle session');
  }
  let data: { images?: unknown; validityDate?: unknown };
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Réponse illisible d’Izly pour le QR code');
  }
  const image = Array.isArray(data.images) ? data.images[0] : null;
  // Only accept base64 PNG data: it goes straight into an <Image> source.
  if (typeof image !== 'string' || !/^[A-Za-z0-9+/=\s]+$/.test(image)) throw new Error('Izly n’a pas renvoyé de QR code');
  return {
    uri: `data:image/png;base64,${image.replace(/\s/g, '')}`,
    validUntil: typeof data.validityDate === 'string' ? parisDateTime(data.validityDate) : null,
  };
}
