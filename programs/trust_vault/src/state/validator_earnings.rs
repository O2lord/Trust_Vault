use anchor_lang::prelude::*;

/// Tracks accumulated fee earnings for a single validator on a single token mint.
/// Created lazily on the first vote execution where this validator earns fees
/// for a given mint — the signing validator pays for initialization.
///
/// PDA seeds: [b"validator-earnings", validator_pubkey, mint_pubkey]
#[account]
#[derive(InitSpace)]
pub struct ValidatorEarnings {
    /// The validator this account belongs to
    pub validator: Pubkey,
    /// The token mint these earnings are denominated in
    pub mint: Pubkey,
    /// Accumulated fees owed to this validator, not yet claimed
    pub accumulated_amount: u64,
    /// Total lifetime earnings for this validator on this mint (never decrements)
    pub total_earned: u64,
    /// Total number of vote executions this validator has been credited for
    pub total_credits: u64,
    /// Unix timestamp of the last credit
    pub last_credited_at: i64,
    /// Bump for this PDA
    pub bump: u8,
}

// Space breakdown (excluding 8-byte discriminator, handled by InitSpace):
//   validator         : 32
//   mint              : 32
//   accumulated_amount: 8
//   total_earned      : 8
//   total_credits     : 8
//   last_credited_at  : 8
//   bump              : 1
//   TOTAL             : 97 bytes  +  8 discriminator = 105 bytes
//
// Fixed size — no Vec, no String, no Option.
// No realloc ever needed.