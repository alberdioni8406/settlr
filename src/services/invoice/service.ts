import { uid } from '@/lib/utils/id';
import type { Invoice, SettlementAsset } from '@/types';
import { db } from '@/lib/db/store';
import { createQuote, isQuoteExpired } from '@/services/quote/engine';
import { isSettlementEnabled } from '@/services/registry/assets';

/**
 * Generate a unique BCH payment address for an invoice.
 * MVP: deterministic mock address derived from invoice id.
 * Production: derive from a watch-only HD path or use a real address generation service
 * that the merchant controls / monitors. Never hold the private key.
 */
function generatePaymentAddress(invoiceId: string): string {
  // Placeholder cashaddr-style string. Replace with real derivation.
  const suffix = invoiceId.replace(/[^a-z0-9]/gi, '').slice(0, 32).padEnd(32, '0');
  return `bitcoincash:q${suffix}`;
}

export interface CreateInvoiceInput {
  merchantId: string;
  usdAmount: number;
  description?: string;
  settlementAsset?: SettlementAsset;
}

export async function createInvoice(input: CreateInvoiceInput): Promise<{
  invoice: Invoice;
  quote: Awaited<ReturnType<typeof createQuote>>;
}> {
  const merchant = db.getMerchant(input.merchantId);
  if (!merchant) throw new Error('Merchant not found');

  let settlement: SettlementAsset =
    input.settlementAsset ||
    (merchant.defaultSettlement === 'PER_INVOICE' ? 'BCH' : merchant.defaultSettlement);

  if (!isSettlementEnabled(settlement)) {
    // Fall back to BCH if requested stable is disabled
    settlement = 'BCH';
  }

  const paymentAddress = generatePaymentAddress(uid(8));

  const invoice = db.createInvoice({
    merchantId: input.merchantId,
    description: input.description,
    usdAmount: input.usdAmount,
    settlementAsset: settlement,
    paymentAddress,
    bchAmountSats: null,
    currentQuoteId: null,
    quoteExpiresAt: null,
    expiresAt: null,
  });

  // Immediately produce first quote
  const quote = await createQuote({
    invoiceId: invoice.id,
    usdAmount: input.usdAmount,
    settlementAsset: settlement,
  });
  db.saveQuote(quote);

  const updated = db.updateInvoice(invoice.id, {
    status: 'AWAITING_PAYMENT',
    bchAmountSats: quote.bchAmountSats,
    currentQuoteId: quote.id,
    quoteExpiresAt: quote.expiresAt,
  })!;

  return { invoice: updated, quote };
}

export async function refreshQuote(invoiceId: string) {
  const invoice = db.getInvoice(invoiceId);
  if (!invoice) throw new Error('Invoice not found');
  if (['SETTLED', 'EXPIRED', 'REFUNDED'].includes(invoice.status)) {
    throw new Error(`Cannot requote invoice in status ${invoice.status}`);
  }

  const quote = await createQuote({
    invoiceId,
    usdAmount: invoice.usdAmount,
    settlementAsset: invoice.settlementAsset,
  });
  db.saveQuote(quote);

  return db.updateInvoice(invoiceId, {
    status: 'AWAITING_PAYMENT',
    bchAmountSats: quote.bchAmountSats,
    currentQuoteId: quote.id,
    quoteExpiresAt: quote.expiresAt,
  })!;
}

export function getInvoiceWithQuote(invoiceId: string) {
  const invoice = db.getInvoice(invoiceId);
  if (!invoice) return null;
  const quote = invoice.currentQuoteId
    ? db.getQuote(invoice.currentQuoteId)
    : undefined;
  return { invoice, quote };
}

export function markPaymentDetected(
  invoiceId: string,
  txId: string,
  amountSats: number
) {
  const invoice = db.getInvoice(invoiceId);
  if (!invoice) throw new Error('Invoice not found');

  let status: Invoice['status'] = 'PAYMENT_DETECTED';
  if (invoice.bchAmountSats) {
    if (amountSats < invoice.bchAmountSats * 0.99) status = 'UNDERPAID';
    else if (amountSats > invoice.bchAmountSats * 1.05) status = 'OVERPAID';
    else status = 'PAYMENT_VALIDATED';
  }

  return db.updateInvoice(invoiceId, {
    status,
    paymentTxId: txId,
    paymentDetectedAt: new Date().toISOString(),
  });
}
