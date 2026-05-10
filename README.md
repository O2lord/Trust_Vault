# Trust Vault

> **The trust layer between crypto and fiat.**

Non-custodial crypto-to-fiat settlement infrastructure built on Solana preventing the fraud, failure, and irreversibility that define P2P crypto trading in Nigeria and Sub-Saharan Africa.

**Pitch Video:** https://www.youtube.com/watch?v=UJ4Uark-g4I
**Demo Video:** https://www.youtube.com/watch?v=yiSrMvM60LI

---

## The Problem

In 2024, Binance exited Nigeria taking with it the last reliable on/off ramp for millions of crypto users. What replaced it was raw, manual P2P trading on WhatsApp groups and Telegram channels.

**1-in-6 P2P trades involves fraud.** 31% of users report payout discrepancies. The #1 frustration in stablecoin trading globally is irreversible payments and fund loss (30%, BVNK 2026). There is no enforcement mechanism one party always goes first, trusting a stranger.

Nigeria is not an emerging market for crypto, it is the world's most active stablecoin market: #1 globally for stablecoin ownership (BVNK/YouGov 2026), $48.2M in daily P2P stablecoin volume, $92B in on-chain value received in the past year (Chainalysis 2025). The problem is not liquidity. The problem is **trust** and there is no protocol layer that enforces it.

I built Trust Vault after being personally scammed in one of those trades.

---

## The Solution

Trust Vault is **crypto-to-fiat settlement infrastructure** not a P2P app, not a custodian, not an exchange.

It introduces three things the Nigerian P2P market has never had at protocol level:

1. **On-chain escrow** — tokens locked in a Solana smart contract, released only after verified fiat settlement. No single party can release them unilaterally
2. **Decentralized payment verification** — a 3-of-5 independent validator consensus network confirms fiat payment before tokens ever move
3. **Solana Pay merchant flow** — businesses accept USDC from customers and receive naira directly to their bank account, never holding crypto

The result: trustless, non-custodial, registration-free settlement between crypto and fiat where the smart contract enforces what used to depend on a stranger's honesty.

---

## How It Works

### Off-Ramp Flow (Sell Crypto → Receive Fiat)

```
1. User connects wallet: no KYC, no registration, no account
2. User selects a Liquidity Provider's buy order and calls instant_reserve
3. User's stablecoins (USDC/SPL tokens) transferred into the TrustExpress escrow PDA
4. Executor validator wins the election race → calls /api/initiate-buy-payout
   LP's payment processor (Flutterwave / Paystack / Korapay) initiates bank transfer to user
5. All 5 validators independently poll /api/verify-transfer
   Each confirms the fiat transfer status with the LP's payment processor API
6. Each validator submits submit_buy_vote on-chain
7. On the 3rd approving vote → ValidatorVote.executed = true
   Program atomically releases tokens to LP (maker)
   Fee distributed: 40% platform / 40% LP / 20% validators
```

### On-Ramp Flow (Buy Crypto → Pay Fiat)

```
1. User connects wallet, selects a Liquidity Provider's sell order
2. User calls instant_sell_reserve no token movement (tokens already in escrow)
3. Payment link:
   Bot generates Flutterwave/Korapay checkout URL → user pays via checkout → webhook fires
   Payment mode 1 (API monitoring):
   Validators poll LP's processor for matching inbound transfer
4. All 5 validators independently call /api/verify-payment to confirm inbound payment
5. Each validator submits submit_sell_vote on-chain
6. On the 3rd approving vote:
   Program atomically releases tokens from escrow to buyer
   Fee split: 50% platform / 30% LP / 20% validators
```

### Merchant QR Flow (Accept Crypto, Receive Fiat)

```
1. Merchant opens /express/merchant — enters fiat amount owed by customer (e.g. ₦5,000)
2. Protocol selects the best available LP (highest price per token, has capacity)
3. QR code generated as a Solana Pay URL → /api/solana-pay/instant-reserve
4. Customer scans with any Solana wallet (Phantom, Backpack) and pays USDC
5. USDC flows into the LP's buy order escrow via instant_reserve
6. LP's payment processor sends ₦5,000 naira to the merchant's bank account
7. Validator network confirms transfer → 3-of-5 votes → tokens released to LP
8. Merchant sees receipt inline — never held crypto at any point
   NOTE: Merchant and LP are entirely separate roles. The LP is the invisible bridge.
```

---

## Program Architecture

**Deployed Program ID:** `6Z8rRkDxtLWBEGgeccx8AWj9Um8osnLQihEA1xiECHWr`

Trust Vault uses a modular Anchor architecture with separate instruction modules for buy and sell order flows, a decentralized 3-of-5 validator vote system, and a per-validator fee accumulation layer.

### Data Flow

#### 1. Buy Order Creation

```
LP → create_express_buy_order
  ↓
Program validates amount, price, currency
  ↓
Derives TrustExpress PDA: [b"trust-express", maker.key(), seed.to_le_bytes()]
  ↓
Initializes TrustExpress account:
  - escrow_type = EXPRESS_BUY (1)
  - No vault ATA created (LP's fiat is off-chain)
  - fee_percentage = 5 basis points (0.05% on-chain default)
  - flutterwave_credential_id stored (Supabase encrypted credential lookup key)
  ↓
GlobalState.total_trust_express_created incremented
  ↓
ExpressBuyOrderCreatedEvent emitted
```

#### 2. Instant Reserve (User Sells Crypto)

```
Taker (seller) → instant_reserve
  ↓
Program validates: (order.amount - sum(active_reservations)) >= requested amount
  ↓
Max 10 concurrent reservations per order enforced
  ↓
Transfers tokens FROM taker's ATA TO TrustExpress vault ATA
  ↓
Creates ReservedAmount entry:
  - taker (seller address)
  - amount, fiat_amount
  - payout_reference: "IS-{txSig[0:10]}-{wallet[0:8]}"
  - payout_details: compact JSON {b, a, n} = bank_code, account_number, name
  - status = PENDING (0)
  ↓
TrustExpress.amount decremented
  ↓
InstantPaymentReservedEvent emitted (contains payout_details, payout_reference, taker, amount)
  ↓
Off-chain: 5 validators detect event, race to elect executor, initiate fiat payout
```

#### 3. Validator Vote Flow — Buy Order (3-of-5 Consensus)

