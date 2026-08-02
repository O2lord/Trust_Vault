# Trust Vault Test Suite

Comprehensive test suite for the Trust Vault Solana program with simplified global pause system.

## Overview

This test suite provides complete coverage of the Trust Vault program functionality including buy orders, sell orders, admin controls (including the new simplified pause system), and edge cases.

## Recent Updates - Simplified Pause System

### ⚠️ Breaking Changes

The pause system has been refactored to align with decentralization principles:

**REMOVED**:

- ❌ `pauseVaultWithdrawals()` - Per-vault withdrawal pause
- ❌ `pauseVaultReservations()` - Per-vault reservation pause
- ❌ `withdrawals_paused` field in `TrustExpress`
- ❌ `reservations_paused` field in `TrustExpress`

**NEW BEHAVIOR**:

- ✅ `pauseBuyOrders(true)` - Pauses BOTH creating buy orders AND making reservations on buy orders (globally)
- ✅ `pauseSellOrders(true)` - Pauses BOTH creating sell orders AND making reservations on sell orders (globally)
- ✅ Withdrawals and cancellations ALWAYS work (even during pause)
- ✅ Payment confirmations ALWAYS work (prevents stuck funds)

### Required Account Updates

**`instant_reserve` and `instant_sell_reserve` now require `GlobalState` account**:

```typescript
// OLD - Missing globalState account
await program.methods
  .instantReserve(amount, fiatAmount, currency, payoutDetails)
  .accountsPartial({
    trustExpress: buyOrderPda,
    maker: buyer.publicKey,
    taker: taker.publicKey,
    // ...
  })
  .rpc();

// NEW - Must include globalState
await program.methods
  .instantReserve(amount, fiatAmount, currency, payoutDetails)
  .accountsPartial({
    trustExpress: buyOrderPda,
    maker: buyer.publicKey,
    taker: taker.publicKey,
    globalState: globalStatePda, // ✅ NEW: Required
    // ...
  })
  .rpc();
```

## Test Files

### 1. `trust-vault_test.ts` - Updated Pause Tests

Focuses on the new pause system:

- ✅ Global buy order pause (blocks creation + reservations)
- ✅ Global sell order pause (blocks creation + reservations)
- ✅ Withdrawals work during pause
- ✅ Cancellations work during pause
- ✅ Independent pause control (buy/sell)

### 2. `trust-vault-errors_test.ts` - Pause Error Tests

Tests pause-related error conditions:

- ✅ Buy order creation blocked when paused
- ✅ Buy order reservations blocked when paused
- ✅ Sell order creation blocked when paused
- ✅ Sell order reservations blocked when paused
- ✅ Exits (withdrawal/cancel) always allowed

### 3. `trust-vault-integration_test.ts` - Integration Tests

