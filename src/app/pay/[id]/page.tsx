'use client';

import { useEffect, useState, use } from 'react';

interface InvoiceData {
  invoice_id: string;
  usd_amount: number;
  settlement_asset: string;
  status: string;
  payment_address: string;
  bch_amount: string | null;
  bch_amount_sats: number | null;
  expected_settlement: string | null;
  route_summary: string | null;
  conversion_fee_bps: number | null;
  price_impact_bps: number | null;
  expires_at: string | null;
  payment_txid: string | null;
  settlement_txid: string | null;
  settled_amount: string | null;
}

export default function PayPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [data, setData] = useState<InvoiceData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  async function load() {
    try {
      const res = await fetch(`/api/invoices/${id}`, { cache: 'no-store' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Not found');
      setData(j);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [id]);

  useEffect(() => {
    if (!data?.expires_at) {
      setSecondsLeft(null);
      return;
    }
    const tick = () => {
      const left = Math.max(
        0,
        Math.floor((new Date(data.expires_at!).getTime() - Date.now()) / 1000)
      );
      setSecondsLeft(left);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [data?.expires_at]);

  if (error) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <p className="text-[var(--danger)]">{error}</p>
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

  const isComplete = ['SETTLED', 'PAYMENT_VALIDATED', 'SETTLING'].includes(
    data.status
  );
  const isWaiting = data.status === 'AWAITING_PAYMENT';

  const mm = secondsLeft != null ? Math.floor(secondsLeft / 60) : 0;
  const ss =
    secondsLeft != null
      ? String(secondsLeft % 60).padStart(2, '0')
      : '--';

  // Simple QR via external service for MVP (no local QR lib dependency issues)
  const qrUrl = data.payment_address
    ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
        data.payment_address + (data.bch_amount ? `?amount=${data.bch_amount}` : '')
      )}`
    : null;

  return (
    <div className="max-w-md mx-auto px-4 py-10">
      <div className="card p-6 sm:p-8 text-center">
        <p className="label mb-1">Payment request</p>
        <h1 className="text-4xl font-bold tracking-tight mb-1">
          ${data.usd_amount.toFixed(2)}
          <span className="text-lg text-[var(--text-muted)] font-normal">
            {' '}
            USD
          </span>
        </h1>
        <p className="text-sm text-[var(--text-muted)] mb-6">
          Pay with Bitcoin Cash
        </p>

        {qrUrl && isWaiting && (
          <div className="inline-block p-3 bg-white rounded-xl mb-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrUrl} alt="BCH payment QR" width={220} height={220} />
          </div>
        )}

        {data.bch_amount && (
          <p className="mono text-xl font-semibold mb-1">
            {data.bch_amount} BCH
          </p>
        )}

        {isWaiting && secondsLeft != null && (
          <p className="text-sm text-[var(--text-muted)] mb-4">
            Quote expires in{' '}
            <span className="mono text-[var(--warning)]">
              {mm}:{ss}
            </span>
          </p>
        )}

        <div className="text-left text-xs text-[var(--text-muted)] break-all mono bg-[var(--bg)] rounded-lg p-3 mb-5 border border-[var(--border)]">
          {data.payment_address}
        </div>

        {/* Status steps */}
        <div className="text-left space-y-2 mb-4">
          <StatusRow
            active={isWaiting}
            done={!isWaiting}
            label="Waiting for payment…"
          />
          <StatusRow
            active={data.status === 'PAYMENT_DETECTED'}
            done={[
              'PAYMENT_VALIDATED',
              'SETTLING',
              'SETTLED',
            ].includes(data.status)}
            label="Payment detected"
          />
          <StatusRow
            active={data.status === 'PAYMENT_VALIDATED'}
            done={['SETTLING', 'SETTLED'].includes(data.status)}
            label="Payment confirmed"
          />
          <StatusRow
            active={data.status === 'SETTLING'}
            done={data.status === 'SETTLED'}
            label="Settlement complete"
          />
        </div>

        {data.expected_settlement && (
          <div className="text-left text-sm border-t border-[var(--border)] pt-4 mt-2">
            <p className="text-[var(--text-muted)] text-xs uppercase tracking-wide mb-1">
              Merchant settlement
            </p>
            <p>
              ~{data.expected_settlement}
              {data.conversion_fee_bps != null && (
                <span className="text-[var(--text-muted)] text-xs ml-2">
                  (LP fee ~{data.conversion_fee_bps / 100}%)
                </span>
              )}
            </p>
            {data.route_summary && (
              <p className="text-xs text-[var(--text-muted)] mt-1">
                {data.route_summary}
              </p>
            )}
          </div>
        )}

        {isComplete && (
          <div className="mt-6 p-4 rounded-lg bg-[var(--bg)] border border-[var(--success)]">
            <p className="font-semibold text-[var(--success)]">
              Payment complete ✓
            </p>
            {data.settled_amount && (
              <p className="text-sm mt-1">Settled: {data.settled_amount}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusRow({
  active,
  done,
  label,
}: {
  active: boolean;
  done: boolean;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span
        className={`status-dot ${
          done ? 'live' : active ? 'wait' : ''
        }`}
        style={
          !done && !active
            ? { background: 'var(--border)' }
            : undefined
        }
      />
      <span
        className={
          done || active ? 'text-[var(--text)]' : 'text-[var(--text-muted)]'
        }
      >
        {label}
      </span>
    </div>
  );
}
