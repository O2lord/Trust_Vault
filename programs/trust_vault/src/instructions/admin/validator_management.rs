use anchor_lang::prelude::*;

use crate::error::TrustExpressError;
use crate::events::{ValidatorRegisteredEvent, ValidatorRemovedEvent};
use crate::state::GlobalState;

// ─────────────────────────────────────────────────────────────────────────────
// Register validator
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct ManageValidator<'info> {
    /// Must be the stored authority
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"global-state"],
        bump = global_state.bump,
        has_one = authority
    )]
    pub global_state: Account<'info, GlobalState>,

    pub system_program: Program<'info, System>,
}

/// Add a validator pubkey to the 5-slot registry.
/// Fails if all 5 slots are already occupied or the key is already registered.
pub fn register_validator(ctx: Context<ManageValidator>, validator_pubkey: Pubkey) -> Result<()> {
    let global_state = &mut ctx.accounts.global_state;

    // Must not already be registered
    require!(
        !global_state.validators.contains(&validator_pubkey),
        TrustExpressError::ValidatorAlreadyRegistered
    );

    // Find an empty slot (represented by Pubkey::default())
    let slot = global_state
        .validators
        .iter()
        .position(|v| *v == Pubkey::default())
        .ok_or(TrustExpressError::ValidatorSlotsFull)?;

    global_state.validators[slot] = validator_pubkey;
    global_state.validator_count += 1;

    emit!(ValidatorRegisteredEvent {
        authority: ctx.accounts.authority.key(),
        validator: validator_pubkey,
        slot: slot as u8,
        timestamp: Clock::get()?.unix_timestamp,
    });

    msg!(
        "Validator {} registered in slot {}. Total validators: {}",
        validator_pubkey,
        slot,
        global_state.validator_count
    );

    Ok(())
}

/// Remove a validator pubkey from the registry.
/// The slot is zeroed out so it can be reused.
pub fn remove_validator(ctx: Context<ManageValidator>, validator_pubkey: Pubkey) -> Result<()> {
    let global_state = &mut ctx.accounts.global_state;

    // Refuse removal while any ValidatorVote PDAs are still open.
    // Removing a validator mid-vote would cause their earnings PDA to be
    // skipped by credit_validator_earnings and their share redirected to
    // the platform, and could shift the threshold calculation unexpectedly.
    require!(
        global_state.active_vote_count == 0,
        TrustExpressError::ActiveVotesInProgress
    );

    let slot = global_state
        .validators
        .iter()
        .position(|v| *v == validator_pubkey)
        .ok_or(TrustExpressError::ValidatorNotFound)?;

    global_state.validators[slot] = Pubkey::default();
    global_state.validator_count = global_state.validator_count.saturating_sub(1);

    emit!(ValidatorRemovedEvent {
        authority: ctx.accounts.authority.key(),
        validator: validator_pubkey,
        slot: slot as u8,
        timestamp: Clock::get()?.unix_timestamp,
    });

    msg!(
        "Validator {} removed from slot {}. Total validators: {}",
        validator_pubkey,
        slot,
        global_state.validator_count
    );

    Ok(())
}

/// Update the required vote threshold (1–5).
pub fn update_required_votes(ctx: Context<ManageValidator>, required_votes: u8) -> Result<()> {
    require!(
        required_votes >= 1 && required_votes <= 5,
        TrustExpressError::InvalidVoteThreshold
    );

    let global_state = &mut ctx.accounts.global_state;

    // Safety: threshold must not exceed registered validators
    require!(
        required_votes <= global_state.validator_count,
        TrustExpressError::ThresholdExceedsValidators
    );

    global_state.required_votes = required_votes;

    msg!(
        "Vote threshold updated to {}/{}",
        required_votes,
        global_state.validator_count
    );

    Ok(())
}
