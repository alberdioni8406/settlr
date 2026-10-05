/** Settlr core domain types */

export type SettlementAsset = 'BCH' | 'PUSD' | 'MUSD';

export type InvoiceStatus =
  | 'CREATED'
  | 'QUOTED'
  | 'AWAITING_PAYMENT'
  | 'PAYMENT_DETECTED'
  | 'PAYMENT_VALIDATED'
  | 'SETTLING'
  | 'SETTLEMENT_REQUIRED'
  | 'SETTLED'
  | 'EXPIRED'
  | 'UNDERPAID'
  | 'OVERPAID'
  | 'SETTLEMENT_FAILED'
  | 'REFUND_PENDING'
  | 'REFUNDED';

export interface SupportedAsset {
  symbol: SettlementAsset;
  name: string;
  tokenId: string | null; // null for native BCH
  decimals: number;
  network: 'mainnet';
  active: boolean;
  settlementEnabled: boolean;
  minimumLiquiditySats: number;
  maximumSlippageBps: number; // basis points
}

export interface Merchant {
  id: string;
  name: string;
  createdAt: string;
  defaultSettlement: SettlementAsset | 'PER_INVOICE';
  destinations: {
    BCH?: string; // bitcoincash: address
    PUSD?: string;
    MUSD?: string;
  };
}

export interface Quote {
  id: string;
  invoiceId: string;
  usdAmount: number;
  bchAmountSats: number;
  bchAmount: string; // human readable e.g. "0.074..."
  bchUsdPrice: number;
  settlementAsset: SettlementAsset;
  expectedSettlementAmount: string; // approximate human amount
  conversionFeeBps?: number;
  priceImpactBps?: number;
  routeSummary?: string;
  createdAt: string;
  expiresAt: string;
  valid: boolean;
}

export interface Invoice {
  id: string;
  merchantId: string;
  description?: string;
  usdAmount: number;
  settlementAsset: SettlementAsset;
  status: InvoiceStatus;
  paymentAddress: string; // BCH address the customer pays to
  bchAmountSats: number | null;
  currentQuoteId: string | null;
  quoteExpiresAt: string | null;
  paymentTxId: string | null;
  paymentDetectedAt: string | null;
  settlementTxId: string | null;
  settledAmount: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
}

export interface PaymentEvent {
  invoiceId: string;
  txId: string;
  amountSats: number;
  confirmed: boolean;
  detectedAt: string;
}

export interface SettlementResult {
  success: boolean;
  txId?: string;
  amount?: string;
  asset?: SettlementAsset;
  error?: string;
  simulated?: boolean; // true if not real chain execution
}
