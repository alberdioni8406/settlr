import { NextRequest, NextResponse } from 'next/server';
import { createInvoice } from '@/services/invoice/service';
import { createQuote } from '@/services/quote/engine';
import { decodeBchReceiveAddress } from '@/lib/bch/cashaddr';
import { isSettlementEnabled } from '@/services/registry/assets';
import { z } from 'zod';
import { uid } from '@/lib/utils/id';

const bodySchema = z.object({
  merchantId: z.string().min(1),
  usdAmount: z.number().positive().max(1_000_000),
  description: z.string().max(200).optional(),
  settlementAsset: z.enum(['BCH', 'PUSD', 'MUSD']).optional(),
  /** Used when the server no longer has the merchant (Vercel memory). */
  bchAddress: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    try {
      const { invoice, quote } = await createInvoice(parsed.data);
      return NextResponse.json(payload(invoice, quote));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '';
      if (!msg.includes('Merchant not found') || !parsed.data.bchAddress) {
        throw e;
      }
    }

    const settlement = parsed.data.settlementAsset || 'BCH';
    if (!isSettlementEnabled(settlement)) {
      return NextResponse.json(
        { error: `Settlement asset ${settlement} is not enabled` },
        { status: 400 }
      );
    }
    const { address } = decodeBchReceiveAddress(parsed.data.bchAddress!);
    const invoiceId = uid(16);
    const quote = await createQuote({
      invoiceId,
      usdAmount: parsed.data.usdAmount,
      settlementAsset: settlement,
    });
    const tagged = quote.bchAmountSats + ((Date.now() % 997) + 1);
    quote.bchAmountSats = tagged;
    quote.bchAmount = (tagged / 1e8).toFixed(8);

    return NextResponse.json({
      invoice_id: invoiceId,
      payment_uri: `bitcoincash:${address.replace('bitcoincash:', '')}?amount=${quote.bchAmount}`,
      payment_address: address,
      bch_amount: quote.bchAmount,
      bch_amount_sats: quote.bchAmountSats,
      usd_amount: parsed.data.usdAmount,
      settlement_asset: settlement,
      expected_settlement: quote.expectedSettlementAmount,
      route_summary: quote.routeSummary,
      conversion_fee_bps: quote.conversionFeeBps,
      price_impact_bps: quote.priceImpactBps,
      expires_at: quote.expiresAt,
      status: 'AWAITING_PAYMENT',
      quote_id: quote.id,
      persisted: 'browser',
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

function payload(
  invoice: {
    id: string;
    paymentAddress: string;
    usdAmount: number;
    settlementAsset: string;
    status: string;
  },
  quote: {
    bchAmount: string;
    bchAmountSats: number;
    expectedSettlementAmount: string;
    routeSummary?: string;
    conversionFeeBps?: number;
    priceImpactBps?: number;
    expiresAt: string;
    id: string;
  }
) {
  return {
    invoice_id: invoice.id,
    payment_uri: `bitcoincash:${invoice.paymentAddress.replace('bitcoincash:', '')}?amount=${quote.bchAmount}`,
    payment_address: invoice.paymentAddress,
    bch_amount: quote.bchAmount,
    bch_amount_sats: quote.bchAmountSats,
    usd_amount: invoice.usdAmount,
    settlement_asset: invoice.settlementAsset,
    expected_settlement: quote.expectedSettlementAmount,
    route_summary: quote.routeSummary,
    conversion_fee_bps: quote.conversionFeeBps,
    price_impact_bps: quote.priceImpactBps,
    expires_at: quote.expiresAt,
    status: invoice.status,
    quote_id: quote.id,
  };
}
