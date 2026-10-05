import Link from 'next/link';

export default function Home() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-16">
      <p className="text-[var(--accent)] text-sm font-medium tracking-widest uppercase mb-3">
        Bitcoin Cash payment infrastructure
      </p>
      <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
        Pay in BCH.
        <br />
        <span className="text-[var(--text-muted)]">Settle your way.</span>
      </h1>
      <p className="text-lg text-[var(--text-muted)] mb-10 max-w-xl">
        Non-custodial payment gateway. Customers pay with Bitcoin Cash.
        Merchants choose BCH, ParyOnUSD (PUSD), or MORIA USD (MUSD) settlement.
      </p>

      <div className="flex flex-wrap gap-3 mb-16">
        <Link href="/merchant" className="btn btn-primary no-underline">
          Merchant onboarding
        </Link>
        <Link href="/dashboard" className="btn btn-ghost no-underline">
          Open dashboard
        </Link>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        {[
          {
            t: 'Non-custodial',
            d: 'No deposits. No Settlr-controlled wallets. Funds stay under your keys.',
          },
          {
            t: 'Merchant control',
            d: 'Default settlement preference or override per invoice. BCH remains first-class.',
          },
          {
            t: 'Cauldron liquidity',
            d: 'Stablecoin routes use real BCH-native Cauldron pools — not invented prices.',
          },
        ].map((c) => (
          <div key={c.t} className="card p-5">
            <h3 className="font-semibold mb-2">{c.t}</h3>
            <p className="text-sm text-[var(--text-muted)]">{c.d}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
