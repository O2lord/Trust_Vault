use anchor_lang::prelude::*;
use anchor_spl::{associated_token::AssociatedToken, token_interface::TokenInterface};

use crate::error::TrustExpressError;
use crate::events::{ExpressBuyOrderCancelledEvent, ExpressBuyOrderReducedEvent};
use crate::instructions::status::{
    RESERVATION_STATUS_CANCELLED, RESERVATION_STATUS_COMPLETED, RESERVATION_STATUS_DISPUTED,
};
use crate::state::{TrustExpress, EXPRESS_BUY};

#[derive(Accounts)]
pub struct CancelOrReduceBuyOrder<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(
        mut,
        constraint = trust_express.maker == buyer.key(),
        seeds = [b"trust-express", trust_express.maker.key().as_ref(), &trust_express.seed.to_le_bytes()],
        bump = trust_express.bump,
        constraint = trust_express.escrow_type == EXPRESS_BUY,
    )]
    pub trust_express: Account<'info, TrustExpress>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn cancel_or_reduce_buy_order(
    ctx: Context<CancelOrReduceBuyOrder>,
    new_amount: u64,
) -> Result<()> {
    // ✅ NO PAUSE CHECK - Cancellations are always allowed
    // Users must be able to cancel their orders even during pause

    let trust_express = &mut ctx.accounts.trust_express;
    let trust_express_key = trust_express.key();
    let buyer_key = ctx.accounts.buyer.key();
    let original_amount = trust_express.amount;

    let total_reserved: u64 = trust_express
        .reserved_amounts
        .iter()
        .filter(|r| {
            r.status != RESERVATION_STATUS_CANCELLED
                && r.status != RESERVATION_STATUS_COMPLETED
                && r.status != RESERVATION_STATUS_DISPUTED
        })
        .map(|r| r.amount)
        .sum();

    let clock = Clock::get()?;
    let current_timestamp = clock.unix_timestamp;

    if new_amount == 0 {
        require!(
            total_reserved == 0,
            TrustExpressError::ActiveReservationsExist
        );

        emit!(ExpressBuyOrderCancelledEvent {
            trust_express: trust_express_key,
            buyer: buyer_key,
            original_amount,
            timestamp: current_timestamp,
        });

        let trust_express_lamports = trust_express.to_account_info().lamports();
        **trust_express.to_account_info().try_borrow_mut_lamports()? -= trust_express_lamports;
        **ctx
            .accounts
            .buyer
            .to_account_info()
            .try_borrow_mut_lamports()? += trust_express_lamports;

        msg!("Buy order completely cancelled - account closed");
    } else {
        require!(
            new_amount < original_amount,
            TrustExpressError::InvalidAmount
        );
        require!(
            new_amount >= total_reserved,
            TrustExpressError::CannotReduceBelowReserved
        );

        trust_express.amount = new_amount;

        emit!(ExpressBuyOrderReducedEvent {
            trust_express: trust_express_key,
            buyer: buyer_key,
            original_amount,
            new_amount,
            timestamp: current_timestamp,
        });

        msg!(
            "Buy order reduced from {} to {} tokens",
            original_amount,
            new_amount
        );
    }

    Ok(())
}
