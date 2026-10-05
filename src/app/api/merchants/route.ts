import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/store';
import {
  decodeBchReceiveAddress,
  decodeTokenReceiveAddress,
} from '@/lib/bch/cashaddr';
import { z } from 'zod';

export async function GET() {
  const merchants = db.listMerchants().map((m) => ({
    id: m.id,
    name: m.name,
    default_settlement: m.defaultSettlement,
    destinations: m.destinations,
    created_at: m.createdAt,
  }));
  return NextResponse.json({ merchants });
}

const createSchema = z.object({
  name: z.string().min(1).max(80),
  bchAddress: z.string().min(1),
  /** Token-aware cashaddr (z…) where PUSD CashTokens should land */
  pusdAddress: z.string().optional(),
  defaultSettlement: z.enum(['BCH', 'PUSD', 'MUSD', 'PER_INVOICE']).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const parsed = createSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Invalid request body',
          details: parsed.error.flatten(),
          hint: 'BCH: bitcoincash:q… or z… · PUSD: bitcoincash:z… (token-aware)',
        },
        { status: 400 }
      );
    }

    let bch: string;
    try {
      bch = decodeBchReceiveAddress(parsed.data.bchAddress).address;
    } catch (e: unknown) {
      return NextResponse.json(
        {
          error: e instanceof Error ? e.message : 'Invalid BCH cashaddr',
          field: 'bchAddress',
        },
        { status: 400 }
      );
    }

    const settlement = parsed.data.defaultSettlement || 'BCH';
    let pusd: string | undefined;

    if (settlement === 'PUSD' || parsed.data.pusdAddress?.trim()) {
      const raw = parsed.data.pusdAddress?.trim();
      if (!raw) {
        return NextResponse.json(
          {
            error:
              'PUSD settlement requires a token-aware cashaddr starting with z (e.g. bitcoincash:z…). A plain q… address cannot receive CashTokens.',
            field: 'pusdAddress',
          },
          { status: 400 }
        );
      }
      try {
        pusd = decodeTokenReceiveAddress(raw).address;
      } catch (e: unknown) {
        return NextResponse.json(
          {
            error: e instanceof Error ? e.message : 'Invalid PUSD cashaddr',
            field: 'pusdAddress',
            hint: 'Example: bitcoincash:zz7pjvq99kylyvns6fjmyawjhxwnucgn2qwyae2ye9',
          },
          { status: 400 }
        );
      }
    }

    if (settlement === 'PUSD' && !pusd) {
      return NextResponse.json(
        {
          error: 'PUSD settlement requires destinations.PUSD (token-aware z… address).',
          field: 'pusdAddress',
        },
        { status: 400 }
      );
    }

    const merchant = db.createMerchant({
      name: parsed.data.name,
      defaultSettlement: settlement,
      destinations: {
        BCH: bch,
        ...(pusd ? { PUSD: pusd } : {}),
      },
    });

    return NextResponse.json({
      id: merchant.id,
      name: merchant.name,
      default_settlement: merchant.defaultSettlement,
      destinations: merchant.destinations,
      created_at: merchant.createdAt,
      note:
        settlement === 'PUSD'
          ? 'Customer pays BCH to destinations.BCH. PUSD CashTokens target destinations.PUSD after a merchant-signed Cauldron swap.'
          : 'BCH payments go directly to destinations.BCH.',
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
