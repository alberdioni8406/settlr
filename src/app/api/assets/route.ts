import { NextResponse } from 'next/server';
import { SUPPORTED_ASSETS } from '@/services/registry/assets';

export async function GET() {
  const assets = Object.values(SUPPORTED_ASSETS).map((a) => ({
    symbol: a.symbol,
    name: a.name,
    token_id: a.tokenId,
    decimals: a.decimals,
    settlement_enabled: a.settlementEnabled,
    active: a.active,
  }));
  return NextResponse.json({ assets });
}
