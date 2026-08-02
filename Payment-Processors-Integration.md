# Payment Processor Integration — Master Checklist

Every file that must be created or modified when adding a new payment processor
to TrustExpress. Built from the OPay integration (first processor added alongside
Flutterwave). Use this as the exact blueprint for Paystack, Monnify, or any future processor.

Replace `{processor}` with the new processor name (e.g. `paystack`, `monnify`).

---

## 1. Database Migration

| File                                                            | Type          | Notes                                                                                                                                                                                                                             |
| --------------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase/migrations/{timestamp}_add_{processor}_processor.sql` | **NEW**       | Additive only — never drop or rename existing columns. Adds `processor` column with CHECK constraint, `encrypted_public_key` + IV + auth tag columns, `processor_account_id` column, indexes. Run verification SELECT at the end. |
| `opay_webhook_events` (or `{processor}_webhook_events`)         | **NEW TABLE** | If processor uses inbound webhooks (sell order payment confirmation). Columns: `id`, `reference`, `order_no`, `status`, `amount`, `currency`, `raw_payload jsonb`, `received_at`.                                                 |

---

## 2. Core Service Layer (Bot + API shared)

| File                                             | Type    | Notes                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------ | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `discord-bot/lib/{processor}Service.ts`          | **NEW** | Mirrors `flutterwaveService.ts` interface. Must implement: `validateCredentials()`, `createPaymentLink()`, `verifyInboundPayment()`, `initiateTransfer()`, `getTransferStatus()`. Handles all auth (HMAC, Bearer, etc.) internally. Amount unit conversion (e.g. kobo) handled here — callers always pass human-readable NGN.                        |
| `discord-bot/lib/{processor}-credentials-bot.ts` | **NEW** | Mirrors `flutterwave-credentials-bot.ts`. Exports `getProcessorCredentialsForBuyOrder()` and `getProcessorCredentialsForSellOrder()`. Reads from same `buyer_flutterwave_credentials` / `seller_flutterwave_accounts` tables filtered by `processor = '{processor}'`. Decrypts all keys (public + secret) using shared `FLUTTERWAVE_ENCRYPTION_KEY`. |

---

## 3. API Routes — Credential Management (New processor routes)

All new processors live under `app/api/payment-processors/{processor}/`.
Flutterwave is a legacy exception at `app/api/flutterwave/` — it will be migrated later but all new processors use the `payment-processors/` namespace.

### Seller credentials

| File                                                                        | Type    | Notes                                                                                                                                                                                                               |
| --------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/api/payment-processors/{processor}/seller-credentials/store/route.ts`  | **NEW** | Validates credentials against processor API, encrypts both keys (+ any extra fields like `merchantId`), writes to `seller_flutterwave_accounts` with `processor = '{processor}'`. Requires Solana wallet signature. |
| `app/api/payment-processors/{processor}/seller-credentials/list/route.ts`   | **NEW** | Reads `seller_flutterwave_accounts` filtered by `wallet_address` AND `processor = '{processor}'`. Returns safe fields only (no encrypted keys).                                                                     |
| `app/api/payment-processors/{processor}/seller-credentials/link/route.ts`   | **NEW** | Upserts into `sell_order_credentials` (same table — processor-agnostic). Verifies credential belongs to wallet and is active.                                                                                       |
| `app/api/payment-processors/{processor}/seller-credentials/toggle/route.ts` | **NEW** | Flips `is_active` on a seller credential. Requires wallet signature.                                                                                                                                                |
| `app/api/payment-processors/{processor}/seller-credentials/delete/route.ts` | **NEW** | Deletes a seller credential. Should block if credential is linked to active sell orders.                                                                                                                            |
| `app/api/payment-processors/{processor}/seller-credentials/status/route.ts` | **NEW** | Re-validates credential live against processor API. Returns current balance if available. Gate behind `{PROCESSOR}_ENV === 'production'` if sandbox doesn't support balance queries.                                |

### Buyer credentials