```
All 5 validators detect InstantPaymentReservedEvent
  ↓
All POST /api/bot/elect-executor (race INSERT into buy_order_payouts, unique on payout_reference)
  → Winner: EXECUTOR (INSERT succeeds)
  → Losers: VERIFIER (unique constraint 23505)
  → Heartbeat gate: last_heartbeat must be < 2 min old; else 403
  ↓
EXECUTOR only → POST /api/initiate-buy-payout
  → Fetches + decrypts LP credentials from Supabase (AES-256-GCM)
  → Dispatches fiat transfer via Flutterwave / Paystack / Korapay
  → Records flw_transfer_reference in buy_order_payouts row
  → On failure: votes NO immediately
  ↓
ALL validators poll GET /api/bot/payout-status (timeout: 60 s, random 0–3 s jitter)
  → Waits for flw_transfer_reference to appear in DB
  → status = 'failed_to_initiate' → fast-fail, vote NO
  ↓
ALL validators poll GET /api/verify-transfer (up to 24 × 5 s polls = 2 min max)
  → Each independently queries LP's processor API for transfer status
  → SUCCESSFUL or PENDING → vote YES
  → FAILED or REVERSED → vote NO immediately
  ↓
ALL validators call submit_buy_vote on-chain (3 retries, exponential backoff)
  ↓
3rd YES vote → ValidatorVote.executed = true
  → Tokens atomically released to LP (maker)
  → 0.5% fee distributed: 30% platform / 50% LP / 20% split to ValidatorEarnings PDAs
  → Receipt generated via /api/bot/generate-buy-receipt
```

#### 4. Sell Order Creation

```
LP → create_express_sell_order
  ↓
Program validates amount, price, currency
  ↓
Calculates reserved_fee = amount * fee_percentage / 10000
  ↓
Transfers FULL amount from LP's ATA to TrustExpress vault ATA (tokens in escrow immediately)
  ↓
TrustExpress initialized:
  - escrow_type = EXPRESS_SELL (0)
  - amount = deposited - reserved_fee  (available for reservations)
  - reserved_fee held separately until settlement
  ↓
GlobalState counter incremented
  ↓
ExpressSellOrderCreatedEvent emitted
```

#### 5. Instant Sell Reserve (User Buys Crypto)

```
Taker (buyer) → instant_sell_reserve
  ↓
Program validates available amount
  ↓
NO token movement — tokens already in vault from order creation
  ↓
Creates ReservedAmount:
  - taker (buyer address)
  - payment_mode (0 = checkout link, 1 = direct transfer monitoring)
  - payout_reference (client-generated: "IS-{timestamp}-{walletPrefix}")
  - status = PENDING (0)
  ↓
TrustExpress.amount decremented
  ↓
InstantSellReservationCreatedEvent emitted
  ↓
Mode 0: Bot generates checkout URL, stores in payment_links table, delivers link to buyer
Mode 1: All validators poll LP's processor for matching inbound transfer
```

#### 6. Validator Vote Flow — Sell Order (3-of-5 Consensus)

```
All validators detect InstantSellReservationCreatedEvent
  ↓
Wait VERIFICATION_DELAY_MS (10 s) for payment to settle
  ↓
ALL validators poll GET /api/verify-payment (up to 8 × 15 s retries = 2 min max)
  → Each independently verifies inbound payment status from LP's processor
  ↓
ALL validators call submit_sell_vote on-chain
  ↓
3rd YES vote → ValidatorVote.executed = true
  → Tokens atomically transferred from vault to buyer (taker)
  → Proportional fee from reserved_fee: 40% platform / 40% LP / 20% validators
  → Receipt generated via /api/bot/generate-sell-receipt
```

#### 7. Validator Fee Claim

```
Validator → claim_validator_fees
  ↓
Reads ValidatorEarnings PDA for this validator + mint
  ↓
Transfers accumulated_amount from validator fee pool ATA to validator's wallet
  ↓
accumulated_amount zeroed; total_earned preserved (lifetime record)
```

#### 8. Withdrawal Flow

```
LP → express_withdraw(withdraw_amount)
  ↓
available_balance = vault_token_balance - sum(active_reservation_amounts)
  ↓
Validates withdraw_amount ≤ available_balance
  ↓
Calculates proportional fee withdrawal from reserved_fee
  ↓
Transfers (withdraw_amount + fee_portion) to LP wallet
  ↓
If remaining_balance ≤ dust_threshold AND no active reservations:
  → Transfers any dust to LP
  → Closes TrustExpress account (returns rent to maker)
  → Closes vault ATA
  → ExpressClosedEvent emitted
Else:
  → ExpressPartialWithdrawalEvent emitted
```

---

### PDA Architecture

Five PDA types enforce trustless, program-controlled state:

#### 1. TrustExpress PDA (Order / Escrow Account)

- **Seeds:** `[b"trust-express", maker.key(), seed.to_le_bytes()]`
- One per LP order; supports multiple orders per LP via different `seed` values
- Holds full order state and active reservations
- For SELL orders: also controls the vault ATA (token escrow)

```rust
#[account(
    init,
    payer = maker,
    space = ANCHOR_DISCRIMINATOR + TrustExpress::INIT_SPACE,
    seeds = [b"trust-express", maker.key().as_ref(), seed.to_le_bytes().as_ref()],
    bump
)]
pub trust_express: Box<Account<'info, TrustExpress>>
```

#### 2. GlobalState PDA

- **Seeds:** `[b"global-state"]`
- Singleton — one platform-wide account
- Stores validator registry (5 slots), fee config, pause switches, lifetime stats

```rust
#[account(
    init_if_needed,
    payer = authority,
    space = 8 + GlobalState::INIT_SPACE,
    seeds = [b"global-state"],
    bump
)]
pub global_state: Account<'info, GlobalState>
```

#### 3. Vault Token Account (ATA, PDA-controlled)

- **Authority:** TrustExpress PDA
- Holds tokens in escrow for SELL orders (BUY orders receive tokens from taker at reservation time)
- Only the program can sign transfers — no private key, no human custody

```rust
#[account(
    init,
    payer = maker,
    associated_token::mint = mint,
    associated_token::authority = trust_express,
    associated_token::token_program = token_program
)]
pub trust_express_ata: Box<InterfaceAccount<'info, TokenAccount>>
```

PDA signer seeds pattern used on all vault transfers:

