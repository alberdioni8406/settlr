'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  loadInvoices,
  updateInvoice,
  type LocalInvoice,
} from '@/lib/client/invoices';

export default function DashboardPage() {
  const [invoices, setInvoices] = useState<LocalInvoice[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [checking, setChecking] = useState<string | null>(null);
  const [planJson, setPlanJson] = useState<string | null>(null);

  function load() {
    setInvoices(loadInvoices());
  }

  useEffect(() => {
    load();
  }, []);

  async function checkChain(inv: LocalInvoice) {
    setChecking(inv.invoice_id);
    setMsg(null);
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
        setMsg(j.error || 'Check failed');
        return;
      }
      if (j.found) {
        updateInvoice(inv.invoice_id, {
          status: j.status,
          payment_txid: j.payment_txid,
        });
        load();
        setMsg(`On-chain ${j.status} · ${j.paid_sats} sats · tx ${j.payment_txid}`);
      } else {
        const near = (j.nearest || [])
          .map((n: { sats: number }) => `${n.sats} sats`)
          .join(', ');
        setMsg(
          near
            ? `${j.note} Closest: ${near}`
            : j.note || 'No matching payment yet'
        );
      }
    } catch {
      setMsg('Chain check failed');
    } finally {
      setChecking(null);
    }
  }

  async function buildPlan(inv: LocalInvoice) {
    setMsg(null);
    setPlanJson(null);
    const dest = inv.pusd_address;
    if (!dest) {
      setMsg('This invoice has no PUSD (z…) destination. Re-create with a token address.');
      return;
    }
    const sats = inv.bch_amount_sats;
    if (!sats) {
      setMsg('Missing quoted sats');
      return;
    }
    try {
      const res = await fetch('/api/settle/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settlementAsset: inv.settlement_asset === 'MUSD' ? 'MUSD' : 'PUSD',
          bchSatsIn: sats,
          tokenDestination: dest,
          paymentTxId: inv.payment_txid,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        setMsg(j.error || 'Plan failed');
        return;
      }
      updateInvoice(inv.invoice_id, { settlement_plan: j.plan });
      load();
      setPlanJson(JSON.stringify(j, null, 2));
      setMsg(
        `Unsigned plan ready · ~${j.plan.estimated_tokens_human} · ${j.plan.pools.length} pools. Use your own CashLab/SDK agent to sign.`
      );
    } catch {
      setMsg('Could not build settlement plan');
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="display text-2xl font-bold glow-text">Merchant dashboard</h1>
          <p className="text-sm text-[var(--text-muted)]">
            Browser ledger · optional unsigned PUSD plans for your own signer
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
            v: String(invoices.filter((i) => i.status === 'AWAITING_PAYMENT').length),
          },
          {
            l: 'Needs settlement',
            v: String(
              invoices.filter((i) => i.status === 'SETTLEMENT_REQUIRED').length
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

      {msg && <p className="mb-4 text-sm text-[var(--accent)] mono">{msg}</p>}

      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--border)] font-semibold">
          Recent invoices
        </div>
        {invoices.length === 0 ? (
          <div className="p-6 text-sm text-[var(--text-muted)]">
            No invoices in this browser yet. Create one on the Merchant page.
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
                  <tr key={inv.invoice_id} className="border-b border-[var(--border)]">
                    <td className="px-4 py-2 mono text-xs">
                      <Link href={`/pay/${inv.invoice_id}`}>
                        {inv.invoice_id.slice(0, 10)}…
                      </Link>
                    </td>
                    <td className="px-4 py-2 mono">${inv.usd_amount.toFixed(2)}</td>
                    <td className="px-4 py-2 mono">{inv.bch_amount ?? '—'}</td>
                    <td className="px-4 py-2">{inv.settlement_asset}</td>
                    <td className="px-4 py-2">
                      <span className="text-xs px-2 py-0.5 rounded border border-[var(--border)]">
                        {inv.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 space-x-2">
                      <Link href={`/pay/${inv.invoice_id}`} className="text-xs">
                        Open
                      </Link>
                      {inv.status === 'AWAITING_PAYMENT' && (
                        <button
                          type="button"
                          className="text-xs text-[var(--accent)]"
                          onClick={() => checkChain(inv)}
                          disabled={checking === inv.invoice_id}
                        >
                          {checking === inv.invoice_id ? 'Checking…' : 'Check chain'}
                        </button>
                      )}
                      {(inv.status === 'SETTLEMENT_REQUIRED' ||
                        inv.status === 'PAYMENT_VALIDATED') &&
                        inv.settlement_asset !== 'BCH' && (
                          <button
                            type="button"
                            className="text-xs text-[var(--orange)]"
                            onClick={() => buildPlan(inv)}
                          >
                            Build PUSD plan
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

      {planJson && (
        <div className="card mt-6 p-4">
          <p className="label mb-2">Unsigned settlement plan (for your agent)</p>
          <pre className="text-xs mono overflow-x-auto max-h-96 whitespace-pre-wrap text-[var(--text-muted)]">
            {planJson}
          </pre>
          <p className="hint mt-2">
            Pipe this into CashLab or cauldron-swap-sdk. See docs/SETTLEMENT_PLUGIN.md.
          </p>
        </div>
      )}
    </div>
  );
}
