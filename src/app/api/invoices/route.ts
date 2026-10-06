import { NextRequest, NextResponse } from 'next/server';
import { createQuote } from '@/services/quote/engine';
import { decodeBchReceiveAddress } from '@/lib/bch/cashaddr';
import { isSettlementEnabled } from '@/services/registry/assets';
import { z } from 'zod';
import { uid } from '@/lib/utils/id';

/**
 * Invoice creation is address-first.
 * Server-side merchant memory is unreliable on Vercel, so the browser
 * always sends the cashaddr. merchantId is only a client tag.
 */
const bodySchema = z.object({
  merchantId: z.string().min(1).optional(),
  usdAmount: z.number().positive().max(1_000_000),
  description: z.string().max(200).optional(),
  settlementAsset: z.enum(['BCH', 'PUSD', 'MUSD']).optional(),
  bchAddress: z.string().min(1),
  pusdAddress: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Invalid request',
          details: parsed.error.flatten(),
          hint: 'bchAddress is required (your merchant cashaddr).',
        },
        { status: 400 }
      );
    }

    const settlement = parsed.data.settlementAsset || 'BCH';
    if (!isSettlementEnabled(settlement)) {
      return NextResponse.json(
        {
          error: `Settlement asset ${settlement} is not enabled`,
          hint: settlement === 'MUSD' ? 'MUSD is disabled until contract health is verified.' : undefined,
        },
        { status: 400 }
      );
    }

    let address: string;
    try {
      address = decodeBchReceiveAddress(parsed.data.bchAddress).address;
    } catch (e: unknown) {
      return NextResponse.json(
        {
          error: e instanceof Error ? e.message : 'Invalid BCH cashaddr',
          field: 'bchAddress',
        },
        { status: 400 }
      );
    }

    if (settlement === 'PUSD' && !parsed.data.pusdAddress?.trim()) {
      return NextResponse.json(
        {
          error:
            'PUSD invoices need a token-aware receive address (bitcoincash:z…).',
          field: 'pusdAddress',
        },
        { status: 400 }
      );
    }

    const invoiceId = uid(16);
    const quote = await createQuote({
      invoiceId,
      usdAmount: parsed.data.usdAmount,
      settlementAsset: settlement,
    });

    // Satoshi tag for attribution on shared merchant addresses
    const tag = (Date.now() % 997) + 1;
    const tagged = quote.bchAmountSats + tag;
    quote.bchAmountSats = tagged;
    quote.bchAmount = (tagged / 1e8).toFixed(8);

    return NextResponse.json({
      invoice_id: invoiceId,
      merchant_id: parsed.data.merchantId || 'local',
      payment_uri: `bitcoincash:${address.replace('bitcoincash:', '')}?amount=${quote.bchAmount}`,
      payment_address: address,
      bch_amount: quote.bchAmount,
      bch_amount_sats: quote.bchAmountSats,
      usd_amount: parsed.data.usdAmount,
      settlement_asset: settlement,
      pusd_address: parsed.data.pusdAddress || null,
      expected_settlement: quote.expectedSettlementAmount,
      route_summary: quote.routeSummary,
      conversion_fee_bps: quote.conversionFeeBps,
      price_impact_bps: quote.priceImpactBps,
      expires_at: quote.expiresAt,
      status: 'AWAITING_PAYMENT',
      quote_id: quote.id,
      description: parsed.data.description || null,
      persisted: 'browser',
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
