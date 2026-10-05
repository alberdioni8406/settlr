'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function MerchantPage() {
  const router = useRouter();
  const [step, setStep] = useState<'onboard' | 'invoice'>('onboard');
  const [merchantId, setMerchantId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [bchAddress, setBchAddress] = useState('');
  const [usdAmount, setUsdAmount] = useState('5.00');
  const [description, setDescription] = useState('Coffee');
  const [settlement, setSettlement] = useState<'BCH' | 'PUSD' | 'MUSD'>('BCH');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const id = localStorage.getItem('settlr_merchant_id');
      if (id) {
        setMerchantId(id);
        setStep('invoice');
      }
    } catch {
      /* ignore */
    }
  }, []);

  async function onboard() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/merchants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name || 'Merchant',
          bchAddress,
          defaultSettlement: settlement,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to register');
      localStorage.setItem('settlr_merchant_id', data.id);
      setMerchantId(data.id);
      setStep('invoice');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }

  async function create() {
    if (!merchantId) {
      setError('Register your cashaddr first');
      setStep('onboard');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchantId,
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
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <h1 className="text-2xl font-bold mb-1">
        {step === 'onboard' ? 'Merchant onboarding' : 'Create invoice'}
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-8">
        {step === 'onboard'
          ? 'Provide a cashaddr you control. Settlr never holds keys.'
          : 'Customer pays BCH to your address. Settlement preference below.'}
      </p>

      <div className="card p-6 space-y-5">
        {step === 'onboard' ? (
          <>
            <div>
              <label className="label">Business name</label>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Coffee shop"
              />
            </div>
            <div>
              <label className="label">Your BCH cashaddr (required)</label>
              <input
                className="input mono text-xs"
                value={bchAddress}
                onChange={(e) => setBchAddress(e.target.value)}
                placeholder="bitcoincash:q..."
              />
              <p className="text-xs text-[var(--text-muted)] mt-1">
                Must be a valid P2PKH cashaddr you control. Payments go here
                directly.
              </p>
            </div>
            {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
            <button
              className="btn btn-primary w-full"
              onClick={onboard}
              disabled={loading || !bchAddress.trim()}
            >
              {loading ? 'Validating…' : 'Register & continue'}
            </button>
          </>
        ) : (
          <>
            <p className="text-xs text-[var(--text-muted)] mono">
              Merchant {merchantId?.slice(0, 12)}…
              <button
                type="button"
                className="ml-2 underline"
                onClick={() => {
                  localStorage.removeItem('settlr_merchant_id');
                  setMerchantId(null);
                  setStep('onboard');
                }}
              >
                change address
              </button>
            </p>
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
                    { id: 'BCH', label: 'Receive BCH (direct to your cashaddr)' },
                    {
                      id: 'PUSD',
                      label: 'Settle in PUSD (unsigned plan — you sign later)',
                    },
                    {
                      id: 'MUSD',
                      label: 'MUSD (disabled until contract health verified)',
                    },
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
                      disabled={opt.id === 'MUSD'}
                    />
                    <span className="text-sm">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>
            {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
            <button
              className="btn btn-primary w-full"
              onClick={create}
              disabled={loading}
            >
              {loading ? 'Creating…' : 'Create payment request'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
