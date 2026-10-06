/**
 * Browser-local invoice ledger.
 * Vercel functions do not share memory, so the dashboard cannot rely on the server store.
 */

export interface LocalInvoice {
  invoice_id: string;
  merchant_id?: string;
  description?: string;
  usd_amount: number;
  settlement_asset: string;
  status: string;
  payment_address: string;
  bch_amount: string | null;
  bch_amount_sats: number | null;
  expected_settlement?: string | null;
  expires_at?: string | null;
  payment_txid?: string | null;
  created_at: string;
}

const KEY = 'settlr_invoices';

export function loadInvoices(): LocalInvoice[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as LocalInvoice[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveInvoice(inv: LocalInvoice): void {
  const list = loadInvoices().filter((i) => i.invoice_id !== inv.invoice_id);
  list.unshift(inv);
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, 50)));
}

export function updateInvoice(
  id: string,
  patch: Partial<LocalInvoice>
): LocalInvoice | undefined {
  const list = loadInvoices();
  const i = list.findIndex((x) => x.invoice_id === id);
  if (i < 0) return undefined;
  list[i] = { ...list[i], ...patch };
  localStorage.setItem(KEY, JSON.stringify(list));
  return list[i];
}

export function getInvoice(id: string): LocalInvoice | undefined {
  return loadInvoices().find((i) => i.invoice_id === id);
}
