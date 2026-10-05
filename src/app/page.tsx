import Link from 'next/link';

export default function Home() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-16">
      <p className="tag mb-4">Bitcoin Cash · CashTokens</p>
      <h1 className="display text-3xl sm:text-5xl font-bold leading-tight mb-4 glow-text">
        Pay in BCH.
        <br />
        <span className="text-[var(--orange)] glow-orange">Settle your way.</span>
      </h1>
      <p className="text-base sm:text-lg text-[var(--text-muted)] mb-10 max-w-xl leading-relaxed">
        Non-custodial gateway. Customers pay Bitcoin Cash to your address.
        Settle in BCH or receive PUSD as a CashToken on an address you control.
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
            d: 'No deposits. No Settlr wallets. Keys stay with you.',
            tag: 'Keys',
          },
          {
            t: 'Your cashaddr',
            d: 'BCH lands on your P2PKH address. PUSD needs a token-capable cashaddr.',
            tag: 'Receive',
          },
          {
            t: 'Cauldron routes',
            d: 'PUSD settlement plans use live pool liquidity — never invented prices.',
            tag: 'Liquidity',
          },
        ].map((c) => (
          <div key={c.t} className="card p-5">
            <span className="tag-orange tag mb-3">{c.tag}</span>
            <h3 className="display text-sm mb-2">{c.t}</h3>
            <p className="text-sm text-[var(--text-muted)] leading-relaxed">
              {c.d}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
