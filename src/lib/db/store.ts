/**
 * In-memory store for MVP.
 * Never stores private keys or seeds.
 */

import type { Invoice, Merchant, Quote, InvoiceStatus } from '@/types';
import { uid } from '@/lib/utils/id';

const merchants = new Map<string, Merchant>();
const invoices = new Map<string, Invoice>();
const quotes = new Map<string, Quote>();

export const db = {
  createMerchant(data: Omit<Merchant, 'id' | 'createdAt'>): Merchant {
    const m: Merchant = {
      ...data,
      id: uid(12),
      createdAt: new Date().toISOString(),
    };
    merchants.set(m.id, m);
    return m;
  },
  getMerchant(id: string): Merchant | undefined {
    return merchants.get(id);
  },
  listMerchants(): Merchant[] {
    return Array.from(merchants.values());
  },
  updateMerchant(id: string, patch: Partial<Merchant>): Merchant | undefined {
    const m = merchants.get(id);
    if (!m) return undefined;
    const updated = { ...m, ...patch, id: m.id };
    merchants.set(id, updated);
    return updated;
  },

  createInvoice(
    data: Omit<
      Invoice,
      | 'id'
      | 'createdAt'
      | 'updatedAt'
      | 'status'
      | 'paymentTxId'
      | 'paymentDetectedAt'
      | 'settlementTxId'
      | 'settledAmount'
    > & {
      status?: InvoiceStatus;
    }
  ): Invoice {
    const inv: Invoice = {
      merchantId: data.merchantId,
      description: data.description,
      usdAmount: data.usdAmount,
      settlementAsset: data.settlementAsset,
      paymentAddress: data.paymentAddress,
      id: uid(16),
      status: data.status ?? 'CREATED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      bchAmountSats: data.bchAmountSats ?? null,
      currentQuoteId: data.currentQuoteId ?? null,
      quoteExpiresAt: data.quoteExpiresAt ?? null,
      paymentTxId: null,
      paymentDetectedAt: null,
      settlementTxId: null,
      settledAmount: null,
      expiresAt: data.expiresAt ?? null,
    };
    invoices.set(inv.id, inv);
    return inv;
  },
  getInvoice(id: string): Invoice | undefined {
    return invoices.get(id);
  },
  updateInvoice(id: string, patch: Partial<Invoice>): Invoice | undefined {
    const inv = invoices.get(id);
    if (!inv) return undefined;
    const updated = {
      ...inv,
      ...patch,
      id: inv.id,
      updatedAt: new Date().toISOString(),
    };
    invoices.set(id, updated);
    return updated;
  },
  listInvoicesByMerchant(merchantId: string): Invoice[] {
    return Array.from(invoices.values())
      .filter((i) => i.merchantId === merchantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  listAllInvoices(): Invoice[] {
    return Array.from(invoices.values()).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    );
  },

  saveQuote(q: Quote): void {
    quotes.set(q.id, q);
  },
  getQuote(id: string): Quote | undefined {
    return quotes.get(id);
  },
};
