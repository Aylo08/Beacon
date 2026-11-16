// Parsers for mon-espace.izly.fr's server-rendered pages and XHR answers.
// Pure functions (no native modules): testable with Node.
import { textOf } from '../http';
import { parisEpoch } from '../time';

export type IzlyBalance = {
  /** In euros, e.g. 9.54 */
  amount: number;
  /** "16/11/2026 à 23:23" (when Izly computed it) */
  asOf: string | null;
  fetchedAt: number;
};

export type OperationKind = 'topup' | 'payment' | 'transfer';
export type OperationStatus = 'success' | 'pending' | 'refunded' | 'other';

export type IzlyOperation = {
  kind: OperationKind;
  /** "Rechargement - Espèces", "Paiement"… */
  label: string;
  /** Paris calendar day "YYYY-MM-DD" and time "HH:MM" */
  day: string;
  time: string;
  /** Signed, in euros (top-ups positive, payments negative) */
  amount: number;
  status: OperationStatus;
  /** Badge text as shown by Izly ("Succès", "En attente"…) */
  statusText: string;
};

export type IzlyCounter = {
  typeId: number;
  label: string;
  /** Formatted like Izly: "0,00 €" for Izly credits, plain number otherwise */
  value: string;
};

export type RawCounter = { TypeId: number; Type: string; Value: number; Order: number };

/** "+9,54€", "-1 234,50" → 9.54, -1234.5 */
export function parseAmount(text: string): number | null {
  const num = text.match(/[+-]?\s*\d[\d\s.]*(?:,\d+)?/)?.[0];
  if (!num) return null;
  const n = Number(num.replace(/[\s.]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Text of the first element having class `cls`. */
function classText(html: string, cls: string): string | null {
  const m = html.match(new RegExp(`<(\\w+)[^>]*class="[^"]*\\b${cls}\\b[^"]*"[^>]*>([\\s\\S]*?)</\\1>`, 'i'));
  return m ? textOf(m[2]) : null;
}

/** Balance on the home page: `<p id="balance">+9,54<sup>€</sup></p>` + `.balance-heading-date`. */
export function parseBalance(html: string): Omit<IzlyBalance, 'fetchedAt'> | null {
  const inner = html.match(/<p[^>]*\bid="balance"[^>]*>([\s\S]*?)<\/p>/i)?.[1];
  if (inner == null) return null;
  const amount = parseAmount(textOf(inner));
  if (amount == null) return null;
  return { amount, asOf: classText(html, 'balance-heading-date') };
}

/** One GetTopups / GetPayments / GetBankAccountTransfers fragment ("Aucun événement" → []). */
export function parseOperations(html: string, kind: OperationKind): IzlyOperation[] {
  const ops: IzlyOperation[] = [];
  for (const [, item] of html.matchAll(/<li[^>]*class="[^"]*\blist-group-item\b[^"]*"[^>]*>([\s\S]*?)<\/li>/gi)) {
    // (sic) Izly's class name is "oeration-date"
    const date = (classText(item, 'oeration-date') ?? classText(item, 'operation-date') ?? '').match(
      /(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/,
    );
    const amount = parseAmount(classText(item, 'operation-amount') ?? '');
    if (!date || amount == null) continue;
    const badge = item.match(/class="[^"]*\bbadge-(success|secondary|warning)\b/)?.[1];
    ops.push({
      kind,
      label: classText(item, 'operation-type') ?? '',
      day: `${date[3]}-${date[2]}-${date[1]}`,
      time: `${date[4]}:${date[5]}`,
      amount,
      status: badge === 'success' ? 'success' : badge === 'secondary' ? 'pending' : badge === 'warning' ? 'refunded' : 'other',
      statusText: classText(item, 'badge') ?? '',
    });
  }
  return ops;
}

/** Newest first. */
export const sortOperations = (ops: IzlyOperation[]) =>
  [...ops].sort((a, b) => (b.day + b.time).localeCompare(a.day + a.time));

/** Same formatting as Izly's counters.counter.js (Value is in cents; type 3 = euros). */
export function formatCounter(c: RawCounter): IzlyCounter {
  const value = c.TypeId === 3 ? formatEuros(c.Value / 100) : String(Math.round(c.Value));
  return { typeId: c.TypeId, label: c.Type, value };
}

/** "9,54 €" */
export const formatEuros = (n: number) =>
  `${n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

/** Paris wall-clock "DD/MM/YYYY HH:MM[:SS]" → epoch ms. */
export function parisDateTime(s: string): number | null {
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  return parisEpoch(`${m[3]}-${m[2]}-${m[1]}`, Number(m[4]) * 60 + Number(m[5])) + Number(m[6] ?? 0) * 1000;
}

/** Izly's XHR error ({Title, ErrorMessage, ErrorCode | Code}) or HTML page → short text, '' if none. */
export function errorText(body: string): string {
  try {
    const j = JSON.parse(body) as { Title?: string; ErrorMessage?: string; ErrorCode?: number; Code?: number };
    const msg = [j.Title, j.ErrorMessage].filter(Boolean).map((x) => textOf(String(x))).join(' : ');
    const code = j.ErrorCode ?? j.Code;
    return code != null ? `${msg} (code ${code})`.trim() : msg;
  } catch {
    const title = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
    return title ? textOf(title) : '';
  }
}
