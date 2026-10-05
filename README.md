# Settlr

Pay in BCH. Settle your way.

Non-custodial Bitcoin Cash payment gateway. Customers pay a merchant-controlled cashaddr. Settlr watches that address and never holds keys.

## Run

```bash
node standalone/server.mjs
# http://127.0.0.1:3847
```

Data is written to `data/store.json`.

## What is real

- Merchant onboarding requires a checksum-valid P2PKH cashaddr the merchant controls.
- Quotes use the Riften Delphi oracle (`oracle_price` in cents) and Cauldron `/pool/active`.
- Invoice amount includes a 1–999 satoshi tag so a shared merchant address can be attributed without custody.
- Payment status is read from Electrum `blockchain.scripthash.listunspent` (`electrum.imaginary.cash:50002`).
- BCH settlement is the customer payment itself. When the tagged output is confirmed, status is SETTLED. Settlr does not sweep funds.
- PUSD settlement is an unsigned deepest-pool plan (0.3% LP fee, constant-product estimate). It is not marked settled until a merchant-signed swap is observed. MUSD stays disabled.

## Not done yet

- Merchant signature transport (WizardConnect / WalletConnect) for the Cauldron swap.
- `@cashlab/cauldron` transaction construction and broadcast via `broadcast.cauldron.quest`.
- Token-output verification for PUSD settlement.

No demo payment button. No key custody.
