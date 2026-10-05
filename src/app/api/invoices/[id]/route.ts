import { NextRequest, NextResponse } from 'next/server';
import { getInvoiceWithQuote, refreshQuote } from '@/services/invoice/service';
import { isQuoteExpired } from '@/services/quote/engine';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const data = getInvoiceWithQuote(id);
  if (!data) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  }

  let { invoice, quote } = data;

  // Auto-refresh expired quote while still awaiting payment
  if (
    quote &&
    isQuoteExpired(quote) &&
    ['AWAITING_PAYMENT', 'QUOTED', 'CREATED'].includes(invoice.status)
  ) {
    try {
      invoice = await refreshQuote(id);
      quote = getInvoiceWithQuote(id)?.quote;
    } catch (e) {
      // leave as-is; client can request refresh
    }
  }

  return NextResponse.json({
    invoice_id: invoice.id,
    merchant_id: invoice.merchantId,
    description: invoice.description,
    usd_amount: invoice.usdAmount,
    settlement_asset: invoice.settlementAsset,
    status: invoice.status,
    payment_address: invoice.paymentAddress,
    bch_amount: quote?.bchAmount ?? null,
    bch_amount_sats: invoice.bchAmountSats,
    expected_settlement: quote?.expectedSettlementAmount ?? null,
    route_summary: quote?.routeSummary ?? null,
    conversion_fee_bps: quote?.conversionFeeBps ?? null,
    price_impact_bps: quote?.priceImpactBps ?? null,
    bch_usd_price: quote?.bchUsdPrice ?? null,
    expires_at: quote?.expiresAt ?? null,
    quote_id: quote?.id ?? null,
    payment_txid: invoice.paymentTxId,
    settlement_txid: invoice.settlementTxId,
    settled_amount: invoice.settledAmount,
    created_at: invoice.createdAt,
    updated_at: invoice.updatedAt,
  });
}
