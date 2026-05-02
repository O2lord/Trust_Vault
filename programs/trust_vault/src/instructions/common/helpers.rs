use anchor_lang::prelude::*;

use crate::error::TrustExpressError;
use crate::state::GlobalState;

/// Logs a warning if total_volume has somehow drifted below the recorded
/// high watermark (should never happen in normal operation) and bumps
/// `last_volume_update`.
pub fn ensure_high_watermark_preserved(global_state: &mut Account<'_, GlobalState>) -> Result<()> {
    if global_state.total_volume < global_state.high_watermark_volume {
        msg!(
            "Warning: Total volume ({}) is less than high watermark ({})",
            global_state.total_volume,
            global_state.high_watermark_volume
        );
    }

    global_state.last_volume_update = Clock::get()?.unix_timestamp;

    Ok(())
}

/// Bumps confirmation and volume counters after a successful payout.
pub fn update_on_payment_confirmation(
    global_state: &mut Account<'_, GlobalState>,
    token_amount: u64,
) -> Result<()> {
    global_state.total_confirmations += 1;
    global_state.total_volume += token_amount;

    if global_state.total_volume > global_state.high_watermark_volume {
        global_state.high_watermark_volume = global_state.total_volume;
    }

    global_state.last_volume_update = Clock::get()?.unix_timestamp;

    Ok(())
}

/// Increments the closed-trust-express counter.
pub fn update_on_trust_express_close(global_state: &mut Account<'_, GlobalState>) -> Result<()> {
    global_state.total_trust_express_closed += 1;
    global_state.last_volume_update = Clock::get()?.unix_timestamp;
    Ok(())
}

/// Adds to the lifetime fee-collection accumulator with overflow protection.
pub fn update_on_fee_collection(global_state: &mut GlobalState, fee_amount: u64) -> Result<()> {
    global_state.total_fees_collected = global_state
        .total_fees_collected
        .checked_add(fee_amount)
        .ok_or(TrustExpressError::ArithmeticOverflow)?;
    Ok(())
}

/// Convenience: delegates to `update_on_trust_express_close` for refund paths.
pub fn handle_trust_express_refund(global_state: &mut Account<'_, GlobalState>) -> Result<()> {
    update_on_trust_express_close(global_state)
}
