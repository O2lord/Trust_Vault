# Solstice YieldVault Integration — Testing Checklist

## Prerequisites

Before running any test, make sure all of these are true.

### Environment

```env
# .env.local
TRUST_EXPRESS_PROGRAM_ID=6gHrdm5AtG8TFvMknv5ZBEt1CHpKwBEToVbEaGBL8r7M
RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com

SOLSTICE_API_KEY=<sandbox key from partners@solstice.finance>
# SOLSTICE_ENV omitted → defaults to sandbox/devnet
SOLSTICE_DEVNET_USDC_MINT=<mint address Solstice gives you>

NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_APP_URL=https://<your-ngrok-or-tunnel>.ngrok.io
```

### Wallets needed

| Role         | Wallet                  | Needs                                             |
| ------------ | ----------------------- | ------------------------------------------------- |
| **Merchant** | Connected to the app    | SOL for fees + Solstice devnet USDC (to fund LP)  |
| **Customer** | Second wallet on mobile | SOL for fees + Solstice devnet USDC (to pay with) |

Both wallets must be switched to **Solana devnet** in their settings.

### LP Escrow

Create a buy-order escrow funded with **Solstice's devnet USDC mint** — NOT standard Circle devnet USDC. The split transfer sends tokens using whatever mint the escrow holds. If the mints don't match, the customer's transfer will fail on-chain.

```bash
# Verify your escrow's mint matches SOLSTICE_DEVNET_USDC_MINT
solana account <YOUR_TRUST_EXPRESS_ADDRESS> --output json | grep -A2 '"mint"'
```

---

## Phase 1 — Server sanity checks (no wallet needed)

### 1.1 Yield info endpoint

```bash
curl https://yourapp.ngrok.io/api/solstice/yield-vault
```

**Expected:**

```json
{
  "totalAssets": "...",
  "totalShares": "...",
  "eusxPriceInUsx": "1.024...",
  "apy": "0.1396"
}
```

| Response               | Meaning                                      |
| ---------------------- | -------------------------------------------- |
| 200 with data          | API key valid, sandbox reachable             |
| 401                    | Wrong or expired API key                     |
| 503                    | `SOLSTICE_API_KEY` env var not set           |
| `eusxPriceInUsx` < 1.0 | Unexpected — vault should have been accruing |

---

### 1.2 Instruction builder

```bash
curl -X POST https://yourapp.ngrok.io/api/solstice/yield-vault \
  -H "Content-Type: application/json" \
  -d '{"walletAddress":"<MERCHANT_PUBKEY>","usdcAmount":"5000000","collateral":"usdc"}'
```

**Expected:** Array of 3 objects with `step`, `instruction` (base64), `accounts`, `programId`.

| Response                  | Meaning                                           |
| ------------------------- | ------------------------------------------------- |
| 3-item array              | Working correctly                                 |
| `"collateral mint"` error | Wrong devnet USDC mint in env                     |
| `"not whitelisted"`       | Merchant wallet not permissioned — email Solstice |
| `"request_mint failed"`   | Solstice sandbox may be down                      |

Verify `programId` values:

- `request_mint` + `confirm_mint` → `USXyiSTsPEWz55pSK7sZoUL79ntoVGQbaTDT57tH6bx`
- `lock` → `eUSXyKoZ6aGejYVbnp3wtWQ1E8zuokLAJPecPxxtgG3`

---

## Phase 2 — Baseline payment (yield toggle OFF)

Test the existing flow still works before touching yield.

### 2.1 Generate a standard QR

1. Connect merchant wallet, select bank account
2. Enter ₦10,000
3. Yield toggle **OFF**
4. Click Generate QR

**Server log to confirm:**

```
[instant-reserve] fiatAmountRaw=10000 pricePerToken=... decimals=6 tokenAmountRaw=...
[instant-reserve] Simulation OK — yield split: false (0%)
```

