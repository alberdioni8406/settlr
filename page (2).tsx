'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function MerchantPage() {
  const router = useRouter();
  const [usdAmount, setUsdAmount] = useState('5.00');
  const [description, setDescription] = useState('Coffee');
  const [settlement, setSettlement] = useState<'BCH' | 'PUSD' | 'MUSD'>('BCH');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchantId: 'demo-merchant',
          usdAmount: parseFloat(usdAmount),
          description,
          settlementAsset: settlement,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      try {
        const ids = JSON.parse(
          sessionStorage.getItem('settlr_invoice_ids') || '[]'
        ) as string[];
        ids.unshift(data.invoice_id);
        sessionStorage.setItem(
          'settlr_invoice_ids',
          JSON.stringify(ids.slice(0, 50))
        );
      } catch {
        /* ignore */
      }
      router.push(`/pay/${data.invoice_id}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <h1 className="text-2xl font-bold mb-1">Create invoice</h1>
      <p className="text-sm text-[var(--text-muted)] mb-8">
        Customer pays BCH. You settle in the asset you choose.
      </p>

      <div className="card p-6 space-y-5">
        <div>
          <label className="label">Product / description</label>
          <input
            className="input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Price (USD)</label>
          <input
            className="input mono"
            type="number"
            step="0.01"
            min="0.01"
            value={usdAmount}
            onChange={(e) => setUsdAmount(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Settlement</label>
          <div className="space-y-2">
            {(
              [
                { id: 'BCH', label: 'Receive BCH' },
                { id: 'PUSD', label: 'Automatically settle in PUSD (ParyOnUSD)' },
                { id: 'MUSD', label: 'Automatically settle in MUSD (MORIA USD)' },
              ] as const
            ).map((opt) => (
              <label
                key={opt.id}
                className="flex items-center gap-3 p-3 rounded-lg border border-[var(--border)] cursor-pointer hover:border-[var(--accent)]"
              >
                <input
                  type="radio"
                  name="settlement"
                  checked={settlement === opt.id}
                  onChange={() => setSettlement(opt.id)}
                />
                <span className="text-sm">{opt.label}</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-2">
            MUSD settlement is currently disabled pending live contract health verification.
          </p>
        </div>

        {error && (
          <p className="text-sm text-[var(--danger)]">{error}</p>
        )}

        <button
          className="btn btn-primary w-full"
          onClick={create}
          disabled={loading}
        >
          {loading ? 'Creating…' : 'Create payment request'}
        </button>
      </div>
    </div>
  );
}
