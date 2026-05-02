use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct GlobalState {
    pub authority: Pubkey,
    pub total_trust_express_created: u64,
    pub total_trust_express_closed: u64,
    pub total_confirmations: u64,
    pub fee_percentage: u16,
    pub fee_destination: Pubkey,
    pub total_fees_collected: u64,
    pub total_disputes: u64,
    pub total_volume: u64,
    pub high_watermark_volume: u64,
    pub last_volume_update: i64,
    pub buy_orders_paused: bool,
    pub sell_orders_paused: bool,

    // ── Validator consensus fields ────────────────────────────────────────────
    /// Registered validator pubkeys — empty slots hold Pubkey::default()
    pub validators: [Pubkey; 5],
    /// How many non-default slots are currently filled
    pub validator_count: u8,
    /// Minimum approve votes required to execute a payout (default: 3)
    pub required_votes: u8,

    // ── Validator fee pool ────────────────────────────────────────────────────
    /// The dedicated PDA that has authority over the validator fee pool ATAs.
    /// Derived as: seeds = [b"validator-fee-pool-authority"]
    /// Stored here for reference and verification in the claim instruction.
    pub validator_fee_pool_authority: Pubkey,

    /// Number of ValidatorVote PDAs that have been created but not yet executed
    /// or expired. Incremented on first vote for a new reference, decremented
    /// on execution (submit_buy/sell_vote) and on expiry (finalize_expired_vote).
    /// Used by remove_validator to block removal while votes are in flight.
    pub active_vote_count: u64,

    pub bump: u8,
}
