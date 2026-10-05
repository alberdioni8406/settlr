import { NextResponse } from 'next/server';
import { db } from '@/lib/db/store';

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
