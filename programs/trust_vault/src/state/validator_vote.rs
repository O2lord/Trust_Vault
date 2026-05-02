use anchor_lang::prelude::*;

/// Tracks the 3-of-5 validator votes for a single reservation payout.
/// Created by the first validator who votes; filled in by subsequent ones.
/// Once `executed` is true the account can be closed by anyone.
#[account]
#[derive(InitSpace)]
pub struct ValidatorVote {
    /// The TrustExpress PDA this vote is for
    pub trust_express: Pubkey,
    /// The taker (seller/buyer) whose reservation is being settled
    pub taker: Pubkey,
    /// Keccak hash of payout_reference — used as PDA seed (always 32 bytes)
    pub reference_hash: [u8; 32],
    /// Number of approve votes received so far
    pub votes_for: u8,
    /// Number of reject votes received so far
    pub votes_against: u8,
    /// Which validators have already voted (prevents double-voting)
    pub voters: [Pubkey; 5],
    /// What each voter decided (parallel array to `voters`)
    pub vote_results: [bool; 5],
    /// True once the threshold was reached and tokens were moved
    pub executed: bool,
    /// Unix timestamp when this vote account was created
    pub created_at: i64,
    /// Unix timestamp after which the vote fails and a refund is triggered
    pub expires_at: i64,
    /// Whether this is a buy-side (true) or sell-side (false) confirmation
    pub is_buy_order: bool,
    /// bump for this PDA
    pub bump: u8,
}

// Space breakdown (excluding 8-byte discriminator, handled by InitSpace):
//   trust_express  : 32
//   taker          : 32
//   reference_hash : 32
//   votes_for      : 1
//   votes_against  : 1
//   voters         : 32 * 5 = 160
//   vote_results   : 1  * 5 = 5
//   executed       : 1
//   created_at     : 8
//   expires_at     : 8
//   is_buy_order   : 1
//   bump           : 1
//   TOTAL          : 282 bytes  +  8 discriminator = 290 bytes
//
// This is 100% fixed size — no Vec, no String, no Option<String>.
// No realloc ever needed.