### 2.2 Customer pays

Scan QR with second wallet, approve.

**Confirm:**

- Customer USDC debited
- Success overlay appears on merchant page
- Receipt row in Supabase `receipts` table
- Fiat payout fires for full ₦10,000

Baseline confirmed. Move to Phase 3.

---

## Phase 3 — Payment WITH yield split

### 3.1 Generate a QR with yield split

1. Enter ₦10,000
2. Toggle yield **ON**, drag slider to **30%**
3. Click Generate QR

**Check the Solana Pay URL** in Network tab before encoding — it should contain:

```
&yieldPercent=30&merchantWallet=<MERCHANT_PUBKEY>
```

**Server log to confirm:**

```
[instant-reserve] totalFiatAmountRaw=10000 pricePerToken=X decimals=6
  totalTokenAmountRaw=A yieldPercent=30 yieldTokenAmountRaw=B
  escrowTokenAmountRaw=C fiatAmountRaw=D (frontend hint was ...)
[instant-reserve] Yield split: B raw tokens → merchant ATA <ADDRESS> (30% of total). Escrow gets C raw tokens.
[instant-reserve] Simulation OK — yield split: true (30%)
```

**Manually verify the arithmetic:**

- `A` = `ceil(10000 * 10^6 / pricePerToken)`
- `B` = `floor(A * 30 / 100)`
- `C` = `A - B`
- `B + C` must equal `A` exactly — no tokens lost in rounding

### 3.2 Customer scans and pays (one transaction, three instructions)

Customer approves one wallet prompt. Find the transaction signature on Solscan (devnet).

**Instruction 1 — createAssociatedTokenAccount (idempotent)**

- Creates merchant's ATA if it doesn't exist
- No-op if already exists
- Fee payer = customer

**Instruction 2 — transfer**

- From: customer ATA
- To: merchant ATA
- Amount: `yieldTokenAmountRaw` (30% of tokens)

**Instruction 3 — instant_reserve**

- Program: Trust Express
- Tokens into escrow: `escrowTokenAmountRaw` (70% of tokens)

**Token balance changes to verify on Solscan:**

```
Customer ATA:  -A  (full debit)
Merchant ATA:  +B  (30% received)
Escrow ATA:    +C  (70% received)
```

**In Supabase:** Receipt `fiat_amount` should be ~₦7,000 (70% of ₦10,000), because the LP only received 70% of the tokens.

---

## Phase 4 — Yield dashboard and 3-step Solstice flow

### 4.1 Dashboard opens immediately after payment

As soon as `trust-express:receipt-detected` fires, the dashboard modal appears.

**Check:**

- Header subtitle: "Preparing your vault deposit…"
- Blue info box visible: "Locking into YieldVault requires 3 wallet approvals. They appear one after another — approve each one to complete your deposit."
- All three step rows visible but dimmed
- APY stat shows live value (from Phase 1.1 response)

---

### 4.2 Step 1/3 — Request mint

Wallet popup appears.

**Dashboard:**

- Header: "Step 1 of 3 — approve in your wallet"
- Row 1/3 highlighted purple, "Approve now" tag
- Detail text: "Tells Solstice's on-chain program you want to mint USX from your USDC. The oracle will verify your collateral."
- Rows 2/3 and 3/3 dimmed at ~40% opacity

Merchant approves.

**Dashboard during confirmation:**

- Header: "Step 1 of 3 — confirming…"
- Row 1/3 shows spinner

After Solana confirms:

- Row 1/3 → green checkmark, "Done"
- Row 2/3 lights up, "Approve now"

**On Solscan:** Transaction calls USX Program `request_mint`. Merchant wallet's USDC approved for collateral deposit.

---

### 4.3 Step 2/3 — Confirm mint

Second wallet popup.

**Dashboard:**

- Header: "Step 2 of 3 — approve in your wallet"
- Detail: "Completes the USX mint. Oracle has validated your USDC and USX is now ready to lock."

