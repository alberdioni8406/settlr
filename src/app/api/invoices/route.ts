import { NextRequest, NextResponse } from 'next/server';
import { createInvoice } from '@/services/invoice/service';
import { z } from 'zod';

const bodySchema = z.object({
  merchantId: z.string().min(1),
  usdAmount: z.number().positive().max(1_000_000),
  description: z.string().max(200).optional(),
  settlementAsset: z.enum(['BCH', 'PUSD', 'MUSD']).optional(),
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

    const { invoice, quote } = await createInvoice(parsed.data);

    return NextResponse.json({
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
    });
  } catch (e: any) {
    console.error('create invoice error', e);
    return NextResponse.json(
      { error: e.message || 'Internal error' },
      { status: 500 }
    );
  }
}