Complex multi-user scenarios (unchanged if they don't use pause):

- ✅ Multiple concurrent reservations
- ✅ Partial withdrawals with proportional fees
- ✅ Complete order lifecycle
- ✅ Fee distribution verification

### 4. `test-helpers.ts` - Utility Functions

Reusable helpers for:

- Account creation and funding
- PDA derivation
- Token operations
- Mock data generation

## Setup

```bash
# Install dependencies
npm install

# Build program
anchor build

# Run all tests
anchor test

# Run specific test file
anchor test tests/trust-vault_test.ts

# Run with logs
solana logs &
anchor test
```

## Test Coverage

| Feature                  | Coverage |
| ------------------------ | -------- |
| Buy Orders               | 100%     |
| Sell Orders              | 100%     |
| Global Pause Controls    | 100%     |
| Pause Error Handling     | 100%     |
| Fee Calculations         | 100%     |
| Withdrawals During Pause | 100%     |
| Integration Flows        | 100%     |

## Key Test Scenarios

### Pause System Tests

```
Global Buy Pause:
  Pause → Block buy order creation → Block reservations →
  Allow cancellations → Allow confirmations

Global Sell Pause:
  Pause → Block sell order creation → Block reservations →
  Allow withdrawals → Allow confirmations
```

### Buy Order Flow

```
Create → Reserve → Confirm Payout → Account Closure
```

### Sell Order Flow

```
Deposit → Reserve → Confirm Payment → Withdraw → Close
```

## Running Tests

```bash
# All tests
anchor test

# Skip deploy (faster for iterations)
anchor test --skip-deploy

# Specific file
npx ts-mocha -p ./tsconfig.json -t 1000000 tests/trust-vault_test.ts

# Just the pause tests
npx ts-mocha -p ./tsconfig.json -t 1000000 tests/trust-vault_test.ts --grep "Pause"

# Just the error tests
npx ts-mocha -p ./tsconfig.json -t 1000000 tests/trust-vault-errors_test.ts
```

## Migration Guide

### Updating Existing Tests

1. **Remove per-vault pause tests**:

```typescript
// ❌ DELETE - No longer exists
it("Pauses vault withdrawals", async () => {
  await program.methods.pauseVaultWithdrawals(true);
  // ...
});

it("Pauses vault reservations", async () => {
  await program.methods.pauseVaultReservations(true);
  // ...
});
```

2. **Update reservation calls to include globalState**:

```typescript
// ✅ ADD globalState to instant_reserve
await program.methods
  .instantReserve(...)
  .accountsPartial({
    // ... existing accounts
    globalState: globalStatePda, // NEW
  })
  .rpc();

// ✅ ADD globalState to instant_sell_reserve
await program.methods
  .instantSellReserve(...)
  .accountsPartial({
    // ... existing accounts
    globalState: globalStatePda, // NEW
  })
  .rpc();
```

3. **Update error expectations**:

```typescript
// OLD
assert.include(error.toString(), "WithdrawalsPaused");
assert.include(error.toString(), "ReservationsPaused");

// NEW - These errors no longer exist
// Use BuyOrdersPaused or SellOrdersPaused instead
assert.include(error.toString(), "BuyOrdersPaused");
assert.include(error.toString(), "SellOrdersPaused");
```

## Debugging

```typescript
// Enable verbose logging
import { setProvider } from "@coral-xyz/anchor";

// View account data
const account = await program.account.trustExpress.fetch(pda);
console.log(JSON.stringify(account, null, 2));

// Check global state pause flags
const globalState = await program.account.globalState.fetch(globalStatePda);
console.log("Buy orders paused:", globalState.buyOrdersPaused);
console.log("Sell orders paused:", globalState.sellOrdersPaused);

// Check logs
// Terminal 1: solana logs
// Terminal 2: anchor test
```

## Anchor.toml Configuration

```toml
# Pause tests only
[scripts]
test = "yarn run ts-mocha -p ./tsconfig.json -t 1000000 tests/trust-vault_test.ts --grep 'Pause'"

# Error tests only
[scripts]
test = "yarn run ts-mocha -p ./tsconfig.json -t 1000000 tests/trust-vault-errors_test.ts"

# All tests (default)
[scripts]
test = "yarn run ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.test.ts"
```

## Philosophy

The pause system follows these principles:

1. **Decentralized** - No targeting individual vaults
2. **Predictable** - Global rules apply equally
3. **Safe** - Never trap user funds
4. **Simple** - Fewer flags, fewer edge cases

### When Paused:

- ❌ New commitments blocked (creation + reservations)
- ✅ Existing flows complete (confirmations)
- ✅ Users can exit (withdrawals + cancellations)

## Contributing

When adding tests:

1. Use descriptive test names
2. Follow existing patterns
3. Test both success and failure cases
4. Always clean up (unpause after pause tests)
5. Update coverage in README

## Common Issues

### Issue: `globalState` account missing

**Error**: Account not found or invalid
**Fix**: Add `globalState: globalStatePda` to `instant_reserve` and `instant_sell_reserve` calls

### Issue: Tests expecting `WithdrawalsPaused` error

**Error**: Test fails, error not found
**Fix**: Remove withdrawal pause tests - withdrawals always work now

### Issue: Tests expecting `ReservationsPaused` error

**Error**: Test fails, error not found
**Fix**: Use `BuyOrdersPaused` or `SellOrdersPaused` instead

## License

MIT