```rust
let seeds = &[
    b"trust-express",
    maker_key.as_ref(),
    &trust_express_seed.to_le_bytes()[..],
    &[trust_express_bump],
];
let signer_seeds = &[&seeds[..]];
```

#### 4. ValidatorVote PDA

- **Seeds:** `[b"validator-vote", trust_express.key(), reference_hash]`
- `reference_hash = keccak_256(payout_reference)` — 32-byte deterministic hash
- Created on the first validator vote for a given reservation
- Tracks `votes_for`, `votes_against`, `voters[5]`, `vote_results[5]`, `executed`, `expires_at`

#### 5. ValidatorEarnings PDA

- **Seeds:** `[b"validator-earnings", validator.key(), mint.key()]`
- One per validator per token mint
- `accumulated_amount`: claimable balance (zeroed on claim)
- `total_earned`: lifetime total (never decrements)
- `total_credits`: vote executions credited to this validator

---

### Program Instructions

#### Admin Instructions

| Instruction                       | What it does                                                                     |
| --------------------------------- | -------------------------------------------------------------------------------- |
| `initialize_global_state`         | Creates GlobalState PDA. Idempotent. Sets fee=5bps, required_votes=3             |
| `update_fee_percentage`           | Max 1000 bps. Emits FeePercentageUpdatedEvent                                    |
| `update_fee_destination`          | Changes platform fee recipient                                                   |
| `pause_buy_orders(paused: bool)`  | Blocks new buy order creation + reservations. Cancels/withdrawals always allowed |
| `pause_sell_orders(paused: bool)` | Same for sell side                                                               |
| `register_validator`              | Adds pubkey to validators[5]. Fails if full or already registered                |
| `remove_validator`                | Zeroes the slot. BLOCKED if `active_vote_count > 0` (prevents mid-vote changes)  |
| `update_required_votes`           | Set 1–5. Must not exceed `validator_count`                                       |
| `set_global_stats`                | Admin backfill of historical volume/confirmations                                |

#### Order Instructions

| Instruction                              | What it does                                                                 |
| ---------------------------------------- | ---------------------------------------------------------------------------- |
| `create_express_buy_order`               | LP creates buy order. No token deposit. `flutterwave_credential_id` stored   |
| `create_express_sell_order`              | LP creates sell order. Tokens transferred to escrow ATA immediately          |
| `cancel_or_reduce_buy_order(new_amount)` | `new_amount=0` closes and returns rent. Partial reduce allowed if ≥ reserved |
| `express_withdraw(withdraw_amount)`      | LP withdraws available tokens + proportional fee. Closes account near dust   |
| `update_price(new_price_per_token)`      | Maker-only. Emits ExpressPriceUpdatedEvent                                   |

#### Reservation Instructions

| Instruction            | What it does                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------- |
| `instant_reserve`      | Taker sells tokens to buy order. Tokens transferred FROM taker ATA TO vault ATA. Max 10 per order |
| `instant_sell_reserve` | Buyer reserves from sell order. NO token movement. Decrements available amount                    |

#### Validator Instructions

| Instruction             | What it does                                                                  |
| ----------------------- | ----------------------------------------------------------------------------- |
| `submit_buy_vote`       | Validator votes on buy-side payout. 3rd YES vote → tokens released to LP      |
| `submit_sell_vote`      | Validator votes on sell-side release. 3rd YES vote → tokens released to buyer |
| `finalize_expired_vote` | After `expires_at` → refund path. Called by 5-min expired vote cleaner        |
| `claim_validator_fees`  | Validator claims `accumulated_amount` from per-mint fee pool ATA              |

---

### Account Structures

```rust
#[account]
#[derive(InitSpace)]
pub struct TrustExpress {
    pub seed: u64,                                   // Unique order identifier (user-provided)
    pub maker: Pubkey,                               // LP wallet
    pub mint: Pubkey,                                // SPL token mint
    pub currency: [u8; 3],                           // Fiat currency code (e.g. b"NGN") — 3 bytes NOT 4
    pub escrow_type: u8,                             // 0=SELL, 1=BUY
    pub fee_percentage: u16,                         // Basis points — u16 NOT f32
    pub fee_destination: Pubkey,                     // Platform fee wallet
    pub reserved_fee: u64,                           // Pre-allocated fee for sell orders
    pub amount: u64,                                 // Available for new reservations (NOT total deposited)
    pub price_per_token: u64,                        // Fiat per whole token (raw fiat units)
    #[max_len(100)]
    pub payment_instructions: String,                // LP's bank/account routing info
    #[max_len(10)]
    pub reserved_amounts: Vec<ReservedAmount>,       // Active reservations (max 10)
    #[max_len(64)]
    pub flutterwave_credential_id: Option<String>,   // Supabase credential lookup key
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct ReservedAmount {
    pub taker: Pubkey,
    pub amount: u64,
    pub fiat_amount: u64,
    pub timestamp: i64,
    #[max_len(100)]
    pub seller_instructions: Option<String>,
    pub status: u8,                                  // 0=Pending 1=PaymentSent 2=Completed 3=Cancelled 4=Disputed
    #[max_len(100)]
    pub dispute_reason: Option<String>,
    #[max_len(6)]
    pub dispute_id: Option<String>,
    #[max_len(100)]
    pub payout_details: Option<String>,              // Compact JSON: {b, a, n}
    #[max_len(64)]
    pub payout_reference: Option<String>,            // "IS-{sig[0:10]}-{wallet[0:8]}"
    pub payment_mode: u8,                            // 0=checkout link, 1=direct transfer monitoring
    #[max_len(200)]
    pub payment_link: Option<String>,                // Flutterwave/Korapay checkout URL
    #[max_len(64)]
    pub transaction_reference: Option<String>,       // Processor transaction reference
}

#[account]
#[derive(InitSpace)]
pub struct GlobalState {
    pub authority: Pubkey,                           // Platform admin
    pub fee_percentage: u16,
    pub fee_destination: Pubkey,
    pub total_trust_express_created: u64,
    pub total_trust_express_closed: u64,
    pub total_confirmations: u64,
    pub total_fees_collected: u64,
    pub total_disputes: u64,
    pub total_volume: u64,
    pub high_watermark_volume: u64,
    pub validators: [Pubkey; 5],                     // Registered validator pubkeys (up to 5 slots)
    pub validator_count: u8,                         // Filled slots
    pub required_votes: u8,                          // Consensus threshold (default 3)
    pub validator_fee_pool_authority: Pubkey,        // PDA that signs fee pool ATAs
    pub active_vote_count: u64,                      // Open ValidatorVote PDAs (blocks validator removal)
    pub buy_orders_paused: bool,
    pub sell_orders_paused: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct ValidatorVote {
    pub trust_express: Pubkey,
    pub taker: Pubkey,
    pub reference_hash: [u8; 32],                   // keccak_256(payout_reference)
    pub votes_for: u8,
    pub votes_against: u8,
    pub voters: [Pubkey; 5],
    pub vote_results: [bool; 5],
    pub executed: bool,                              // true once threshold hit and tokens moved
    pub created_at: i64,
    pub expires_at: i64,
    pub is_buy_order: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct ValidatorEarnings {
    pub validator: Pubkey,
    pub mint: Pubkey,
    pub accumulated_amount: u64,                     // Claimable — zeroed on claim
    pub total_earned: u64,                           // Lifetime — never decrements
    pub total_credits: u64,                          // Vote executions credited
    pub bump: u8,
}
```

