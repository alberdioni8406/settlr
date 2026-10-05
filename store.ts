/**
 * In-memory store for MVP.
 * Replace with Prisma + SQLite/Postgres for persistence.
 * Never stores private keys or seeds.
 */

import type { Invoice, Merchant, Quote, InvoiceStatus } from '@/types';
import { uid } from '@/lib/utils/id';

const merchants = new Map<string, Merchant>();
const invoices = new Map<string, Invoice>();
const quotes = new Map<string, Quote>();

// Seed a demo merchant for development
function ensureDemoMerchant() {
  if (merchants.size === 0) {
    const id = 'demo-merchant';
    merchants.set(id, {
      id,
      name: 'Demo Coffee Shop',
      createdAt: new Date().toISOString(),
      defaultSettlement: 'BCH',
      destinations: {
        // Placeholder — merchants must supply their own controlled addresses
        BCH: 'bitcoincash:qpdemoaddressreplaceme000000000000000000',
      },
    });
  }
}
ensureDemoMerchant();

export const db = {
  // Merchants
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

  // Invoices
  createInvoice(
    data: Omit<Invoice, 'id' | 'createdAt' | 'updatedAt' | 'status'> & {
      status?: InvoiceStatus;
    }
  ): Invoice {
    const inv: Invoice = {
      ...data,
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

  // Quotes
  saveQuote(q: Quote): void {
    quotes.set(q.id, q);
  },
  getQuote(id: string): Quote | undefined {
    return quotes.get(id);
  },
};
