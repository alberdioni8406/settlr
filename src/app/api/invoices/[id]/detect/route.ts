import { NextRequest, NextResponse } from 'next/server';
import { checkPaymentOnChain } from '@/services/invoice/service';
import { listUnspent, matchPayment } from '@/lib/bch/electrum';
import { decodeBchReceiveAddress } from '@/lib/bch/cashaddr';

/**
 * Chain check. Uses the server invoice if it still exists.
 * Otherwise accepts { address, expectedSats } so Vercel memory loss does not hide payments.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  try {
    const result = await checkPaymentOnChain(id);
    return NextResponse.json({
      invoice_id: result.invoice?.id,
      status: result.invoice?.status,
      payment_txid: result.invoice?.paymentTxId,
      found: result.found,
      note: result.found
        ? 'Payment matched on-chain'
        : 'No matching UTXO yet',
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Check failed';
    if (msg !== 'Invoice not found' && !body.address) {
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  try {
    if (!body.address || !body.expectedSats) {
      return NextResponse.json(
        {
          error:
            'Invoice is not on this server instance. Send address and expectedSats from the browser ledger.',
        },
        { status: 404 }
      );
    }
    const decoded = decodeBchReceiveAddress(String(body.address));
    const { utxos, source } = await listUnspent(decoded.address);
    const expected = Number(body.expectedSats);
    const match = matchPayment(utxos, expected);
    const settlement = String(body.settlementAsset || 'BCH');
    const status = !match
      ? 'AWAITING_PAYMENT'
      : Math.abs(match.value - expected) <= 50
        ? settlement === 'BCH'
          ? 'SETTLED'
          : 'SETTLEMENT_REQUIRED'
        : match.value < expected
          ? 'UNDERPAID'
          : 'OVERPAID';
    return NextResponse.json({
      invoice_id: id,
      found: Boolean(match),
      status,
      payment_txid: match?.tx_hash ?? null,
      paid_sats: match?.value ?? null,
      source,
      note: match
        ? 'Payment matched on-chain'
        : `No output close to ${expected} sats (${utxos.length} UTXOs seen via ${source})`,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Check failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