---

### Key Architectural Decisions

1. **`escrow_type` values**: 0 = SELL, 1 = BUY — counterintuitive; don't swap
2. **BUY order tokens**: LP does NOT deposit tokens at creation. Tokens arrive when the taker calls `instant_reserve`
3. **SELL order tokens**: Deposited upfront at creation. `instant_sell_reserve` does NOT move tokens — they're already in escrow
4. **`amount` always means available** — NOT total deposited. Decremented on reservation; restored on failure
5. **Validator removal blocked by `active_vote_count > 0`** — prevents mid-vote validator set changes
6. **Executor election via DB race** — `INSERT INTO buy_order_payouts` with unique constraint on `payout_reference`. Network errors default to `verifier` to prevent double-payout
7. **`remainingAccounts` pattern** — both `submit_buy_vote` and `submit_sell_vote` pass `ValidatorEarnings` PDAs for ALL registered validators as writable remaining accounts (not just voters), avoiding the race condition of reading the vote account's `voters` array during concurrent voting
8. **Credential isolation**: `flutterwave_credential_id` on TrustExpress is a lookup key only. Actual API credentials are AES-256-GCM encrypted in Supabase; the smart contract never touches them
9. **Dust threshold**: `max(10^(decimals-3), 1000)`. Account auto-closes when remaining ≤ this with no active reservations
10. **`payout_details` compact format**: Stored as `{b, a, n}` JSON to fit the 100-char `payment_instructions` limit on-chain
11. **SPL + Token-2022 auto-detection**: `tokenProgram` determined by reading `mint.owner` at runtime; ATA derivation uses the correct program ID for each

---

## Payment Processor Architecture

Trust Vault integrates three independent payment processors. LPs select their processor at order creation; the `processor` field determines which service is called at runtime.

| Processor       | Flows      | Coverage                                    | Credential  |
| --------------- | ---------- | ------------------------------------------- | ----------- |
| **Flutterwave** | Buy + Sell | Nigeria, Ghana, Kenya, South Africa, Uganda | `secretKey` |
| **Paystack**    | Buy + Sell | Nigeria, Ghana                              | `secretKey` |
| **Korapay**     | Buy + Sell | Nigeria                                     | `secretKey` |

**Credential storage**: AES-256-GCM encrypted in Supabase `buyer_flutterwave_credentials` and `seller_flutterwave_accounts` tables. Link tables (`buy_order_credentials`, `sell_order_credentials`) map each TrustExpress PDA to a credential row. All processors share the same `FLUTTERWAVE_ENCRYPTION_KEY` and encryption scheme.

**Multi-processor dispatch** in verify routes:

```ts
if (credInfo.processor === 'paystack') → verifyPaystackPayment / checkPaystackTransferStatus
else                                   → verifyFlutterwavePayment / checkFlutterwaveTransferStatus
```

All existing DB rows default to `'flutterwave'` when the `processor` column is null — full backward compatibility.

**Fallback mechanism**: If LP credentials fail at payout initiation, executor falls back to platform credentials and notifies the LP via Discord.

---

## Validator Bot Architecture

### Overview

The Trust Vault validator bot (`trustvault-validator-bot`) is a TypeScript Node.js ESM service that runs five independent validators concurrently in one process. Each is a full `ValidatorBot` instance with its own keypair, Anchor program client, in-flight deduplication set, and processed-signature cache.

### Structure

```
validator-bot/
├── handlers/
│   └── buyOrderHandler.ts    ← Executor election, payout initiation, transfer polling, vote submission
├── relics/
│   ├── trust_vault.json      ← Anchor IDL
│   └── trust_vault.ts        ← Generated TypeScript types
├── run-all.ts                ← Starts all 5 validators via Promise.allSettled()
├── val_bot.ts                ← ValidatorBot class + single-validator entry point
└── version.ts                ← BOT_VERSION (git SHA injected at build time)
```

### Startup Sequence

Each `ValidatorBot` instance on `start()`:

1. Verifies RPC connectivity via `getVersion()`
2. Fetches `GlobalState` PDA and confirms its pubkey is in `validators[]`
3. Calls `catchupMissedReservations()` — replays any PENDING reservations that landed while the bot was offline
4. Subscribes via `connection.onLogs(PROGRAM_ID, ...)` at `confirmed` commitment
5. Starts `startExpiredVoteCleaner()` on a 5-minute interval

### Catchup (`catchupMissedReservations`)

- Fetches all `TrustExpress` accounts by discriminator memcmp `[22, 110, 124, 216, 223, 105, 7, 33]`
- For each PENDING reservation (status=0) with a `payoutReference`:
  - Derives the `ValidatorVote` PDA and checks if this validator has already voted or if the vote is executed
  - If not yet voted, synthesises a `ReservationEvent` and replays it through `handleReservationEvent()`
- Ensures no reservations are dropped during downtime or process restart

### Buy Order Handler (`buyOrderHandler.ts`)

All buy-order logic lives here. All validators call `handleBuyReservation()` for every buy reservation. Zero Supabase access from the validator — only `VALIDATOR_API_KEY` + `PLATFORM_API_URL` + keypair required.

