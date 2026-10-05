import { uid } from '@/lib/utils/id';
import type { Quote, SettlementAsset } from '@/types';
import { getAsset, isSettlementEnabled } from '@/services/registry/assets';
import {
  getBchUsdPrice,
  getTokenLiquidity,
  getTokenPriceCurrent,
} from '@/services/cauldron/indexer';

const DEFAULT_QUOTE_TTL_MS = 60_000; // 60 seconds

export interface QuoteRequest {
  invoiceId: string;
  usdAmount: number;
  settlementAsset: SettlementAsset;
  ttlMs?: number;
}

/**
 * Quote engine
 *
 * USD invoice amount
 *   ↓
 * BCH market price (oracle)
 *   ↓
 * required BCH
 *   ↓
 * settlement asset
 *   → BCH: settle native
 *   → PUSD / MUSD: evaluate Cauldron liquidity + indicative output
 *
 * Does NOT hardcode token prices.
 * Does NOT pretend a swap was executed.
 */
export async function createQuote(req: QuoteRequest): Promise<Quote> {
  if (req.usdAmount <= 0) {
    throw new Error('USD amount must be positive');
  }
  if (!isSettlementEnabled(req.settlementAsset)) {
    throw new Error(`Settlement asset ${req.settlementAsset} is not enabled`);
  }

  const asset = getAsset(req.settlementAsset);
  const bchUsd = await getBchUsdPrice();
  if (!bchUsd || bchUsd <= 0) {
    throw new Error('Invalid BCH/USD price');
  }

  // Customer always pays in BCH. Calculate required sats for the USD amount.
  // Add a small buffer (0.5%) to absorb minor price movement within quote window.
  const buffer = 1.005;
  const bchAmount = (req.usdAmount / bchUsd) * buffer;
  const bchAmountSats = Math.ceil(bchAmount * 1e8);

  let expectedSettlementAmount = '';
  let conversionFeeBps: number | undefined;
  let priceImpactBps: number | undefined;
  let routeSummary: string | undefined;

  if (req.settlementAsset === 'BCH') {
    expectedSettlementAmount = (bchAmountSats / 1e8).toFixed(8) + ' BCH';
    routeSummary = 'Native BCH settlement — no conversion';
  } else {
    // Stablecoin path: inspect Cauldron liquidity and indicative price
    const tokenId = asset.tokenId!;
    const liquidity = await getTokenLiquidity(tokenId);

    if (liquidity.totalSats < asset.minimumLiquiditySats) {
      throw new Error(
        `Insufficient Cauldron liquidity for ${req.settlementAsset} (sats=${liquidity.totalSats})`
      );
    }

    // Indicative token price from Cauldron (satoshis per smallest token unit)
    const tokenPrice = await getTokenPriceCurrent(tokenId);
    // price is in sats per base unit. Convert to human token amount for the BCH paid.
    // Approximate: tokens ≈ bchAmountSats / tokenPrice  (then adjust by decimals)
    const baseUnits = tokenPrice.price > 0 ? bchAmountSats / tokenPrice.price : 0;
    const humanTokens = baseUnits / 10 ** asset.decimals;

    // Rough LP fee 0.3% (30 bps) — documented Cauldron LP fee
    conversionFeeBps = 30;
    // Placeholder impact — real impact needs pool-level simulation via CashLab
    priceImpactBps = estimateImpactBps(bchAmountSats, liquidity.totalSats);

    expectedSettlementAmount =
      humanTokens.toFixed(Math.min(asset.decimals, 4)) + ` ${req.settlementAsset}`;

    routeSummary = `Cauldron multi-pool BCH → ${req.settlementAsset} (${liquidity.poolCount} pools, ~${(liquidity.totalSats / 1e8).toFixed(2)} BCH TVL)`;
  }

  const now = Date.now();
  const ttl = req.ttlMs ?? DEFAULT_QUOTE_TTL_MS;

  const quote: Quote = {
    id: uid(16),
    invoiceId: req.invoiceId,
    usdAmount: req.usdAmount,
    bchAmountSats,
    bchAmount: (bchAmountSats / 1e8).toFixed(8),
    bchUsdPrice: bchUsd,
    settlementAsset: req.settlementAsset,
    expectedSettlementAmount,
    conversionFeeBps,
    priceImpactBps,
    routeSummary,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttl).toISOString(),
    valid: true,
  };

  return quote;
}

function estimateImpactBps(tradeSats: number, poolSats: number): number {
  if (poolSats <= 0) return 10_000;
  // Very rough constant-product impact approximation
  const ratio = tradeSats / poolSats;
  return Math.min(Math.round(ratio * 10_000 * 0.5), 500); // cap display at 5%
}

export function isQuoteExpired(quote: Quote): boolean {
  return Date.now() > new Date(quote.expiresAt).getTime();
}
