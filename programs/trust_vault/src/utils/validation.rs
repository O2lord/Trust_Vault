use anchor_lang::prelude::*;
use anchor_spl::token_interface::Mint;

use crate::constants::RESOLVER_AUTHORITY;
use crate::error::TrustExpressError;
use crate::state::GlobalState;

/// Converts a 3-character currency string into a `[u8; 3]` array.
/// Returns `InvalidCurrency` if the string is not exactly 3 bytes.
pub fn parse_currency(currency: &str) -> Result<[u8; 3]> {
    let bytes = currency.as_bytes();
    require!(bytes.len() == 3, TrustExpressError::InvalidCurrency);
    let mut arr = [0u8; 3];
    arr.copy_from_slice(bytes);
    Ok(arr)
}

/// Validates that a Flutterwave credential ID is non-empty and at most 64 bytes.
pub fn validate_credential_id(id: &str) -> Result<()> {
    require!(
        !id.is_empty() && id.len() <= 64,
        TrustExpressError::InvalidCredentialId
    );
    Ok(())
}

/// Validates common order-creation fields shared by both buy and sell paths.
pub fn validate_order_fields(
    amount: u64,
    price_per_token: u64,
    payment_instructions: &str,
    flutterwave_credential_id: &str,
) -> Result<()> {
    require!(amount > 0, TrustExpressError::InvalidAmount);
    require!(price_per_token > 0, TrustExpressError::InvalidPrice);
    require!(
        !payment_instructions.is_empty(),
        TrustExpressError::InvalidPaymentInstructions
    );
    require!(
        payment_instructions.len() <= 300,
        TrustExpressError::PaymentInstructionsTooLong
    );
    validate_credential_id(flutterwave_credential_id)
}

/// Idempotent initialiser for the global state PDA.
/// Only writes when all three counters are still at their default zero values
/// (i.e. the account was just `init_if_needed` and has never been written).
pub fn initialize_global_state_if_needed(
    global_state: &mut Account<GlobalState>,
    mint: &InterfaceAccount<Mint>,
    bump: u8,
) {
    if global_state.total_trust_express_created == 0
        && global_state.total_trust_express_closed == 0
        && global_state.total_confirmations == 0
    {
        let (fee_pool_authority, _) =
            Pubkey::find_program_address(&[b"validator-fee-pool-authority"], &crate::ID);
        global_state.validator_fee_pool_authority = fee_pool_authority;

        global_state.authority = RESOLVER_AUTHORITY;
        global_state.total_trust_express_created = 0;
        global_state.total_trust_express_closed = 0;
        global_state.total_confirmations = 0;
        global_state.total_volume = 0;
        global_state.high_watermark_volume = 0;
        global_state.last_volume_update = Clock::get().unwrap().unix_timestamp;
        global_state.total_disputes = 0;
        global_state.fee_percentage = 5; // Default 5 basis points (0.05%)
        global_state.fee_destination = RESOLVER_AUTHORITY;
        global_state.buy_orders_paused = false;
        global_state.sell_orders_paused = false;
        global_state.bump = bump;

        msg!(
            "Global state initialized with resolver authority: {}",
            RESOLVER_AUTHORITY
        );
    }
}