```
Step 1  ALL validators POST /api/bot/elect-executor
        → Race INSERT into buy_order_payouts (unique on payout_reference)
        → One wins EXECUTOR; rest become VERIFIERS
        → On network error: defaults to 'verifier' (safe — prevents double-payout)

Step 2  EXECUTOR only → POST /api/initiate-buy-payout
        → Fetches feePercentage from on-chain TrustExpress account
        → takerFiatAmount = scaledFiatAmount - floor(scaledFiatAmount * feePercentage / 10000)
        → Sends: payout_reference, trust_express_pda, taker, maker,
                  fiat_amount (after fee), token_amount, currency, payout_details
        → Server fetches/decrypts LP credentials, dispatches fiat transfer
        → Records flw_transfer_reference in buy_order_payouts DB row
        → On failure: votes NO immediately

Step 3  ALL validators poll GET /api/bot/payout-status (60 s, random 0–3 s jitter)
        → Waits for flw_transfer_reference to appear
        → status='failed_to_initiate' → fast-fail, vote NO

Step 4  ALL validators poll GET /api/verify-transfer (24 × 5 s = 2 min max)
        → Each independently queries LP's processor API
        → SUCCESSFUL or PENDING → vote YES
        → FAILED or REVERSED → vote NO immediately

Step 5  ALL validators call submit_buy_vote on-chain (3 retries, exponential backoff)
        → 3rd YES vote → program releases tokens to LP
        → Fee distributed across ValidatorEarnings PDAs
```

### Sell Order Flow (`val_bot.ts`)

```
1. Wait VERIFICATION_DELAY_MS (10 s) for fiat payment to settle
2. Poll GET /api/verify-payment up to 8 × 15 s = 2 min
   → Each validator independently confirms inbound payment status
3. Call submit_sell_vote on-chain
4. On 3rd YES vote → tokens released to buyer
5. POST /api/bot/generate-sell-receipt (non-fatal if fails)
```

### Expired Vote Cleaner (every 5 min)

- Fetches all `ValidatorVote` PDAs by discriminator `[63, 68, 242, 159, 202, 98, 147, 175]`
- **Executed votes** → calls `closeExecutedVote()` to reclaim rent
- **Expired votes** (past `expires_at`) → calls `finalizeExpiredVote(payoutReference)` to trigger on-chain refund path

### Event Decoding

The Anchor IDL coder is NOT used (returns empty objects — IDL has no field definitions on events). All decoding is manual buffer parsing scanning `"Program data: ..."` log lines:

| Event                                       | Discriminator                            |
| ------------------------------------------- | ---------------------------------------- |
| `InstantPaymentReservedEvent` (buy)         | `[1, 110, 251, 231, 168, 10, 216, 190]`  |
| `InstantSellReservationCreatedEvent` (sell) | `[65, 196, 145, 144, 214, 136, 85, 139]` |

`reference_hash` for ValidatorVote PDA = `keccak_256(payoutReference)` as 32-byte `number[]`.

> `maker` is NOT in the buy event log — fetched from the `TrustExpress` account separately after decoding.

### Platform API Endpoints (called by validator bots)

All requests carry `botHeaders`: `x-validator-key` (API key), `x-bot-version` (git SHA). Server authenticates via SHA-256 hash lookup in `validators` table and bot version check against `bot_versions` table.

| Endpoint                              | Caller                              | Purpose                               |
| ------------------------------------- | ----------------------------------- | ------------------------------------- |
| `POST /api/bot/heartbeat`             | All validators, every 60 s          | Updates `last_heartbeat`, `is_online` |
| `POST /api/bot/elect-executor`        | All validators, per buy reservation | Race INSERT to elect executor         |
| `POST /api/initiate-buy-payout`       | Executor only                       | Initiate fiat transfer to user        |
| `GET /api/bot/payout-status`          | All validators                      | Poll for flw_transfer_reference       |
| `GET /api/verify-transfer`            | All validators                      | Confirm outbound transfer status      |
| `GET /api/verify-payment`             | All validators                      | Confirm inbound payment status        |
| `POST /api/bot/generate-sell-receipt` | Any validator                       | Create receipt after sell vote        |
| `POST /api/bot/generate-buy-receipt`  | Executor                            | Create receipt after buy vote         |

### Fault Tolerance

- `inFlight` Set (keyed by `payoutReference`) prevents duplicate processing within one bot instance
- `processedSignatures` cache (2000 entries, rolling) prevents replaying seen transactions
- All 5 validators start via `Promise.allSettled()` — one crash doesn't abort others
- Graceful shutdown on `SIGINT` / `SIGTERM`
- `bot_versions` table gates ALL routes — only 2 most recent allowed versions accepted; version mismatch logged to `validator_version_flags`

### Key Timing Constants

| Constant                           | Value      | Purpose                            |
| ---------------------------------- | ---------- | ---------------------------------- |
| `VERIFICATION_DELAY_MS`            | 10,000 ms  | Wait before sell payment polling   |
| `MAX_VERIFY_RETRIES`               | 8          | Sell payment poll max attempts     |
| `RETRY_DELAY_MS`                   | 15,000 ms  | Sell payment poll interval         |
| `MAX_WAIT_FOR_EXECUTOR_MS`         | 60,000 ms  | Buy: wait for transfer reference   |
| `MAX_TRANSFER_POLLS`               | 24         | Buy: transfer status max polls     |
| `POLL_INTERVAL_MS`                 | 5,000 ms   | Buy: transfer status poll interval |
| Expired vote cleaner               | 300,000 ms | Every 5 min                        |
| Heartbeat interval                 | 60,000 ms  | Per validator                      |
| Heartbeat gate (executor election) | 120,000 ms | Max age before 403 rejection       |
| `FLW_TEST_MODE` delay              | 20,000 ms  | Extra settle time in test env      |

---

## Discord Bot Architecture

The Discord bot bridges on-chain events with off-chain notification delivery. It monitors Solana program events, manages Flutterwave webhook processing for sell orders (payment link mode), and sends role-specific Discord notifications to all transaction participants.

### Core Components

- **EventParser**: Parses Solana transaction logs to extract program events
- **EventDecoder**: Decodes base64-encoded event data using discriminators
- **Dual Program Monitoring**: Tracks both `TRUST_VAULT` and `TRUST_EXPRESS` programs simultaneously
- **Payment Processing Engine**: Flutterwave integration for sell-order payment links; credential fallback to platform keys
- **Notification System**: Role-specific embeds (buyer/seller/maker/taker), multi-channel (DM + channel), user preference management via Supabase

