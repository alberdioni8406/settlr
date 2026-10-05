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
  bchAddress: z.string().min(15),
  pusdAddress: z.string().optional(),
  defaultSettlement: z.enum(['BCH', 'PUSD', 'MUSD', 'PER_INVOICE']).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const parsed = createSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { address: bch } = decodeCashaddr(parsed.data.bchAddress);
    let pusd: string | undefined;
    if (parsed.data.pusdAddress?.trim()) {
      pusd = decodeCashaddr(parsed.data.pusdAddress).address;
    }

    const merchant = db.createMerchant({
      name: parsed.data.name,
      defaultSettlement: parsed.data.defaultSettlement || 'BCH',
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
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