Merchant approves. Wait for confirmation.

**After confirmation:**

- Rows 1/3 and 2/3 both green
- Row 3/3 lights up

**On Solscan:** Transaction calls USX Program `confirm_mint`. Check merchant's token accounts — they should now hold USX (`6FrrzDk5mQARGc1TDYoyVnSyRdds1t4PbtohCD6p3tgG` is the USX mint on mainnet; sandbox has its own equivalent).

---

### 4.4 Step 3/3 — Lock into vault

Third wallet popup.

**Dashboard:**

- Header: "Step 3 of 3 — approve in your wallet"
- Detail: "Deposits your USX into Solstice's YieldVault. You receive eUSX — a yield-bearing receipt token."

Merchant approves. Wait for confirmation.

**Dashboard after completion:**

- Header switches to: "Your funds are earning while you sleep"
- Step tracker disappears
- eUSX balance card appears with 6 decimal precision
- Accrual ticker starts incrementing
- Solscan link appears → click it to verify

**On Solscan:** Transaction calls YieldVault Program `lock`. Verify:

- Merchant USX balance: decreased by yield amount
- Merchant eUSX balance (`3ThdFZQKM6kRyVGLG48kaPg5TRMhYMKY1iCRa9xop1WC` on mainnet): increased
- eUSX received = `yieldUsdcAmount / eusxPriceInUsx` (slightly less USDC equivalent because eUSX price > 1.0)

---

## Phase 5 — Edge cases

### 5.1 Merchant rejects a wallet prompt

Click "Reject" on any of the three wallet popups.

**Expected:**

- Dashboard shows error state (red border)
- Message: "Transaction failed" with the rejection error
- Note: "Your USDC split landed in your wallet but was not deposited into YieldVault. No funds were lost — you can try again from Solstice's app directly."
- "New Payment" button resets everything cleanly
- Yield USDC stays in merchant's ATA — not lost, just not yet in vault

### 5.2 Yield split at maximum (90%)

Drag slider to 90% before generating QR.

**Verify:**

- LP receives only 10% of tokens
- Merchant ATA receives 90% of tokens
- Fiat payout ≈ ₦1,000 (10% of ₦10,000)
- Vault flow runs for the 90% amount

### 5.3 No API key leak in browser

Open DevTools → Network tab → filter by "solstice".

**You should see:**

- Requests to `/api/solstice/yield-vault` (your server)

**You should never see:**

- Requests to `api.sandbox.solsticelabs.io` from the browser
- `Authorization: Bearer` headers in browser network requests

---

## Quick log reference

| Log line                                   | What it means                                            |
| ------------------------------------------ | -------------------------------------------------------- |
| `Simulation OK — yield split: false (0%)`  | Baseline payment working, yield disabled                 |
| `Simulation OK — yield split: true (30%)`  | Split tx built correctly                                 |
| `Yield split: B raw tokens → merchant ATA` | Transfer instruction added                               |
| `Simulation failed: {...}`                 | On-chain error — read the error object carefully         |
| `confirming_mint_request`                  | Step 1 submitted to chain                                |
| `confirming_mint_confirm`                  | Step 2 submitted                                         |
| `confirming_lock`                          | Step 3 submitted — vault deposit in flight               |
| `request_mint failed: ...`                 | Solstice rejected — usually wrong collateral mint        |
| `lock failed: ...`                         | Lock rejected — USX from step 2 may not be confirmed yet |
| `Missing step: confirm_mint`               | API route returned incomplete steps array                |

---

## Devnet faucets

```bash
# SOL
solana airdrop 2 <WALLET_ADDRESS> --url devnet

# Solstice devnet USDC — ask partners@solstice.finance
# They control this mint and need to airdrop it to both wallets

# Standard Circle devnet USDC (NOT for Solstice minting, only for baseline tests)
# https://faucet.circle.com
```
