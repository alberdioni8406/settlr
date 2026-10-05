import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Settlr — Pay in BCH. Settle your way.',
  description:
    'Non-custodial Bitcoin Cash payment gateway. Customers pay in BCH. Merchants settle in BCH or PUSD CashTokens.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=Orbitron:wght@500;600;700&family=Share+Tech+Mono&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <div className="min-h-screen flex flex-col">
          <header className="border-b border-[var(--border)] px-4 py-3 flex items-center justify-between backdrop-blur-sm bg-[rgba(5,8,6,0.85)]">
            <a href="/" className="flex items-center gap-2.5 no-underline">
              <span
                className="w-8 h-8 rounded flex items-center justify-center font-bold text-sm display"
                style={{
                  background: 'linear-gradient(135deg, var(--accent), #00a855)',
                  color: '#02140a',
                  boxShadow: '0 0 16px var(--accent-glow)',
                }}
              >
                S
              </span>
              <span className="display text-sm tracking-[0.2em] text-[var(--text)]">
                Settlr
              </span>
            </a>
            <nav className="flex gap-5 text-xs display tracking-widest text-[var(--text-muted)]">
              <a href="/dashboard" className="hover:text-[var(--accent)]">
                Dashboard
              </a>
              <a href="/merchant" className="hover:text-[var(--orange)]">
                Merchant
              </a>
            </nav>
          </header>
          <main className="flex-1">{children}</main>
          <footer className="border-t border-[var(--border)] px-4 py-4 text-center text-xs text-[var(--text-muted)] mono">
            Non-custodial · Bitcoin Cash · CashTokens · Cauldron · No keys stored
          </footer>
        </div>
      </body>
    </html>
  );
}
