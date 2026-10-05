import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Settlr — Pay in BCH. Settle your way.',
  description:
    'Non-custodial Bitcoin Cash payment gateway. Customers pay in BCH. Merchants settle in BCH, PUSD, or MUSD.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen flex flex-col">
          <header className="border-b border-[var(--border)] px-4 py-3 flex items-center justify-between">
            <a href="/" className="flex items-center gap-2 no-underline">
              <span
                className="w-7 h-7 rounded-md flex items-center justify-center font-bold text-sm"
                style={{ background: 'var(--accent)', color: '#04140f' }}
              >
                S
              </span>
              <span className="font-semibold tracking-tight text-[var(--text)]">
                Settlr
              </span>
            </a>
            <nav className="flex gap-4 text-sm text-[var(--text-muted)]">
              <a href="/dashboard">Dashboard</a>
              <a href="/merchant">Merchant</a>
            </nav>
          </header>
          <main className="flex-1">{children}</main>
          <footer className="border-t border-[var(--border)] px-4 py-4 text-center text-xs text-[var(--text-muted)]">
            Non-custodial · Bitcoin Cash · Cauldron liquidity · No keys stored
          </footer>
        </div>
      </body>
    </html>
  );
}
