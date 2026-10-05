import { NextRequest, NextResponse } from 'next/server';
import { checkPaymentOnChain } from '@/services/invoice/service';

/**
 * Real payment check via Electrum (blockchain.scripthash.listunspent).
 * Does NOT invent txids. Client may poll; no "mark paid" shortcut.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const result = await checkPaymentOnChain(id);
    return NextResponse.json({
      invoice_id: result.invoice?.id,
      status: result.invoice?.status,
      payment_txid: result.invoice?.paymentTxId,
      payment_detected_at: result.invoice?.paymentDetectedAt,
      found: result.found,
      already_final: result.alreadyFinal,
      note: result.found
        ? 'Payment matched on-chain via Electrum'
        : 'No matching UTXO yet — pay the exact quoted sats to the merchant cashaddr',
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Check failed';
    const status = msg === 'Invoice not found' ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  return POST(req, ctx);
}
