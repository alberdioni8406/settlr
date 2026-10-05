'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function MerchantPage() {
  const router = useRouter();
  const [step, setStep] = useState<'onboard' | 'invoice'>('onboard');
  const [merchantId, setMerchantId] = useState<string | null>(null);
  const [destinations, setDestinations] = useState<{
    BCH?: string;
    PUSD?: string;
  } | null>(null);
  const [name, setName] = useState('');
  const [bchAddress, setBchAddress] = useState('');
  const [pusdAddress, setPusdAddress] = useState('');
  const [usdAmount, setUsdAmount] = useState('5.00');
  const [description, setDescription] = useState('Coffee');
  const [settlement, setSettlement] = useState<'BCH' | 'PUSD' | 'MUSD'>('BCH');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const id = localStorage.getItem('settlr_merchant_id');
      const dest = localStorage.getItem('settlr_merchant_dest');
      if (id) {
        setMerchantId(id);
        setStep('invoice');
      }
      if (dest) setDestinations(JSON.parse(dest));
    } catch {
      /* ignore */
    }
  }, []);

  async function onboard() {
    setLoading(true);
    setError(null);
    setFieldError(null);
    try {
      if (!bchAddress.trim()) {
        setFieldError('bchAddress');
        throw new Error('Enter your BCH cashaddr (bitcoincash:q…).');
      }
      if (settlement === 'PUSD' && !pusdAddress.trim() && !bchAddress.trim()) {
        setFieldError('pusdAddress');
        throw new Error(
          'PUSD settlement needs a CashToken-capable cashaddr.'
        );
      }

      const res = await fetch('/api/merchants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name || 'Merchant',
          bchAddress: bchAddress.trim(),
          pusdAddress:
            settlement === 'PUSD'
              ? (pusdAddress.trim() || bchAddress.trim())
              : pusdAddress.trim() || undefined,
          defaultSettlement: settlement,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.field) setFieldError(data.field);
        throw new Error(data.error || 'Failed to register');
      }
      localStorage.setItem('settlr_merchant_id', data.id);
      localStorage.setItem(
        'settlr_merchant_dest',
        JSON.stringify(data.destinations || {})
      );
      setMerchantId(data.id);
      setDestinations(data.destinations || {});
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
    if (settlement === 'PUSD' && !destinations?.PUSD) {
      setError(
        'This merchant has no PUSD CashToken address. Re-register and set one.'
      );
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
      <p className="tag mb-3">
        {step === 'onboard' ? 'Onboarding' : 'Invoice'}
      </p>
      <h1 className="display text-2xl font-bold mb-1 glow-text">
        {step === 'onboard' ? 'Merchant setup' : 'Create invoice'}
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-8 leading-relaxed">
        {step === 'onboard'
          ? 'Register cashaddrs you control. Settlr never holds keys.'
          : 'Customer pays BCH to your address. Choose how you want to settle.'}
      </p>

      <div className="card card-hot p-6 space-y-5">
        {step === 'onboard' ? (
          <>
            <div>
              <label className="label">Business name</label>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Cypher Coffee"
              />
            </div>

            <div>
              <label className="label">Settlement preference</label>
              <div className="space-y-2">
                {(
                  [
                    {
                      id: 'BCH' as const,
                      label: 'BCH — direct to your cashaddr',
                    },
                    {
                      id: 'PUSD' as const,
                      label: 'PUSD — CashToken after Cauldron swap',
                    },
                    {
                      id: 'MUSD' as const,
                      label: 'MUSD — disabled',
                    },
                  ]
                ).map((opt) => (
                  <label
                    key={opt.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      settlement === opt.id
                        ? 'border-[var(--accent)] bg-[rgba(0,230,118,0.06)]'
                        : 'border-[var(--border)] hover:border-[var(--border-hot)]'
                    } ${opt.id === 'MUSD' ? 'opacity-40' : ''}`}
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

            <div>
              <label className="label">BCH receive cashaddr</label>
              <input
                className={`input text-xs ${
                  fieldError === 'bchAddress' ? 'input-error' : ''
                }`}
                value={bchAddress}
                onChange={(e) => {
                  setBchAddress(e.target.value);
                  setFieldError(null);
                  setError(null);
                }}
                placeholder="bitcoincash:q..."
                spellCheck={false}
                autoComplete="off"
              />
              <p className="hint">
                Valid P2PKH cashaddr only. Customer BCH is sent here. Example
                prefix: bitcoincash:q
              </p>
            </div>

            {settlement === 'PUSD' && (
              <div>
                <label className="label">
                  PUSD CashToken receive cashaddr
                </label>
                <input
                  className={`input text-xs ${
                    fieldError === 'pusdAddress' ? 'input-error' : ''
                  }`}
                  value={pusdAddress}
                  onChange={(e) => {
                    setPusdAddress(e.target.value);
                    setFieldError(null);
                    setError(null);
                  }}
                  placeholder="bitcoincash:q... (token-capable wallet)"
                  spellCheck={false}
                  autoComplete="off"
                />
                <p className="hint">
                  Address where PUSD CashTokens should land after you sign the
                  Cauldron swap. Use a wallet that supports CashTokens
                  (Paytaca, Cashtokens-capable). Leave blank to reuse your BCH
                  cashaddr if that wallet is token-aware.
                </p>
              </div>
            )}

            {error && <div className="error-box">{error}</div>}

            <button
              className="btn btn-primary w-full"
              onClick={onboard}
              disabled={loading}
            >
              {loading ? 'Validating…' : 'Register addresses'}
            </button>
          </>
        ) : (
          <>
            <div className="rounded-lg border border-[var(--border)] p-3 space-y-2 text-xs mono">
              <div className="flex justify-between gap-2">
                <span className="text-[var(--text-muted)]">Merchant</span>
                <span>{merchantId?.slice(0, 14)}…</span>
              </div>
              {destinations?.BCH && (
                <div>
                  <span className="tag mr-2">BCH</span>
                  <span className="break-all text-[var(--text-muted)]">
                    {destinations.BCH}
                  </span>
                </div>
              )}
              {destinations?.PUSD && (
                <div>
                  <span className="tag-orange tag mr-2">PUSD</span>
                  <span className="break-all text-[var(--text-muted)]">
                    {destinations.PUSD}
                  </span>
                </div>
              )}
              <button
                type="button"
                className="text-[var(--orange)] underline text-xs"
                onClick={() => {
                  localStorage.removeItem('settlr_merchant_id');
                  localStorage.removeItem('settlr_merchant_dest');
                  setMerchantId(null);
                  setDestinations(null);
                  setStep('onboard');
                }}
              >
                Change addresses
              </button>
            </div>

            <div>
              <label className="label">Product / description</label>
              <input
                className="input"
                style={{ fontFamily: 'var(--font-body)' }}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Price (USD)</label>
              <input
                className="input"
                type="number"
                step="0.01"
                min="0.01"
                value={usdAmount}
                onChange={(e) => setUsdAmount(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Settlement for this invoice</label>
              <div className="space-y-2">
                {(
                  [
                    {
                      id: 'BCH' as const,
                      label: 'Receive BCH (no swap)',
                    },
                    {
                      id: 'PUSD' as const,
                      label: 'Settle to PUSD CashToken (you sign swap)',
                    },
                  ]
                ).map((opt) => (
                  <label
                    key={opt.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer ${
                      settlement === opt.id
                        ? 'border-[var(--accent)]'
                        : 'border-[var(--border)]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="inv-settlement"
                      checked={settlement === opt.id}
                      onChange={() => setSettlement(opt.id)}
                    />
                    <span className="text-sm">{opt.label}</span>
                  </label>
                ))}
              </div>
              {settlement === 'PUSD' && (
                <p className="hint">
                  Customer still pays BCH. After detection, status becomes
                  SETTLEMENT_REQUIRED until you complete the Cauldron swap into
                  PUSD at{' '}
                  <span className="mono text-[var(--orange)]">
                    {destinations?.PUSD?.slice(0, 24) || 'your PUSD addr'}…
                  </span>
                </p>
              )}
            </div>

            {error && <div className="error-box">{error}</div>}

            <button
              className={`btn w-full ${
                settlement === 'PUSD' ? 'btn-orange' : 'btn-primary'
              }`}
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
