use anchor_lang::prelude::*;

/// Emitted when a trust express balance drops low relative to active reservations.
#[event]
pub struct TrustExpressNearlyEmptyEvent {
    pub trust_express: Pubkey,
    pub maker: Pubkey,
    pub remaining_amount: u64,
    pub active_reservations: u32,
    pub timestamp: i64,
}

/// Emitted when an attempted close of a trust express fails.
#[event]
pub struct ExpressCloseFailedEvent {
    pub trust_express: Pubkey,
    pub maker: Pubkey,
    pub remaining_amount: u64,
    pub error_code: u32,
    pub timestamp: i64,
    pub reason: String,
}

/// Emitted when express_withdraw fully closes the trust express account.
#[event]
pub struct ExpressClosedEvent {
    pub trust_express: Pubkey,
    pub maker: Pubkey,
    pub remaining_amount: u64,
}

/// Emitted when express_withdraw is a partial withdrawal (account stays open).
#[event]
pub struct ExpressPartialWithdrawalEvent {
    pub trust_express: Pubkey,
    pub maker: Pubkey,
    pub withdrawal_amount: u64,
    pub remaining_amount: u64,
}
