use anchor_lang::prelude::*;

/// Emitted by instant_reserve when a taker locks tokens into a buy-order escrow.
#[event]
pub struct InstantPaymentReservedEvent {
    pub trust_express: Pubkey,
    pub taker: Pubkey,
    pub amount: u64,
    pub fiat_amount: u64,
    pub currency: String,
    pub payout_details: Option<String>,
    pub payout_reference: String,
}

/// Emitted when a fiat payout is queued for processing.
#[event]
pub struct InstantPaymentPayoutQueuedEvent {
    pub trust_express: Pubkey,
    pub taker: Pubkey,
    pub amount: u64,
    pub fiat_amount: u64,
    pub currency: String,
    pub payout_reference: String,
}

/// Emitted by confirm_payout with the final success/failure result.
#[event]
pub struct InstantPaymentPayoutResultEvent {
    pub trust_express: Pubkey,
    pub taker: Pubkey,
    pub amount: u64,
    pub fiat_amount: u64,
    pub currency: String,
    pub payout_reference: String,
    pub success: bool,
    pub message: String,
}
