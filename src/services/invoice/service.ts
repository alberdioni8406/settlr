import type { Invoice, SettlementAsset } from '@/types';
import { db } from '@/lib/db/store';
import { createQuote } from '@/services/quote/engine';
import { isSettlementEnabled } from '@/services/registry/assets';
import { decodeCashaddr, normalizeCashaddr } from '@/lib/bch/cashaddr';
import { findPayment } from '@/lib/bch/electrum';

/** Unique 1–999 sat tag so shared merchant addresses can attribute invoices. */
function allocateSatoshiTag(merchantId: string, baseSats: number): number {
  const existing = db.listInvoicesByMerchant(merchantId);
  const used = new Set(
    existing
      .filter((i) => i.bchAmountSats != null && i.status === 'AWAITING_PAYMENT')
      .map((i) => (i.bchAmountSats! % 1000 === 0 ? 0 : i.bchAmountSats! % 1000))
  );
  for (let tag = 1; tag < 1000; tag++) {
    if (!used.has(tag)) return baseSats + tag;
  }
  return baseSats + (Date.now() % 999) + 1;
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

  const dest = merchant.destinations?.BCH;
  if (!dest) {
    throw new Error(
      'Merchant has no BCH destination. Register a cashaddr you control.'
    );
  }
  const { address: paymentAddress } = decodeCashaddr(dest);

  let settlement: SettlementAsset =
    input.settlementAsset ||
    (merchant.defaultSettlement === 'PER_INVOICE'
      ? 'BCH'
      : merchant.defaultSettlement);

  if (!isSettlementEnabled(settlement)) {
    settlement = 'BCH';
  }

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

  const quote = await createQuote({
    invoiceId: invoice.id,
    usdAmount: input.usdAmount,
    settlementAsset: settlement,
  });

  const taggedSats = allocateSatoshiTag(input.merchantId, quote.bchAmountSats);
  quote.bchAmountSats = taggedSats;
  quote.bchAmount = (taggedSats / 1e8).toFixed(8);
  db.saveQuote(quote);

  const updated = db.updateInvoice(invoice.id, {
    status: 'AWAITING_PAYMENT',
    bchAmountSats: taggedSats,
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
  const taggedSats = allocateSatoshiTag(invoice.merchantId, quote.bchAmountSats);
  quote.bchAmountSats = taggedSats;
  quote.bchAmount = (taggedSats / 1e8).toFixed(8);
  db.saveQuote(quote);

  return db.updateInvoice(invoiceId, {
    status: 'AWAITING_PAYMENT',
    bchAmountSats: taggedSats,
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

export function applyPaymentDetection(
  invoiceId: string,
  txId: string,
  amountSats: number
) {
  const invoice = db.getInvoice(invoiceId);
  if (!invoice) throw new Error('Invoice not found');
  if (!invoice.bchAmountSats) throw new Error('Invoice has no quoted amount');

  let status: Invoice['status'] = 'PAYMENT_DETECTED';
  if (amountSats === invoice.bchAmountSats) {
    status =
      invoice.settlementAsset === 'BCH' ? 'SETTLED' : 'SETTLEMENT_REQUIRED';
  } else if (amountSats < invoice.bchAmountSats * 0.99) {
    status = 'UNDERPAID';
  } else if (amountSats > invoice.bchAmountSats * 1.05) {
    status = 'OVERPAID';
  } else {
    status =
      invoice.settlementAsset === 'BCH' ? 'SETTLED' : 'PAYMENT_VALIDATED';
  }

  return db.updateInvoice(invoiceId, {
    status,
    paymentTxId: txId,
    paymentDetectedAt: new Date().toISOString(),
    settledAmount:
      status === 'SETTLED' ? (amountSats / 1e8).toFixed(8) + ' BCH' : null,
  });
}

/** Poll Electrum for this invoice's payment (real chain only). */
export async function checkPaymentOnChain(invoiceId: string) {
  const invoice = db.getInvoice(invoiceId);
  if (!invoice) throw new Error('Invoice not found');
  if (!invoice.bchAmountSats) throw new Error('Invoice has no quoted amount');
  if (['SETTLED', 'EXPIRED', 'REFUNDED'].includes(invoice.status)) {
    return { invoice, found: false, alreadyFinal: true };
  }

  const utxo = await findPayment(
    normalizeCashaddr(invoice.paymentAddress),
    invoice.bchAmountSats
  );
  if (!utxo) {
    return { invoice, found: false, alreadyFinal: false };
  }

  const updated = applyPaymentDetection(invoiceId, utxo.tx_hash, utxo.value);
  return { invoice: updated, found: true, alreadyFinal: false, utxo };
}

export function markPaymentDetected(
  invoiceId: string,
  txId: string,
  amountSats: number
) {
  return applyPaymentDetection(invoiceId, txId, amountSats);
}
