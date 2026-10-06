'use client';

import { useEffect, useState, use } from 'react';
import { getInvoice, updateInvoice, type LocalInvoice } from '@/lib/client/invoices';

export default function PayPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [data, setData] = useState<LocalInvoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function watch(inv: LocalInvoice) {
    if (!inv.payment_address || !inv.bch_amount_sats) return;
    if (inv.status === 'SETTLED' || inv.status === 'SETTLEMENT_REQUIRED') return;
    try {
      const res = await fetch('/api/watch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: inv.payment_address,
          expectedSats: inv.bch_amount_sats,
          settlementAsset: inv.settlement_asset,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        setNote(j.error || 'Chain check failed');
        return;
      }
      setNote(j.note || null);
      if (j.found) {
        const next = updateInvoice(inv.invoice_id, {
          status: j.status,
          payment_txid: j.payment_txid,
        });
        if (next) setData(next);
      }
    } catch {
      setNote('Chain check failed');
    }
  }

  useEffect(() => {
    const local = getInvoice(id);
    if (local) {
      setData(local);
      setError(null);
      watch(local);
    } else {
      setError('Invoice not in this browser. Create it again from the Merchant page on this device.');
    }
    const t = setInterval(() => {
      const current = getInvoice(id);
      if (current) {
        setData(current);
        watch(current);
      }
    }, 12000);
    return () => clearInterval(t);
  }, [id]);

  if (error) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <p className="error-box">{error}</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center text-[var(--text-muted)]">
        Loading payment request…
      </div>
    );
  }

  const isWaiting = data.status === 'AWAITING_PAYMENT';
  const uri = `bitcoincash:${data.payment_address.replace('bitcoincash:', '')}${
    data.bch_amount ? `?amount=${data.bch_amount}` : ''
  }`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(uri)}`;

  return (
    <div className="max-w-md mx-auto px-4 py-10">
      <div className="card p-6 sm:p-8 text-center">
        <p className="label mb-1">Payment request</p>
        <h1 className="display text-4xl font-bold tracking-tight mb-1">
          ${data.usd_amount.toFixed(2)}
          <span className="text-lg text-[var(--text-muted)] font-normal"> USD</span>
        </h1>
        <p className="text-sm text-[var(--text-muted)] mb-2">Pay the exact amount</p>
        <p className="mono text-[var(--orange)] mb-6">{data.bch_amount} BCH · {data.bch_amount_sats} sats</p>

        {isWaiting && (
          <div className="inline-block p-3 bg-white rounded-xl mb-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrUrl} alt="BCH payment QR" width={220} height={220} />
          </div>
        )}

        <p className="mono text-xs break-all text-[var(--text-muted)] mb-4">{data.payment_address}</p>
        <p className="text-xs mb-4">
          Status: <span className="text-[var(--accent)]">{data.status}</span>
          {data.payment_txid ? ` · ${data.payment_txid.slice(0, 12)}…` : ''}
        </p>
        {note && <p className="text-xs text-[var(--text-muted)] mb-4">{note}</p>}
        {data.status === 'SETTLEMENT_REQUIRED' && (
          <p className="text-sm text-[var(--orange)]">
            BCH received. PUSD still needs a merchant-signed Cauldron swap.
          </p>
        )}
        {data.status === 'SETTLED' && (
          <p className="text-sm text-[var(--accent)]">Paid to your cashaddr. Settlr did not take custody.</p>
        )}
      </div>
    </div>
  );
}
