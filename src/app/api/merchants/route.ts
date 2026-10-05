import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/store';
import { decodeCashaddr } from '@/lib/bch/cashaddr';
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
  /** CashToken-capable cashaddr where PUSD should land after swap */
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
          hint: 'Provide name, bchAddress, and pusdAddress when settling in PUSD.',
        },
        { status: 400 }
      );
    }

    let bch: string;
    try {
      bch = decodeCashaddr(parsed.data.bchAddress).address;
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
      const raw = parsed.data.pusdAddress?.trim() || parsed.data.bchAddress;
      try {
        pusd = decodeCashaddr(raw).address;
      } catch (e: unknown) {
        return NextResponse.json(
          {
            error:
              e instanceof Error
                ? `PUSD CashToken destination: ${e.message}`
                : 'Invalid PUSD cashaddr',
            field: 'pusdAddress',
            hint: 'Use a token-capable wallet cashaddr (still bitcoincash:q…). Same as BCH address is fine if that wallet supports CashTokens.',
          },
          { status: 400 }
        );
      }
    }

    if (settlement === 'PUSD' && !pusd) {
      return NextResponse.json(
        {
          error:
            'PUSD settlement requires a CashToken-capable cashaddr (pusdAddress).',
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
          ? 'PUSD will target destinations.PUSD after a merchant-signed Cauldron swap. Customer still pays BCH to destinations.BCH.'
          : 'BCH payments go directly to destinations.BCH.',
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