| File                                                                       | Type    | Notes                                                                                                      |
| -------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------- |
| `app/api/payment-processors/{processor}/buyer-credentials/store/route.ts`  | **NEW** | Same as seller store but writes to `buyer_flutterwave_credentials`.                                        |
| `app/api/payment-processors/{processor}/buyer-credentials/list/route.ts`   | **NEW** | Reads `buyer_flutterwave_credentials` filtered by `processor = '{processor}'`.                             |
| `app/api/payment-processors/{processor}/buyer-credentials/link/route.ts`   | **NEW** | Upserts into `buy_order_credentials`. Requires wallet signature (buyer link is stricter than seller link). |
| `app/api/payment-processors/{processor}/buyer-credentials/toggle/route.ts` | **NEW** | Flips `is_active` on a buyer credential.                                                                   |
| `app/api/payment-processors/{processor}/buyer-credentials/delete/route.ts` | **NEW** | Deletes a buyer credential.                                                                                |
| `app/api/payment-processors/{processor}/buyer-credentials/status/route.ts` | **NEW** | Re-validates + balance check.                                                                              |

### Webhook (sell order inbound payment)

| File                                                      | Type    | Notes                                                                                                                                                                                                                                            |
| --------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `app/api/payment-processors/{processor}/webhook/route.ts` | **NEW** | Receives processor payment success callbacks. Verify HMAC/signature of incoming payload using processor's webhook secret. Update `payment_links` to `completed`. Store raw event in `{processor}_webhook_events`. Validators pick up from there. |

---

## 4. API Routes — Validator Verification (Modify existing)

These 3 files each get a **3-line if/else processor dispatch** added. All existing Flutterwave logic stays byte-for-byte identical.

| File                                   | Type       | Change                                                                                                                                                                                                                            |
| -------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/api/verify-payment/route.ts`      | **MODIFY** | `getCredentialsForSellOrder()` already returns `{ secretKey, processor }`. Add `else if (processor === '{processor}')` branch calling `{Processor}Service.verifyInboundPayment()`.                                                |
| `app/api/verify-transfer/route.ts`     | **MODIFY** | `getLpCredentials()` already returns `{ secretKey, processor }`. Add `else if` branch calling `{Processor}Service.getTransferStatus()`.                                                                                           |
| `app/api/initiate-buy-payout/route.ts` | **MODIFY** | `getLpCredentials()` already returns `{ processor, secretKey?, {processor}Credentials? }`. Add `else if` branch calling `{Processor}Service.initiateTransfer()`. `transferReference` variable collects result from either branch. |

---

## 5. API Routes — Flutterwave List Filter (One-time fix, already done for OPay)

| File                                                   | Type       | Change                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/api/flutterwave/seller-credentials/list/route.ts` | **MODIFY** | Add `.or('processor.is.null,processor.eq.flutterwave')` to the Supabase query. Without this, new processor rows stored in `seller_flutterwave_accounts` leak into the Flutterwave list and cause React key collisions in the dialog dropdown. **Already fixed during OPay — no action needed for future processors.** |
| `app/api/flutterwave/buyer-credentials/list/route.ts`  | **MODIFY** | Same fix. **Apply if not already done.**                                                                                                                                                                                                                                                                              |

> **Note on Flutterwave migration**: Flutterwave routes currently live at `app/api/flutterwave/` (legacy). When migrated they will move to `app/api/payment-processors/flutterwave/`. At that point, update the two Flutterwave `fetch` URLs in both hooks from `/api/flutterwave/*` to `/api/payment-processors/flutterwave/*`. No other changes needed.

---

## 6. Discord Bot (Modify existing)

| File                                             | Type       | Change                                                                                                                                                                                                                                                              |
| ------------------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `discord-bot/bot.ts`                             | **MODIFY** | `generatePaymentLink()` — after fetching `credential_id`, query `processor` from `seller_flutterwave_accounts`. Add `else if (processor === '{processor}')` branch routing to `{Processor}Service.createPaymentLink()`. Store returned link URL in `payment_links`. |
| `discord-bot/lib/flutterwave-credentials-bot.ts` | **MODIFY** | Bug fix (already done for OPay): `getCredentialsForSellOrder()` used wrong column `.eq('trust_express_address', ...)` — correct to `.eq('trust_express_pda', ...)`. **Already fixed — no action needed.**                                                           |

---

## 7. Hooks (Modify existing)

Both hooks already have the multi-processor architecture from the OPay integration. For each new processor, add one more `fetch` to the `Promise.allSettled` array and one more `else if` in `linkToBuyOrder`/`linkToSellOrder`.

