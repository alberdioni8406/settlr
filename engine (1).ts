import type { Invoice, SettlementResult, SettlementAsset } from '@/types';
import { getAsset } from '@/services/registry/assets';

/**
 * Settlement engine interface.
 *
 * BCH path: conceptually forward received BCH to merchant destination.
 * Stablecoin path: construct Cauldron trade (CashLab) then deliver token
 * to merchant CashToken-capable address.
 *
 * IMPORTANT: This module does NOT simulate successful on-chain settlement.
 * Real execution requires:
 *  - Detected & validated payment UTXO
 *  - Non-custodial signing (merchant WalletConnect / WizardConnect / PSBT)
 *  - Or a carefully designed coordinator that never holds keys
 *
 * Until that path is wired, settlement returns a clear "not executed" result.
 */

export async function settleInvoice(
  invoice: Invoice,
  opts?: { merchantDestination?: string }
): Promise<SettlementResult> {
  if (!invoice.paymentTxId) {
    return { success: false, error: 'No payment transaction recorded' };
  }

  const asset = getAsset(invoice.settlementAsset);

  if (invoice.settlementAsset === 'BCH') {
    return {
      success: false,
      error:
        'BCH settlement is non-custodial: merchant monitors payment address or provides a controlled destination. No automatic key-based sweep implemented.',
      asset: 'BCH',
      simulated: false,
    };
  }

  if (!asset.settlementEnabled) {
    return {
      success: false,
      error: `${invoice.settlementAsset} settlement is disabled (contract/liquidity check).`,
      asset: invoice.settlementAsset,
    };
  }

  return {
    success: false,
    error:
      'Stablecoin settlement requires non-custodial trade construction + signing (CashLab + wallet). Not executed.',
    asset: invoice.settlementAsset as SettlementAsset,
    simulated: false,
  };
}