### Sell Order — Payment Link Mode (Mode 0)

```
1. Bot detects InstantSellReservationCreatedEvent
2. Fetches mint decimals for correct fiat scaling
3. Fetches seller's Flutterwave credential from Supabase
4. Generates Flutterwave checkout URL
5. Stores URL in payment_links table
6. Delivers link to buyer via Discord DM
7. Buyer completes payment → Flutterwave webhook fires
8. Bot updates payment_links to 'completed'
   (Validator network independently verifies and votes)
```

### Circuit Breakers

| Breaker     | Threshold  | Timeout | Reset |
| ----------- | ---------- | ------- | ----- |
| Flutterwave | 3 failures | 30 s    | 60 s  |
| Solana RPC  | 5 failures | 10 s    | 30 s  |

### Error Handling

- Account fetching: 3 retries with exponential backoff
- Payment link storage: 3 retries with exponential backoff
- Discord notifications: 3 retries for retryable errors
- Deduplication: `${trustExpress}-${payoutReference}` key prevents duplicate processing

---

## Frontend Architecture

Built with Next.js 14 + Solana Wallet Adapter. Wallet-connect only — no registration, no KYC, no user data stored.

### Key Pages

| Route                                | Purpose                                             |
| ------------------------------------ | --------------------------------------------------- |
| `/`                                  | Landing page with live GlobalStats                  |
| `/express`                           | P2P marketplace: buy + sell order grids             |
| `/express/merchant`                  | Merchant QR page: bank setup → amount → QR code     |
| `/express/providers/dashboard`       | LP dashboard: orders, credentials, earnings         |
| `/express/providers/settings`        | LP settings + all credential managers               |
| `/express/admin`                     | Admin dashboard (authority-gated to TVogEs...)      |
| `/pay/[reference]`                   | Standalone payment page for Blink users (sell flow) |
| `/reserve/[pubkey]`                  | Shareable LP pool link (TipLink-style)              |
| `/receipts/[id]`                     | Transaction receipt with on-chain token metadata    |
| `/requests`                          | P2P payment request inbox/outbox                    |
| `/payment-success/[payoutReference]` | Post-checkout redirect handler                      |

### Core Hooks

| Hook                              | Purpose                                                           |
| --------------------------------- | ----------------------------------------------------------------- |
| `useTrustExpress`                 | Master hook: all program instructions + account queries           |
| `useExpressGlobalStats`           | GlobalState read + volume/fees with correct decimals              |
| `useExpressBalances`              | Batched — ALL vault balances in 2 `getMultipleAccountsInfo` calls |
| `useTransactionMonitoring`        | Tri-path payment detection (WebSocket + HTTP + Supabase Realtime) |
| `useProcessorBanks`               | Detects processor for a PDA, fetches bank list, verifies accounts |
| `useValidatorEarnings`            | ValidatorEarnings PDA + pool ATA balance                          |
| `useBuyerFlutterwaveCredentials`  | Manage buyer credentials across all processors                    |
| `useSellerFlutterwaveCredentials` | Manage seller credentials across all processors                   |
| `usePaymentRequests`              | P2P token + fiat request inbox/outbox                             |
| `useMerchantBankAccounts`         | Merchant bank account management                                  |

### Payment Detection (`useTransactionMonitoring`)

Three parallel paths — whichever fires first wins:

- **Path A (WebSocket):** `connection.onAccountChange` — fast (~1–2 s), unreliable on Android
- **Path B (HTTP polling):** Starts at reservation time, polls every 3 s, max 4.5 min — covers Android where WebSocket drops
- **Path C (Supabase Realtime):** Direct INSERT subscription on `receipts` table — critical on Android where the browser tab is suspended while the wallet app is in focus

`pollingStartTime` captured at `startMonitoring()` call, NOT inside the WebSocket callback — critical fix for Android.

### Solana Pay / Merchant QR (`/api/solana-pay/instant-reserve`)

Full Solana Pay Actions endpoint:

- **GET**: Returns Actions metadata + pre-flight LP capacity check (prevents customer approving a transaction that will fail on-chain)
- **POST**: Builds and returns unsigned `instant_reserve` transaction for wallet to sign
- Manual Borsh encoding (Anchor client unavailable in edge runtime); discriminator: `[49, 131, 230, 138, 27, 60, 108, 209]`
- Token amount re-derived server-side via ceiling integer arithmetic — never from client float
- `payout_details` stored as compact JSON `{b, a, n}` to fit 100-char on-chain limit
- SPL vs Token-2022 auto-detected by reading `mint.owner`; ATA derivation uses correct program ID

### Blinks / Actions API

`/api/actions/reserve/[pubkey]` exposes each LP's buy order as a Solana Action. Shareable as:

```
https://dial.to/?action={encodeURIComponent(solana-action:{appUrl}/api/actions/reserve/{pubkey})}
```

Renders natively on X/Twitter via the Solana Blinks protocol.

### Best LP Selection (Merchant Page)

Scans all on-chain `TrustExpress` accounts and filters for:

- `escrow_type === 1` (BUY orders — LP wants to buy tokens, customer pays tokens)
- `currency` matches the selected currency
- `amount > 0` (has available liquidity)
- `reservedAmounts.length < 10` (has reservation capacity)

From matches, selects the one with the **highest `pricePerToken`** — best rate for the customer.

---

## AI Assistant

Trust Vault ships with an integrated AI assistant powered by a local LLM.