| File                                       | Type       | Change                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `hooks/useBuyerFlutterwaveCredentials.ts`  | **MODIFY** | In `fetchCredentials`: add `fetch('/api/payment-processors/{processor}/buyer-credentials/list?...')` to the `Promise.allSettled` array. In `linkToBuyOrder`: add `else if (credential?.processor === '{processor}')` routing to `/api/payment-processors/{processor}/buyer-credentials/link`. Add `processor` field to interface. Note: Flutterwave stays at `/api/flutterwave/buyer-credentials/*` (legacy path). |
| `hooks/useSellerFlutterwaveCredentials.ts` | **MODIFY** | Same pattern as buyer hook. Flutterwave stays at `/api/flutterwave/seller-credentials/*` (legacy path). New processors use `/api/payment-processors/{processor}/seller-credentials/*`.                                                                                                                                                                                                                             |

---

## 8. UI Components (New per processor)

| File                                                | Type    | Notes                                                                                                                                                                                                                                                                                     |
| --------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `components/{Processor}SellerCredentialManager.tsx` | **NEW** | Mirrors `SellerFlutterwaveCredentialManager.tsx`. Different field labels (e.g. OPay needs Public Key + Secret Key + Merchant ID vs Flutterwave's single Secret Key). Calls `/api/payment-processors/{processor}/seller-credentials/*` endpoints. Same card/badge/active state UI pattern. |
| `components/{Processor}BuyerCredentialManager.tsx`  | **NEW** | Mirrors `BuyerFlutterwaveCredentialManager.tsx`. Same structure as seller manager.                                                                                                                                                                                                        |

---

## 9. LP Settings Page (Modify existing)

| File                                      | Type       | Change                                                                                                                                                                                                                                                                |
| ----------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/express/providers/settings/page.tsx` | **MODIFY** | Add two `dynamic()` imports for `{Processor}SellerCredentialManager` and `{Processor}BuyerCredentialManager`. In the Seller tab content, add a new white card below the existing Flutterwave card rendering `{Processor}SellerCredentialManager`. Same for Buyer tab. |

---

## 10. Payment Success Page (Modify existing)

| File                                             | Type       | Change                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------ | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/payment-success/[payoutReference]/page.tsx` | **MODIFY** | Add processor detection from URL params. Each processor redirects back with different query params (e.g. OPay uses `?status=SUCCESS&orderNo=xxx`, Flutterwave uses `?tx_ref=xxx&status=successful`). Add `else if` branch that reads the new processor's params and sets page state accordingly. Debug panel should show detected processor. |

---

## 11. Rust Program (No changes needed)

The on-chain Anchor program stores `flutterwave_credential_id` as a plain string — it's treated as an opaque identifier regardless of which processor it refers to. **No changes to the Rust program are needed for new processors.**

The `create_buy_order.rs` and `create_sell_order.rs` instructions accept any string for `flutterwave_credential_id` — the field name is a legacy label that doesn't affect on-chain logic.

---

## Quick-reference: File count per processor addition

| Category              | New files | Modified files |
| --------------------- | --------- | -------------- |
| DB migration          | 1–2       | 0              |
| Core service layer    | 2         | 0              |
| Credential API routes | 12        | 0              |
| Webhook route         | 1         | 0              |
| Validator routes      | 0         | 3              |
| Discord bot           | 0         | 1              |
| Hooks                 | 0         | 2              |
| UI components         | 2         | 0              |
| Settings page         | 0         | 1              |
| Payment success page  | 0         | 1              |
| **Total**             | **17–18** | **8**          |

---

## Notes on shared infrastructure (never changes per processor)

- `buy_order_credentials` and `sell_order_credentials` link tables — processor-agnostic, no changes ever needed
- `opayService.ts` / `flutterwaveService.ts` — each processor gets its own isolated service file, no shared base class needed
- Validator bot (`val_bot.ts`, `buyOrderHandler.ts`) — zero changes, validators call platform API endpoints which handle dispatch internally
- Encryption key — all processors share `FLUTTERWAVE_ENCRYPTION_KEY` (intentionally, one key to manage). Rename the env var to `PAYMENT_ENCRYPTION_KEY` at your convenience.
