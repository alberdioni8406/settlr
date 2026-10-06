# Settlr settlement plugin (unsigned plans)

Settlr stays non-custodial. After a customer pays **BCH** to the merchant cashaddr, PUSD (or other CashToken) settlement is **opt-in** via your own signer.

## Flow

1. Invoice with `settlement_asset: "PUSD"` and a token-aware destination (`bitcoincash:z…`).
2. Customer pays exact quoted sats → status becomes `SETTLEMENT_REQUIRED`.
3. Call **`POST /api/settle/plan`** with the paid sats and `z…` address.
4. Receive an **unsigned** plan (`status: "UNSIGNED_PLAN"`).
5. Your implementation builds and signs the Cauldron trade (CashLab, cauldron-swap-sdk, or custom).
6. You broadcast; PUSD lands on your token address.

## Request

```http
POST /api/settle/plan
Content-Type: application/json

{
  "settlementAsset": "PUSD",
  "bchSatsIn": 123456,
  "tokenDestination": "bitcoincash:z...",
  "paymentTxId": "optional_txid"
}
```

## Response (shape)

- `plan.token_id` — CashToken category id  
- `plan.pools[]` — pool outpoints + allocated sats + estimated token out  
- `plan.estimated_tokens_human` — indicative amount  
- `plan.implementer_notes` — libraries and constraints  
- `plugin.how_to_use` — ordered steps  

## Suggested libraries

- `@cashlab/cauldron` — `ExchangeLab.constructTradeBestRateForTargetDemand` / `createTradeTx`
- `@mr-zwets/cauldron-swap-sdk` — `prepareBuyTokens` / `prepareSellTokens`

## What Settlr will not do

- Hold private keys or seeds  
- Auto-broadcast a swap as if it were settled without a real token tx  
- Mark PUSD invoices `SETTLED` until your agent reports a verified token output (optional future webhook)
