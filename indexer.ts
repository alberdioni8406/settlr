/**
 * Cauldron / Riften Labs Indexer client
 * Base: https://indexer.riften.net  (also indexer.cauldron.quest)
 *
 * Only uses documented endpoints. No invented APIs.
 */

const INDEXER_BASE = process.env.CAULDRON_INDEXER_URL || 'https://indexer.riften.net';

export interface CauldronPool {
  owner_p2pkh_addr: string;
  owner_pkh: string;
  sats: number;
  token_id: string;
  tokens: number;
  tx_pos: number;
  txid: string;
}

export interface TokenPrice {
  price: number; // satoshis per smallest token unit (see docs)
  timestamp?: number;
}

export interface OracleCashPrice {
  // shape depends on endpoint; we normalize
  priceUsd?: number;
  raw?: unknown;
}

async function fetchJson<T>(path: string): Promise<T> {
  const url = `${INDEXER_BASE}${path}`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    next: { revalidate: 15 }, // short cache for prices
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Cauldron indexer ${res.status} for ${path}: ${text}`);
  }
  return res.json() as Promise<T>;
}

/** Current price of a token in satoshis (per smallest unit of the token). */
export async function getTokenPriceCurrent(tokenId: string): Promise<TokenPrice> {
  return fetchJson<TokenPrice>(`/cauldron/price/${tokenId}/current`);
}

/** Active pools for a token. */
export async function getActivePools(tokenId: string): Promise<CauldronPool[]> {
  const data = await fetchJson<{ active: CauldronPool[] }>(
    `/cauldron/pool/active?token=${encodeURIComponent(tokenId)}`
  );
  return data.active || [];
}

/** Aggregated liquidity (sum of sats + tokens) for a token. */
export async function getTokenLiquidity(tokenId: string): Promise<{
  totalSats: number;
  totalTokens: number;
  poolCount: number;
}> {
  const pools = await getActivePools(tokenId);
  let totalSats = 0;
  let totalTokens = 0;
  for (const p of pools) {
    totalSats += p.sats;
    totalTokens += p.tokens;
  }
  return { totalSats, totalTokens, poolCount: pools.length };
}

/**
 * BCH/USD oracle via Riften /oracle endpoints.
 * Falls back gracefully if unavailable.
 */
export async function getBchUsdPrice(): Promise<number> {
  try {
    // Prefer live Delphi / cash closest
    const data = await fetchJson<any>(`/oracle/cash/closest`);
    // Response shapes vary; common patterns:
    // { price: 33758 } meaning cents, or { price: 337.58 }
    if (typeof data?.price === 'number') {
      // Heuristic: if > 1000 assume cents
      return data.price > 1000 ? data.price / 100 : data.price;
    }
    if (typeof data?.price_usd === 'number') return data.price_usd;
    if (typeof data?.usd === 'number') return data.usd;
  } catch {
    // fall through
  }

  // Fallback public price sources only when oracle unavailable
  try {
    const res = await fetch(
      'https://api.coinpaprika.com/v1/tickers/bch-bitcoin-cash',
      { next: { revalidate: 30 } }
    );
    if (res.ok) {
      const j = await res.json();
      const p = j?.quotes?.USD?.price;
      if (typeof p === 'number') return p;
    }
  } catch {
    // ignore
  }

  throw new Error('Unable to obtain BCH/USD price from oracle or fallback');
}

export { INDEXER_BASE };
