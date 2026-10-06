/**
 * Unsigned PUSD settlement plan for external implementers.
 *
 * Settlr does NOT sign or broadcast. Your wallet / agent uses this plan
 * with CashLab, Cauldron-Swap-SDK, or any compatible builder.
 */

import {
  getActivePools,
  getTokenLiquidity,
  type CauldronPool,
} from '@/services/cauldron/indexer';
import { getAsset } from '@/services/registry/assets';
import type { SettlementAsset } from '@/types';

const LP_FEE_BPS = 30; // 0.3%

export interface SettlementPlanPool {
  txid: string;
  tx_pos: number;
  sats: number;
  tokens: number;
  owner_pkh: string;
  owner_p2pkh_addr: string;
  /** Estimated tokens out from this pool for the allocated sats_in (base units) */
  estimated_tokens_out: number;
  allocated_sats_in: number;
}

export interface SettlementPlan {
  version: 1;
  kind: 'cauldron_bch_to_token';
  status: 'UNSIGNED_PLAN';
  settlement_asset: SettlementAsset;
  token_id: string;
  token_decimals: number;
  /** Merchant token-aware cashaddr (z…) */
  token_destination: string;
  /** BCH satoshis available to sell (from detected payment) */
  bch_sats_in: number;
  payment_txid: string | null;
  lp_fee_bps: number;
  /** Constant-product estimate across selected pools */
  estimated_tokens_out: number;
  estimated_tokens_human: string;
  pools: SettlementPlanPool[];
  route_summary: string;
  /** How an external agent should finish the job */
  implementer_notes: {
    sign_required: true;
    libraries: string[];
    broadcast_hint: string;
    constraints: string[];
  };
  created_at: string;
}

/** Constant-product out with 0.3% LP fee on the input side. */
export function cpmmTokensOut(
  satsIn: number,
  reserveSats: number,
  reserveTokens: number
): number {
  if (satsIn <= 0 || reserveSats <= 0 || reserveTokens <= 0) return 0;
  const feeNum = 1000 - LP_FEE_BPS; // 970
  const effectiveIn = satsIn * feeNum;
  const num = reserveTokens * effectiveIn;
  const den = reserveSats * 1000 + effectiveIn;
  return Math.floor(num / den);
}

/**
 * Greedy allocation into deepest pools (by BCH side).
 * Good enough for a plan; production agents may re-route with CashLab.
 */
export function allocateAcrossPools(
  satsIn: number,
  pools: CauldronPool[]
): SettlementPlanPool[] {
  const sorted = [...pools].sort((a, b) => b.sats - a.sats);
  let remaining = satsIn;
  const out: SettlementPlanPool[] = [];
  for (const p of sorted) {
    if (remaining <= 0) break;
    // Cap per pool to avoid draining thin pools in the plan estimate
    const cap = Math.floor(p.sats * 0.3);
    const alloc = Math.min(remaining, Math.max(cap, 0));
    if (alloc <= 0) continue;
    const tokensOut = cpmmTokensOut(alloc, p.sats, p.tokens);
    if (tokensOut <= 0) continue;
    out.push({
      txid: p.txid,
      tx_pos: p.tx_pos,
      sats: p.sats,
      tokens: p.tokens,
      owner_pkh: p.owner_pkh,
      owner_p2pkh_addr: p.owner_p2pkh_addr,
      estimated_tokens_out: tokensOut,
      allocated_sats_in: alloc,
    });
    remaining -= alloc;
  }
  return out;
}

export async function buildSettlementPlan(input: {
  settlementAsset: SettlementAsset;
  bchSatsIn: number;
  tokenDestination: string;
  paymentTxId?: string | null;
}): Promise<SettlementPlan> {
  const asset = getAsset(input.settlementAsset);
  if (!asset.tokenId) {
    throw new Error('Native BCH needs no token settlement plan');
  }
  if (!asset.settlementEnabled) {
    throw new Error(`${input.settlementAsset} settlement is disabled`);
  }
  if (input.bchSatsIn <= 0) {
    throw new Error('bchSatsIn must be positive');
  }

  const pools = await getActivePools(asset.tokenId);
  if (!pools.length) {
    throw new Error(`No active Cauldron pools for ${input.settlementAsset}`);
  }
  const liq = await getTokenLiquidity(asset.tokenId);
  if (liq.totalSats < asset.minimumLiquiditySats) {
    throw new Error(
      `Insufficient Cauldron liquidity (${liq.totalSats} sats TVL)`
    );
  }

  const selected = allocateAcrossPools(input.bchSatsIn, pools);
  const estimated = selected.reduce((s, p) => s + p.estimated_tokens_out, 0);
  const human = (estimated / 10 ** asset.decimals).toFixed(
    Math.min(asset.decimals, 4)
  );

  return {
    version: 1,
    kind: 'cauldron_bch_to_token',
    status: 'UNSIGNED_PLAN',
    settlement_asset: input.settlementAsset,
    token_id: asset.tokenId,
    token_decimals: asset.decimals,
    token_destination: input.tokenDestination,
    bch_sats_in: input.bchSatsIn,
    payment_txid: input.paymentTxId ?? null,
    lp_fee_bps: LP_FEE_BPS,
    estimated_tokens_out: estimated,
    estimated_tokens_human: `${human} ${input.settlementAsset}`,
    pools: selected,
    route_summary: `Cauldron BCH→${input.settlementAsset} via ${selected.length}/${pools.length} pools · ~${(liq.totalSats / 1e8).toFixed(2)} BCH TVL`,
    implementer_notes: {
      sign_required: true,
      libraries: [
        '@cashlab/cauldron (ExchangeLab)',
        '@mr-zwets/cauldron-swap-sdk',
        'Any wallet that can spend the payment UTXO and recreate pool outputs',
      ],
      broadcast_hint:
        'Broadcast the signed trade yourself (e.g. broadcast.cauldron.quest or your Electrum endpoint). Settlr never holds keys.',
      constraints: [
        'Recreate each pool UTXO at the same input index',
        'Satisfy k_out >= k_in with 0.3% LP fee',
        'Send fungible token output to token_destination (z… cashaddr)',
        'Payment UTXO must still be unspent when you sign',
      ],
    },
    created_at: new Date().toISOString(),
  };
}
