import { NextRequest, NextResponse } from 'next/server';
import { listUnspent, matchPayment } from '@/lib/bch/electrum';
import { decodeBchReceiveAddress } from '@/lib/bch/cashaddr';

/**
 * Stateless chain watch. Does not need the server invoice store.
 * Body: { address, expectedSats, settlementAsset? }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const address = String(body.address || '');
    const expectedSats = Number(body.expectedSats || 0);
    if (!address || !expectedSats) {
      return NextResponse.json(
        { error: 'address and expectedSats are required' },
        { status: 400 }
      );
    }
    const decoded = decodeBchReceiveAddress(address);
    const { utxos, source } = await listUnspent(decoded.address);
    const match = matchPayment(utxos, expectedSats);
    const settlement = String(body.settlementAsset || 'BCH');
    let status = 'AWAITING_PAYMENT';
    if (match) {
      if (Math.abs(match.value - expectedSats) <= 50) {
        status = settlement === 'BCH' ? 'SETTLED' : 'SETTLEMENT_REQUIRED';
      } else if (match.value < expectedSats) {
        status = 'UNDERPAID';
      } else {
        status = 'OVERPAID';
      }
    }
    return NextResponse.json({
      found: Boolean(match),
      status,
      payment_txid: match?.tx_hash ?? null,
      paid_sats: match?.value ?? null,
      expected_sats: expectedSats,
      source,
      utxo_count: utxos.length,
      nearest: utxos
        .slice()
        .sort(
          (a, b) =>
            Math.abs(a.value - expectedSats) - Math.abs(b.value - expectedSats)
        )
        .slice(0, 3)
        .map((u) => ({ tx: u.tx_hash, sats: u.value })),
      note: match
        ? 'Matching output found on the merchant address'
        : utxos.length
          ? `Address has ${utxos.length} UTXO(s), none close to ${expectedSats} sats. Pay the exact quoted amount.`
          : 'No unspent outputs on this address yet',
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Watch failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