- **Engine**: QVAC (Tether's on-device AI SDK) via Ollama (`qwen2.5-coder:7b` default). No cloud routing, no API keys, fully on-device
- **API routes**: `/api/chat` (streaming LLM responses) + `/api/tts` (Chatterbox text-to-speech)
- **Wallet context injection**: Each message is augmented with the user's current balances, active orders, and recent transaction history
- **Action detection**: Protocol-level responses include structured action blocks (e.g. `REDUCE_ORDER`, `CONFIRM_PAYMENT`) that render as interactive cards in the UI — not just text
- **Mobile (planned)**: Cloud AI layer via Claude API

---

## Platform Economics

| Metric                                             | Value                                 |
| -------------------------------------------------- | ------------------------------------- |
| Nigeria on-chain volume                            | $92B (Chainalysis, Jul 2024–Jun 2025) |
| Daily stablecoin P2P volume                        | $48.2M                                |
| Stablecoin ownership rank                          | #1 globally (BVNK/YouGov 2026)        |
| Stablecoin spend intent, Nigeria                   | 96%                                   |
| Stablecoin payment intent, Africa                  | 95%                                   |
| Top frustration: fund loss / irreversible payments | 30% globally                          |
| Estimated addressable market                       | $300B+                                |

**Fee structure**: 0.5% per settled transaction, split 30% platform / 50% LPs / 20% validators.

Protocol earns on every settled transaction. LPs earn passive income for providing liquidity. Validators earn for operating consensus infrastructure. At $46M monthly GMV (Year 1 target) = $230K/month protocol revenue.

---

## Testing

### Test Coverage

**Happy Path Tests:**
✅ Initialize global state  
✅ Register validators (up to 5)  
✅ Create express buy order with valid parameters  
✅ Create express sell order with token deposit  
✅ Update price on existing order  
✅ Instant reserve from buy order (seller deposits tokens)  
✅ Validator consensus: 3-of-5 YES votes release tokens to LP  
✅ Instant sell reserve from sell order (no token movement)  
✅ Validator consensus: 3-of-5 YES votes release tokens to buyer  
✅ Express withdraw by LP with proportional fee calculation  
✅ Cancel buy order with zero amount (account closure + rent return)  
✅ Reduce buy order amount (partial)  
✅ Claim validator fees  
✅ Finalize expired vote (refund path)

**Constraint Tests:**
❌ Non-maker tries to update price (should fail)  
❌ Invalid currency code length  
❌ Exceeding 10 reservation limit per order  
❌ Withdrawal exceeding available balance  
❌ Reserve amount greater than order liquidity  
❌ Validator already voted (`AlreadyVoted` error — silent skip)  
❌ Non-registered validator attempts to vote  
❌ Remove validator while `active_vote_count > 0`  
❌ `required_votes` exceeds `validator_count`

**Edge Cases Tested:**

- Dust threshold triggers account closure on withdraw
- Fee calculation rounds correctly for small amounts
- Multiple orders per LP using different seeds
- SPL Token + Token-2022 dual compatibility
- Vote expiry → `finalize_expired_vote` → taker refund
- Validator catchup replays missed PENDING reservations on restart

### Running Tests

```bash
# Install dependencies
npm install

# Run all tests
anchor test

# Build only
anchor build

# Deploy to devnet
anchor deploy --provider.cluster devnet
```

---

## Tech Stack

| Layer                    | Technology                                                                   |
| ------------------------ | ---------------------------------------------------------------------------- |
| Smart Contract           | Rust · Anchor Framework 0.30+ · Solana                                       |
| Token Support            | SPL Token · Token-2022 (auto-detected at runtime)                            |
| Consensus                | 3-of-5 validator network · ValidatorVote PDAs · keccak_256 reference hashing |
| Frontend                 | Next.js 14 · React · TypeScript · Tailwind CSS                               |
| Wallet                   | Solana Wallet Adapter (Phantom, Backpack, etc.)                              |
| Blockchain Client        | Web3.js · Solana RPC · WebSocket                                             |
| Database                 | Supabase (Postgres + Realtime)                                               |
| Fiat Rails               | Flutterwave · Paystack · Korapay                                             |
| Validator Infrastructure | TypeScript 5.4 · Node.js ESM · Anchor client · keccak_256                    |
| Discord Bot              | Node.js · Discord.js                                                         |
| AI Assistant             | QVAC / Ollama (on-device desktop) · Claude API (mobile, planned)             |
| Solana Primitives        | Solana Pay · Blinks / Actions API · PDAs                                     |

---

## Team

**Emmanuel Otu** — Founder & Solana Developer  
[@emmanuel_o2](https://x.com/emmanuel_o2) · [github.com/o2lord](https://github.com/o2lord) · [linkedin.com/in/o2lord](https://linkedin.com/in/o2lord)

Solana smart contract developer (Rust/Anchor). School of Solana Season 8 graduate (Ackee Blockchain Security). Built Trust Vault after being personally scammed in a P2P trade following Binance's exit from Nigeria. Prior Solana projects: Trust Pay (programmable escrow), FairLoan (undercollateralized lending via on-chain reputation scores), CampusChain (academic platform on Solana). Active Superteam Nigeria member. Completing MB;BS at University of Abuja.

---

## Environment Configuration

### Client (`/client/.env.local`)

```bash
# Solana
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com
RPC_URL=https://api.devnet.solana.com

# Program
TRUST_EXPRESS_PROGRAM_ID=6Z8rRkDxtLWBEGgeccx8AWj9Um8osnLQihEA1xiECHWr
NEXT_PUBLIC_PROGRAM_ID=6Z8rRkDxtLWBEGgeccx8AWj9Um8osnLQihEA1xiECHWr

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Fiat Processors
FLUTTERWAVE_SECRET_KEY=your_flutterwave_secret_key
FLUTTERWAVE_PUBLIC_KEY=your_flutterwave_public_key
FLUTTERWAVE_ENCRYPTION_KEY=your_32_byte_hex_key        # openssl rand -hex 32
PAYSTACK_SECRET_KEY=your_paystack_secret_key
KORAPAY_SECRET_KEY=your_korapay_secret_key

# Bot Wallet (API routes that sign transactions server-side)
BOT_WALLET_PRIVATE_KEY=your_bot_wallet_base58_private_key

# Tokens
NEXT_PUBLIC_USDC_MINT=usdkTpkj3mKoK8D3QZjeFt728ZY9wZjSHVKoDfJcjTp
NEXT_PUBLIC_ALLOWED_MINTS=mint1,mint2

# App
NEXT_PUBLIC_APP_URL=https://your-app-url.com
NEXT_PUBLIC_DISCORD_SERVER_INVITE_LINK=https://discord.gg/your-invite

# AI (local on-device assistant)
OLLAMA_URL=http://localhost:11434/api/chat          # Change to 127.0.0.1 on VPS
OLLAMA_MODEL=qwen2.5-coder:7b
```

### Discord Bot (`/discord-bot/.env.local`)

```bash
# Discord
DISCORD_BOT_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_CLIENT_SECRET=your_discord_client_secret
DISCORD_REDIRECT_URI=http://localhost:3000/api/auth/callback/discord
NEXTAUTH_URL=http://localhost:3000
NEXT_PUBLIC_DISCORD_SERVER_INVITE_LINK=https://discord.gg/your-invite

# Solana
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_RPC_URL=https://api.devnet.solana.com

# Program
TRUST_EXPRESS_PROGRAM_ID=6Z8rRkDxtLWBEGgeccx8AWj9Um8osnLQihEA1xiECHWr
NEXT_PUBLIC_PROGRAM_ID=6Z8rRkDxtLWBEGgeccx8AWj9Um8osnLQihEA1xiECHWr

# Bot wallet (signs on-chain transactions)
BOT_WALLET_PRIVATE_KEY=your_bot_wallet_base58_private_key

# Fiat processor (platform fallback key)
FLUTTERWAVE_PUBLIC_KEY=your_flutterwave_public_key
FLUTTERWAVE_SECRET_KEY=your_flutterwave_secret_key
FLUTTERWAVE_ENCRYPTION_KEY=your_32_byte_hex_key

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key    # Never expose to client

# App
NEXT_PUBLIC_APP_URL=https://your-app-url.com
```

### Validator Bot (`/validator-bot/.env`)

```bash
# Shared
PLATFORM_API_URL=https://your-app-url.com           # Running client/Next.js app URL
SOLANA_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
PROGRAM_ID=6Z8rRkDxtLWBEGgeccx8AWj9Um8osnLQihEA1xiECHWr
TRUST_EXPRESS_PROGRAM_ID=6Z8rRkDxtLWBEGgeccx8AWj9Um8osnLQihEA1xiECHWr
NEXT_PUBLIC_PROGRAM_ID=6Z8rRkDxtLWBEGgeccx8AWj9Um8osnLQihEA1xiECHWr

# Validator 1
VALIDATOR_PRIVATE_KEY1=base58_keypair_for_validator_1
VALIDATOR_API_KEY1=vk_your_key_1_min_32_chars        # Must start with "vk_"
VALIDATOR_PUBLIC_KEY1=pubkey_for_validator_1

# Validator 2
VALIDATOR_PRIVATE_KEY2=base58_keypair_for_validator_2
VALIDATOR_API_KEY2=vk_your_key_2_min_32_chars
VALIDATOR_PUBLIC_KEY2=pubkey_for_validator_2

# Validator 3
VALIDATOR_PRIVATE_KEY3=base58_keypair_for_validator_3
VALIDATOR_API_KEY3=vk_your_key_3_min_32_chars
VALIDATOR_PUBLIC_KEY3=pubkey_for_validator_3

# Validator 4
VALIDATOR_PRIVATE_KEY4=base58_keypair_for_validator_4
VALIDATOR_API_KEY4=vk_your_key_4_min_32_chars
VALIDATOR_PUBLIC_KEY4=pubkey_for_validator_4

# Validator 5
VALIDATOR_PRIVATE_KEY5=base58_keypair_for_validator_5
VALIDATOR_API_KEY5=vk_your_key_5_min_32_chars
VALIDATOR_PUBLIC_KEY5=pubkey_for_validator_5

# Optional
FLW_TEST_MODE=true    # Adds 20 s settle delay for Flutterwave test environment
```

**Key variables explained:**

`VALIDATOR_API_KEY[N]` — Must start with `vk_`, minimum 32 chars. SHA-256 hashed and stored in Supabase `validators` table. All validator API calls authenticate via this key.

`PLATFORM_API_URL` — The running Next.js app URL. Validators call: `elect-executor`, `initiate-buy-payout`, `payout-status`, `verify-transfer`, `verify-payment`, `heartbeat`, `generate-*-receipt`.

`FLUTTERWAVE_ENCRYPTION_KEY` — 32-byte hex key for AES-256-GCM. Encrypts all LP credentials (Flutterwave, Paystack, and Korapay all share this key). Generate: `openssl rand -hex 32`. Rotation requires re-encrypting all credential rows.

`FLW_TEST_MODE=true` — Inserts a 20 s delay before buy payout initiation to allow Flutterwave test transfers to settle before polling begins.

### Security Notes

1. **Never commit `.env` files** to version control
2. **Separate keypairs per validator** — compromise of one node cannot reach the 3-of-5 threshold alone
3. **`SUPABASE_SERVICE_ROLE_KEY` is admin-level** — server-side only; never expose to client or validator bots
4. **`BOT_WALLET_PRIVATE_KEY`** must hold SOL for transaction fees; fund before deploying
5. **`FLUTTERWAVE_ENCRYPTION_KEY` rotation** requires re-encrypting all stored LP credentials before the old key is removed
6. **Validator API keys** validated on startup by `run-all.ts` — must start with `vk_` and be ≥ 32 chars
7. **Use separate keys for devnet and mainnet** — never reuse test credentials in production

---

## Running Locally

### Anchor Program (Smart Contract)

```bash
cd anchor
npm install
anchor build
anchor deploy --provider.cluster devnet
anchor test
```

### Client (Next.js App)

```bash
cd client
npm install
cp .env.example .env.local
# Fill in required variables (Supabase, processor keys, program ID, bot wallet)
npm run dev
```

### Discord Bot

```bash
cd discord-bot
npm install
cp .env.example .env.local
# Fill in required variables
npx ts-node bot.ts
```

### Validator Bot (all 5 validators, one process)

```bash
cd validator-bot
npm install
cp .env.example .env
# Fill in VALIDATOR_PRIVATE_KEY1-5 and VALIDATOR_API_KEY1-5
# All 5 must be registered on-chain in GlobalState.validators[] first
npx ts-node run-all.ts
```

All 5 validators start concurrently via `Promise.allSettled()`. Each registers its own heartbeat independently and subscribes to its own on-chain log stream.

---

**Program ID:** `6Z8rRkDxtLWBEGgeccx8AWj9Um8osnLQihEA1xiECHWr`  
**Built with:** Rust · Anchor 0.30+ · Solana · Next.js 14 · TypeScript · Supabase  
**Fiat Rails:** Flutterwave · Paystack · Korapay  
**Consensus:** 5 independent validator nodes · 3-of-5 threshold · keccak_256 vote hashing

## License

MIT
