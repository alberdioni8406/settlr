# Settlr Architecture

**Tagline:** Pay in BCH. Settle your way.

## Product Definition

Settlr is a non-custodial Bitcoin Cash payment gateway that lets customers pay in BCH while merchants choose whether to keep BCH or automatically settle payments into ParyOnUSD (PUSD) or MORIA USD (MUSD).

## Core Principles

- Non-custodial: never hold private keys, seed phrases, or user funds
- BCH-first: native settlement is first-class
- Merchant control over settlement preference
- Transparent conversion costs
- Cauldron as the liquidity/market layer (not invented endpoints)
- No fake blockchain functionality

## Supported Assets (Registry)

| Symbol | Name            | Token ID                                                         | Decimals | Settlement |
|--------|-----------------|------------------------------------------------------------------|----------|------------|
| BCH    | Bitcoin Cash    | native                                                           | 8        | Yes        |
| PUSD   | ParyOnUSD       | 2469acc5afa4b10cb5b5c04afb89c3a3ffd61c5da9c01e26d00951cae2a02544 | 2        | Yes        |
| MUSD   | MORIA USD       | b38a33f750f84c5c169a6f23cb873e6e79605021585d4f3408789689ed87f366 | 8*       | Yes*       |

*MUSD status: verify live liquidity / contract health before enabling settlement (prior V1 vulnerability + relaunch).

## Layered Architecture

```
SETTLR
│
├── Frontend (Next.js App Router)
│   ├── Customer payment page (/pay/[id])
│   ├── Merchant dashboard (/dashboard)
│   ├── Invoice creation
│   └── Settlement settings
│
├── Backend (API Routes + Services)
│   ├── Invoice service
│   ├── Quote service
│   ├── Payment monitor
│   ├── Settlement engine
│   ├── Merchant service
│   └── Webhook/API service (future)
│
├── Market layer
│   ├── Cauldron indexer client (https://indexer.riften.net)
│   ├── Token registry (explicit, not auto-discovered)
│   ├── Price service (oracle + Cauldron prices)
│   ├── Pool service
│   └── Liquidity / routing service
│
├── Blockchain layer
│   ├── BCH transaction monitoring (Electrum / Rostrum)
│   ├── CashToken validation
│   ├── Cauldron swap construction (@cashlab/cauldron)
│   ├── Transaction signing interface (non-custodial / merchant signs or PSBT-style)
│   └── Transaction broadcasting (broadcast.cauldron.quest)
│
└── Database (SQLite for MVP → Postgres later)
    ├── Merchants
    ├── Invoices
    ├── Payments
    ├── Settlements
    ├── Quotes
    └── Supported assets
```

## Invoice State Machine

```
CREATED → QUOTED → AWAITING_PAYMENT → PAYMENT_DETECTED → PAYMENT_VALIDATED
                                                              ↓
                                                         SETTLING → SETTLED
                                                              ↓
                                                      SETTLEMENT_FAILED
EXPIRED | UNDERPAID | OVERPAID | REFUND_PENDING | REFUNDED
```

## Settlement Flow

```
Customer pays BCH to payment address
         ↓
Payment detected & validated against invoice quote
         ↓
If settlement = BCH  → forward BCH to merchant BCH address
If settlement = PUSD → construct Cauldron BCH→PUSD trade → send PUSD to merchant PUSD address
If settlement = MUSD → construct Cauldron BCH→MUSD trade → send MUSD to merchant MUSD address
```

**Important non-custodial note:** For MVP BCH settlement we can use a dedicated payment address per invoice and instruct the merchant to monitor, or use a watch-only + notification model. Full atomic swap settlement (especially for stablecoins) requires either:
1. Merchant-signed PSBT / WalletConnect / WizardConnect for the settlement leg, or
2. A carefully designed non-custodial coordinator that never takes custody of keys.

In the first MVP we implement pure BCH receive + clear settlement status, with Cauldron market data + quote engine ready. Swap execution is isolated behind an interface and only enabled when a real non-custodial signing path is available.

## Cauldron Integration Points (real)

- Indexer base: `https://indexer.riften.net/cauldron/`
- Price: `GET /price/<token_id>/current`
- Active pools: `GET /pool/active?token=<token_id>`
- Token list: `GET /tokens/list_cached` or `/tokens/search_cached`
- Oracle BCH/USD: `/oracle/cash/closest` or Delphi
- Trade construction: `@cashlab/cauldron` ExchangeLab
- Broadcast: `POST https://broadcast.cauldron.quest/broadcast`

## MVP Build Order (executed)

1. BCH invoice / payment page
2. BCH merchant settlement destination
3. Cauldron market-data integration + quote engine
4. PUSD settlement path (behind interface)
5. MUSD settlement path
6. Merchant dashboard
7. Robust error handling & state machine

## Security Rules

- Backend independently verifies all amounts, token IDs, destinations
- Never trust frontend-calculated BCH amounts
- Quotes expire (default 60s)
- No private keys, seeds, or nsecs ever accepted or stored
- Explicit asset registry only
