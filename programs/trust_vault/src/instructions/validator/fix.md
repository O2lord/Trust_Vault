# Fix Log: Lifetime Invariance on `AccountInfo<'_>` in `credit_validator_earnings`

---

## Error (both attempts)

```
lifetime may not live long enough
requirement occurs because of the type `__AccountInfo<'_>`, which makes the generic argument `'_` invariant
the struct `__AccountInfo<'a>` is invariant over the parameter `'a`
see https://doc.rust-lang.org/nomicon/subtyping.html for more information about variance
```

Two instances of the same error, both inside `credit_validator_earnings`, at the
`CpiContext::new(...)` calls for `transfer`, `allocate`, and `assign`.

---

## Background: Why `AccountInfo<'a>` is Invariant

`AccountInfo<'a>` contains `RefCell`-based interior mutability for lamports and account data.
Because of this, the lifetime `'a` is **invariant** — the compiler cannot shorten or lengthen
it to satisfy another context. Two anonymous `'_` lifetimes, even if they look equivalent,
are treated as distinct and non-unifiable.

---

## Attempt 1 — `.cloned()` on the iterator result

### Change made

```rust
// Before
let earnings_account = remaining_accounts.iter().find(|a| a.key() == expected_pda);
match earnings_account {
    Some(account_info) => {

// After
let earnings_account = remaining_accounts
    .iter()
    .find(|a| a.key() == expected_pda)
    .cloned();
match earnings_account {
    Some(ref account_info) => {
```

### Reasoning

`iter().find()` returns `Option<&'iter AccountInfo<'r>>` — a reference whose lifetime is
chained to the iterator borrow of the slice. `.cloned()` was intended to produce an owned
`Option<AccountInfo<'_>>`, breaking that iterator-borrow chain so the compiler could unify
the lifetime with `CpiContext`.

### Why it still failed

The function signature still used anonymous `'_` lifetimes on all three `AccountInfo`
parameters:

```rust
fn credit_validator_earnings(
    signing_validator_info: &AccountInfo<'_>,
    remaining_accounts: &[AccountInfo<'_>],
    system_program: &AccountInfo<'_>,
) -> Result<u64>
```

Each `'_` is a **distinct** placeholder. The compiler has no proof that the `AccountInfo`
cloned out of `remaining_accounts` shares the same lifetime as `signing_validator_info` or
`system_program`. `CpiContext::new` requires all its `AccountInfo` arguments to carry the
**same** concrete `'info` lifetime. With three separate anonymous lifetimes, unification is
still impossible despite the clone.

---

## Attempt 2 — Explicit `'info` lifetime on the function (FIX)

### Change made

```rust
// Before
fn credit_validator_earnings(
    ...
    signing_validator_info: &AccountInfo<'_>,
    remaining_accounts: &[AccountInfo<'_>],
    system_program: &AccountInfo<'_>,
) -> Result<u64>

// After
fn credit_validator_earnings<'info>(
    ...
    signing_validator_info: &AccountInfo<'info>,
    remaining_accounts: &[AccountInfo<'info>],
    system_program: &AccountInfo<'info>,
) -> Result<u64>
```

The `.cloned()` and `Some(account_info)` (no longer `ref`) pattern is kept:

```rust
let earnings_account = remaining_accounts
    .iter()
    .find(|a| a.key() == expected_pda)
    .cloned();

match earnings_account {
    Some(account_info) => {
```

### Why this works

Introducing `<'info>` as a named lifetime parameter and applying it uniformly to all three
`AccountInfo` parameters tells the compiler:

> "All `AccountInfo` values entering this function — whether from `remaining_accounts`,
> `signing_validator_info`, or `system_program` — share a single concrete lifetime."

When `.cloned()` is called on `Option<&AccountInfo<'info>>`, it now produces
`Option<AccountInfo<'info>>` — an owned value with the **same named lifetime** as the other
parameters. `CpiContext::new` receives `AccountInfo<'info>` values that are all provably
lifetime-compatible, satisfying the invariance requirement exactly.

This is the standard Anchor pattern: helper functions that perform CPIs must declare a
`<'info>` generic lifetime and apply it to every `AccountInfo` parameter.

### Call sites

Both call sites pass `AccountInfo` values derived from `.to_account_info()` and
`ctx.remaining_accounts` inside Anchor handler functions typed `Context<'_, '_, '_, 'info, _>`.
Those sources already produce `AccountInfo<'info>`, so no changes at the call sites were needed.

---

## Summary

| Attempt | Change                                       | Result | Why                                                                                                                   |
| ------- | -------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------- |
| 1       | `.cloned()` on iterator result               | FAIL   | Each `'_` in the signature is a distinct anonymous lifetime; clone produces `AccountInfo<'_>` with no shared identity |
| 2       | Explicit `<'info>` on function + `.cloned()` | PASS   | All `AccountInfo` params share one named lifetime; clone preserves it; `CpiContext` can unify                         |

**The root lesson:** When `AccountInfo` invariance causes lifetime errors in CPI helpers, the
fix is always at the **function signature** — use an explicit named `'info` lifetime, not just
at the usage site.
