import { NextRequest, NextResponse } from 'next/server';
import { buildSettlementPlan } from '@/services/settlement/plan';
import { decodeTokenReceiveAddress } from '@/lib/bch/cashaddr';
import { z } from 'zod';

/**
 * POST /api/settle/plan
 * Returns an UNSIGNED Cauldron settlement plan for external signers.
 *
 * Body:
 * {
 *   settlementAsset: "PUSD",
 *   bchSatsIn: number,
 *   tokenDestination: "bitcoincash:z...",
 *   paymentTxId?: string
 * }
 */
const bodySchema = z.object({
  settlementAsset: z.enum(['PUSD', 'MUSD']),
  bchSatsIn: z.number().int().positive(),
  tokenDestination: z.string().min(1),
  paymentTxId: z.string().optional().nullable(),
});

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid body', details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    let dest: string;
    try {
      dest = decodeTokenReceiveAddress(parsed.data.tokenDestination).address;
    } catch (e: unknown) {
      return NextResponse.json(
        {
          error: e instanceof Error ? e.message : 'Invalid token destination',
          field: 'tokenDestination',
        },
        { status: 400 }
      );
    }

    const plan = await buildSettlementPlan({
      settlementAsset: parsed.data.settlementAsset,
      bchSatsIn: parsed.data.bchSatsIn,
      tokenDestination: dest,
      paymentTxId: parsed.data.paymentTxId,
    });

    return NextResponse.json({
      plan,
      plugin: {
        id: 'settlr.settlement.plan.v1',
        description:
          'Drop-in plan for your own CashLab / SDK / agent. Settlr does not sign.',
        how_to_use: [
          '1. Detect BCH payment (or use /api/watch).',
          '2. POST this endpoint with paid sats + your z… address.',
          '3. Feed plan.pools into CashLab ExchangeLab or cauldron-swap-sdk.',
          '4. Sign with the key that controls the payment UTXO.',
          '5. Broadcast; optionally verify token output on token_destination.',
        ],
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Plan failed';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
