'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveInvoice } from '@/lib/client/invoices';

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
  const [usdAmount, setUsdAmount] = useState('1.00');
  const [description, setDescription] = useState('Test payment');
  const [settlement, setSettlement] = useState<'BCH' | 'PUSD' | 'MUSD'>('BCH');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const id = localStorage.getItem('settlr_merchant_id');
      const dest = localStorage.getItem('settlr_merchant_dest');
      if (dest) {
        const d = JSON.parse(dest);
        setDestinations(d);
        if (d.BCH) setBchAddress(d.BCH);
        if (d.PUSD) setPusdAddress(d.PUSD);
      }
      if (id) {
        setMerchantId(id);
        setStep('invoice');
      }
    } catch {
      /* ignore */
    }
  }, []);

  function saveLocalMerchant(dest: { BCH: string; PUSD?: string }) {
    const id =
      localStorage.getItem('settlr_merchant_id') ||
      `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem('settlr_merchant_id', id);
    localStorage.setItem('settlr_merchant_dest', JSON.stringify(dest));
    localStorage.setItem('settlr_merchant_name', name || 'Merchant');
    setMerchantId(id);
    setDestinations(dest);
    setStep('invoice');
  }

  async function onboard() {
    setLoading(true);
    setError(null);
    setFieldError(null);
    try {
      if (!bchAddress.trim()) {
        setFieldError('bchAddress');
        throw new Error('Enter your BCH cashaddr (bitcoincash:q… or z…).');
      }
      if (settlement === 'PUSD' && !pusdAddress.trim()) {
        setFieldError('pusdAddress');
        throw new Error('PUSD needs a token-aware address starting with z.');
      }

      // Prefer server validation, but succeed locally if the server forgets merchants
      const res = await fetch('/api/merchants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name || 'Merchant',
          bchAddress: bchAddress.trim(),
          pusdAddress: settlement === 'PUSD' ? pusdAddress.trim() : undefined,
          defaultSettlement: settlement,
        }),
      });
      const data = await res.json();
      if (res.ok && data.destinations?.BCH) {
        saveLocalMerchant({
          BCH: data.destinations.BCH,
          PUSD: data.destinations.PUSD,
        });
        return;
      }

      // Fallback: still onboard locally so invoice create never fails with Merchant not found
      if (data.error && String(data.error).toLowerCase().includes('invalid')) {
        if (data.field) setFieldError(data.field);
        throw new Error(data.error);
      }
      saveLocalMerchant({
        BCH: bchAddress.trim().toLowerCase().startsWith('bitcoincash:')
          ? bchAddress.trim().toLowerCase()
          : 'bitcoincash:' + bchAddress.trim().toLowerCase(),
        PUSD: pusdAddress.trim()
          ? pusdAddress.trim().toLowerCase().startsWith('bitcoincash:')
            ? pusdAddress.trim().toLowerCase()
            : 'bitcoincash:' + pusdAddress.trim().toLowerCase()
          : undefined,
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }

  async function create() {
    const bch = destinations?.BCH || bchAddress;
    if (!bch) {
      setError('Register your cashaddr first');
      setStep('onboard');
      return;
    }
    if (settlement === 'PUSD' && !(destinations?.PUSD || pusdAddress)) {
      setError('PUSD needs a z… CashToken address. Re-register.');
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
          merchantId: merchantId || 'local',
          usdAmount: parseFloat(usdAmount),
          description,
          settlementAsset: settlement,
          bchAddress: bch,
          pusdAddress:
            settlement === 'PUSD'
              ? destinations?.PUSD || pusdAddress
              : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      saveInvoice({
        invoice_id: data.invoice_id,
        merchant_id: data.merchant_id || merchantId || 'local',
        description,
        usd_amount: data.usd_amount,
        settlement_asset: data.settlement_asset,
        status: data.status || 'AWAITING_PAYMENT',
        payment_address: data.payment_address,
        bch_amount: data.bch_amount,
        bch_amount_sats: data.bch_amount_sats,
        expected_settlement: data.expected_settlement,
        expires_at: data.expires_at,
        payment_txid: null,
        pusd_address: data.pusd_address || destinations?.PUSD || pusdAddress || null,
        created_at: new Date().toISOString(),
      });
      router.push(`/pay/${data.invoice_id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <p className="tag mb-3">{step === 'onboard' ? 'Onboarding' : 'Invoice'}</p>
      <h1 className="display text-2xl font-bold mb-1 glow-text">
        {step === 'onboard' ? 'Merchant setup' : 'Create invoice'}
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-8 leading-relaxed">
        {step === 'onboard'
          ? 'Register cashaddrs you control. Settlr never holds keys.'
          : 'Customer pays the exact BCH amount to your address.'}
      </p>

      <div className="card card-hot p-6 space-y-5">
        {step === 'onboard' ? (
          <>
            <div>
              <label className="label">Business name</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Cypher Coffee" />
            </div>
            <div>
              <label className="label">Settlement preference</label>
              <div className="space-y-2">
                {(
                  [
                    { id: 'BCH' as const, label: 'BCH — direct to your cashaddr' },
                    { id: 'PUSD' as const, label: 'PUSD — CashToken after Cauldron swap' },
                    { id: 'MUSD' as const, label: 'MUSD — disabled' },
                  ]
                ).map((opt) => (
                  <label key={opt.id} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer ${settlement === opt.id ? 'border-[var(--accent)]' : 'border-[var(--border)]'} ${opt.id === 'MUSD' ? 'opacity-40' : ''}`}>
                    <input type="radio" name="settlement" checked={settlement === opt.id} onChange={() => setSettlement(opt.id)} disabled={opt.id === 'MUSD'} />
                    <span className="text-sm">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="label">BCH receive cashaddr</label>
              <input className={`input text-xs ${fieldError === 'bchAddress' ? 'input-error' : ''}`} value={bchAddress} onChange={(e) => { setBchAddress(e.target.value); setFieldError(null); setError(null); }} placeholder="bitcoincash:q... or z..." spellCheck={false} autoComplete="off" />
              <p className="hint">Customer BCH is sent here.</p>
            </div>
            {settlement === 'PUSD' && (
              <div>
                <label className="label">PUSD CashToken receive cashaddr</label>
                <input className={`input text-xs ${fieldError === 'pusdAddress' ? 'input-error' : ''}`} value={pusdAddress} onChange={(e) => { setPusdAddress(e.target.value); setFieldError(null); setError(null); }} placeholder="bitcoincash:z..." spellCheck={false} autoComplete="off" />
                <p className="hint">Must start with z. Required for PUSD settlement destination.</p>
              </div>
            )}
            {error && <div className="error-box">{error}</div>}
            <button className="btn btn-primary w-full" onClick={onboard} disabled={loading}>{loading ? 'Validating…' : 'Register addresses'}</button>
          </>
        ) : (
          <>
            <div className="rounded-lg border border-[var(--border)] p-3 space-y-2 text-xs mono">
              <div className="flex justify-between gap-2"><span className="text-[var(--text-muted)]">Merchant</span><span>{merchantId?.slice(0, 14)}…</span></div>
              {destinations?.BCH && <div><span className="tag mr-2">BCH</span><span className="break-all text-[var(--text-muted)]">{destinations.BCH}</span></div>}
              {destinations?.PUSD && <div><span className="tag-orange tag mr-2">PUSD</span><span className="break-all text-[var(--text-muted)]">{destinations.PUSD}</span></div>}
              <button type="button" className="text-[var(--orange)] underline text-xs" onClick={() => { setStep('onboard'); }}>Change addresses</button>
            </div>
            <div>
              <label className="label">Product / description</label>
              <input className="input" style={{ fontFamily: 'var(--font-body)' }} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div>
              <label className="label">Price (USD)</label>
              <input className="input" type="number" step="0.01" min="0.01" value={usdAmount} onChange={(e) => setUsdAmount(e.target.value)} />
            </div>
            <div>
              <label className="label">Settlement for this invoice</label>
              <div className="space-y-2">
                {(
                  [
                    { id: 'BCH' as const, label: 'Receive BCH (no swap)' },
                    { id: 'PUSD' as const, label: 'Settle to PUSD CashToken' },
                  ]
                ).map((opt) => (
                  <label key={opt.id} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer ${settlement === opt.id ? 'border-[var(--accent)]' : 'border-[var(--border)]'}`}>
                    <input type="radio" name="inv-settlement" checked={settlement === opt.id} onChange={() => setSettlement(opt.id)} />
                    <span className="text-sm">{opt.label}</span>
                  </label>
                ))}
              </div>
              {settlement === 'PUSD' && (
                <p className="hint">
                  After BCH is detected, status becomes SETTLEMENT_REQUIRED.
                  Fully automatic PUSD still needs a merchant-signed Cauldron swap (Settlr does not hold keys).
                </p>
              )}
            </div>
            {error && <div className="error-box">{error}</div>}
            <button className={`btn w-full ${settlement === 'PUSD' ? 'btn-orange' : 'btn-primary'}`} onClick={create} disabled={loading}>{loading ? 'Creating…' : 'Create payment request'}</button>
          </>
        )}
      </div>
    </div>
  );
}
