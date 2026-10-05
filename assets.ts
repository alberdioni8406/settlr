import type { SupportedAsset, SettlementAsset } from '@/types';

/**
 * Explicit supported-asset registry.
 * Only these assets are selectable for settlement.
 * Do NOT auto-expose every CashToken discovered by Cauldron.
 */
export const SUPPORTED_ASSETS: Record<SettlementAsset, SupportedAsset> = {
  BCH: {
    symbol: 'BCH',
    name: 'Bitcoin Cash',
    tokenId: null,
    decimals: 8,
    network: 'mainnet',
    active: true,
    settlementEnabled: true,
    minimumLiquiditySats: 0,
    maximumSlippageBps: 0,
  },
  PUSD: {
    symbol: 'PUSD',
    name: 'ParyOnUSD',
    tokenId: '2469acc5afa4b10cb5b5c04afb89c3a3ffd61c5da9c01e26d00951cae2a02544',
    decimals: 2,
    network: 'mainnet',
    active: true,
    settlementEnabled: true, // strongest BCH-native liquidity among the two
    minimumLiquiditySats: 10_000_000, // 0.1 BCH side minimum for routing
    maximumSlippageBps: 100, // 1%
  },
  MUSD: {
    symbol: 'MUSD',
    name: 'MORIA USD',
    tokenId: 'b38a33f750f84c5c169a6f23cb873e6e79605021585d4f3408789689ed87f366',
    decimals: 8, // confirm live decimals via BCMR / indexer
    network: 'mainnet',
    active: true,
    // Moria V1 had a security vulnerability; settlement remains behind a feature flag
    // until live contract health + liquidity are verified at runtime.
    settlementEnabled: false,
    minimumLiquiditySats: 10_000_000,
    maximumSlippageBps: 100,
  },
};

export function getAsset(symbol: SettlementAsset): SupportedAsset {
  return SUPPORTED_ASSETS[symbol];
}

export function listSettlementAssets(): SupportedAsset[] {
  return Object.values(SUPPORTED_ASSETS).filter((a) => a.settlementEnabled);
}

export function isSettlementEnabled(symbol: SettlementAsset): boolean {
  return SUPPORTED_ASSETS[symbol]?.settlementEnabled === true;
}
