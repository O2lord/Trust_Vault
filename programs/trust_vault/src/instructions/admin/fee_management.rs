use anchor_lang::prelude::*;

use crate::error::TrustExpressError;
use crate::events::{FeeDestinationUpdatedEvent, FeePercentageUpdatedEvent};
use crate::state::GlobalState;

#[derive(Accounts)]
pub struct UpdateFee<'info> {
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

pub fn update_fee_percentage(ctx: Context<UpdateFee>, new_fee_percentage: u16) -> Result<()> {
    require!(
        new_fee_percentage <= 1000, // Max 10% (1000 basis points)
        TrustExpressError::InvalidFeePercentage
    );

    let global_state = &mut ctx.accounts.global_state;
    let old_fee_percentage = global_state.fee_percentage;

    global_state.fee_percentage = new_fee_percentage;

    emit!(FeePercentageUpdatedEvent {
        authority: ctx.accounts.authority.key(),
        old_fee_percentage,
        new_fee_percentage,
        timestamp: Clock::get()?.unix_timestamp,
    });

    msg!(
        "Fee percentage updated from {} basis points ({:.2}%) to {} basis points ({:.2}%)",
        old_fee_percentage,
        old_fee_percentage as f64 / 100.0,
        new_fee_percentage,
        new_fee_percentage as f64 / 100.0
    );

    Ok(())
}

pub fn update_fee_destination(ctx: Context<UpdateFee>, new_fee_destination: Pubkey) -> Result<()> {
    let global_state = &mut ctx.accounts.global_state;
    let old_fee_destination = global_state.fee_destination;

    global_state.fee_destination = new_fee_destination;

    emit!(FeeDestinationUpdatedEvent {
        authority: ctx.accounts.authority.key(),
        old_fee_destination,
        new_fee_destination,
        timestamp: Clock::get()?.unix_timestamp,
    });

    msg!(
        "Fee destination updated from {} to {}",
        old_fee_destination,
        new_fee_destination
    );

    Ok(())
}
