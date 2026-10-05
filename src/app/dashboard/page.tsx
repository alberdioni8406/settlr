'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface InvoiceRow {
  invoice_id: string;
  usd_amount: number;
  settlement_asset: string;
  status: string;
  bch_amount: string | null;
  payment_txid: string | null;
  payment_address?: string;
  created_at: string;
}

export default function DashboardPage() {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [checking, setChecking] = useState<string | null>(null);

  async function load() {
    const ids = JSON.parse(
      sessionStorage.getItem('settlr_invoice_ids') || '[]'
    ) as string[];
    const rows: InvoiceRow[] = [];
    for (const id of ids.slice(0, 20)) {
      try {
        const res = await fetch(`/api/invoices/${id}`, { cache: 'no-store' });
        if (res.ok) {
          const j = await res.json();
          rows.push({
            invoice_id: j.invoice_id,
            usd_amount: j.usd_amount,
            settlement_asset: j.settlement_asset,
            status: j.status,
            bch_amount: j.bch_amount,
            payment_txid: j.payment_txid,
            payment_address: j.payment_address,
            created_at: j.created_at,
          });
        }
      } catch {
        /* skip */
      }
    }
    setInvoices(rows);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  async function checkChain(id: string) {
    setChecking(id);
    setMsg(null);
    try {
      const res = await fetch(`/api/invoices/${id}/detect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const j = await res.json();
      if (res.ok) {
        setMsg(
          j.found
            ? `On-chain: ${j.status} · tx ${j.payment_txid}`
            : j.note || 'No matching UTXO yet'
        );
        load();
      } else {
        setMsg(j.error || 'Check failed');
      }
    } catch {
      setMsg('Electrum check failed');
    } finally {
      setChecking(null);
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Merchant dashboard</h1>
          <p className="text-sm text-[var(--text-muted)]">
            Non-custodial · payments go to your cashaddr
          </p>
        </div>
        <Link href="/merchant" className="btn btn-primary no-underline">
          New invoice
        </Link>
      </div>

      <div className="grid sm:grid-cols-4 gap-4 mb-10">
        {[
          { l: 'Tracked invoices', v: String(invoices.length) },
          {
            l: 'Awaiting payment',
            v: String(
              invoices.filter((i) => i.status === 'AWAITING_PAYMENT').length
            ),
          },
          {
            l: 'Validated / required',
            v: String(
              invoices.filter((i) =>
                [
                  'PAYMENT_VALIDATED',
                  'SETTLEMENT_REQUIRED',
                  'SETTLING',
                  'SETTLED',
                ].includes(i.status)
              ).length
            ),
          },
          {
            l: 'Settled',
            v: String(invoices.filter((i) => i.status === 'SETTLED').length),
          },
        ].map((s) => (
          <div key={s.l} className="card p-4">
            <p className="label mb-1">{s.l}</p>
            <p className="text-xl font-semibold mono">{s.v}</p>
          </div>
        ))}
      </div>

      {msg && (
        <p className="mb-4 text-sm text-[var(--accent)] mono">{msg}</p>
      )}

      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--border)] font-semibold">
          Recent invoices
        </div>
        {invoices.length === 0 ? (
          <div className="p-6 text-sm text-[var(--text-muted)]">
            No invoices in this browser session yet. Onboard with your cashaddr
            on the Merchant page, then create an invoice.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--text-muted)] border-b border-[var(--border)]">
                  <th className="px-4 py-2 font-medium">ID</th>
                  <th className="px-4 py-2 font-medium">USD</th>
                  <th className="px-4 py-2 font-medium">BCH</th>
                  <th className="px-4 py-2 font-medium">Settle</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr
                    key={inv.invoice_id}
                    className="border-b border-[var(--border)]"
                  >
                    <td className="px-4 py-2 mono text-xs">
                      <Link href={`/pay/${inv.invoice_id}`}>
                        {inv.invoice_id.slice(0, 10)}…
                      </Link>
                    </td>
                    <td className="px-4 py-2 mono">
                      ${inv.usd_amount.toFixed(2)}
                    </td>
                    <td className="px-4 py-2 mono">{inv.bch_amount ?? '—'}</td>
                    <td className="px-4 py-2">{inv.settlement_asset}</td>
                    <td className="px-4 py-2">
                      <span className="text-xs px-2 py-0.5 rounded border border-[var(--border)]">
                        {inv.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 space-x-2">
                      <Link
                        href={`/pay/${inv.invoice_id}`}
                        className="text-xs"
                      >
                        Open
                      </Link>
                      {inv.status === 'AWAITING_PAYMENT' && (
                        <button
                          type="button"
                          className="text-xs text-[var(--accent)]"
                          onClick={() => checkChain(inv.invoice_id)}
                          disabled={checking === inv.invoice_id}
                          title="Query Electrum for a matching UTXO"
                        >
                          {checking === inv.invoice_id
                            ? 'Checking…'
                            : 'Check chain'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="mt-6 text-xs text-[var(--text-muted)]">
        Payment detection uses Electrum listunspent against your merchant
        cashaddr and the exact quoted sats (including attribution tag). There
        is no demo mark-paid path.
      </p>
    </div>
  );
}
