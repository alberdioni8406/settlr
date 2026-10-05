import { NextRequest, NextResponse } from 'next/server';
import { markPaymentDetected, getInvoiceWithQuote } from '@/services/invoice/service';
import { z } from 'zod';

/**
 * DEMO / TEST endpoint only.
 * Marks a payment as detected for state-machine testing.
 * Does NOT query the blockchain. Real payment detection must use
 * Electrum/Rostrum monitoring of the invoice payment address.
 */
const bodySchema = z.object({
  txId: z.string().min(8).optional(),
  amountSats: z.number().int().positive().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const data = getInvoiceWithQuote(id);
  if (!data) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  }

  try {
    const json = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
    }

    const amountSats =
      parsed.data.amountSats ?? data.invoice.bchAmountSats ?? 0;
    const txId =
      parsed.data.txId ??
      `demo_${Date.now().toString(16)}_${Math.random().toString(16).slice(2, 10)}`;

    const updated = markPaymentDetected(id, txId, amountSats);
    return NextResponse.json({
      note: 'DEMO ONLY — not a real blockchain detection',
      invoice_id: updated?.id,
      status: updated?.status,
      payment_txid: updated?.paymentTxId,
      payment_detected_at: updated?.paymentDetectedAt,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
