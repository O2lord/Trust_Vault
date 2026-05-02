use anchor_lang::prelude::*;

use crate::error::TrustExpressError;
use crate::events::InstantSellReservationCreatedEvent;
use crate::state::{GlobalState, ReservedAmount, TrustExpress, EXPRESS_SELL};

#[derive(Accounts)]
pub struct InstantSellReserve<'info> {
    #[account(mut, has_one = maker)]
    pub trust_express: Account<'info, TrustExpress>,

    /// CHECK: This account is validated by has_one = maker (the seller)
    pub maker: AccountInfo<'info>,

    #[account(mut)]
    pub buyer: Signer<'info>,

    // ✅ ADD: GlobalState to check pause status
    #[account(
        seeds = [b"global-state"],
        bump = global_state.bump,
    )]
    pub global_state: Account<'info, GlobalState>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<InstantSellReserve>,
    amount: u64,
    payment_mode: u8,
    buyer_payout_details: Option<String>,
    payout_reference: String,
) -> Result<()> {
    // ✅ Check if sell orders (including reservations) are paused globally
    require!(
        !ctx.accounts.global_state.sell_orders_paused,
        TrustExpressError::SellOrdersPaused
    );

    require!(amount > 0, TrustExpressError::InvalidAmount);
    require!(
        payment_mode == 0 || payment_mode == 1,
        TrustExpressError::InvalidPaymentMode
    );
    require!(
        !payout_reference.is_empty(),
        TrustExpressError::InvalidPayoutReference
    );

    let trust_express = &mut ctx.accounts.trust_express;

    // Validate this is a sell order
    require!(
        trust_express.escrow_type == EXPRESS_SELL,
        TrustExpressError::InvalidEscrowType
    );

    // Validate sufficient amount available
    require!(
        trust_express.amount >= amount,
        TrustExpressError::InsufficientAmount
    );

    // Check reservation limit
    require!(
        trust_express.reserved_amounts.len() < 10,
        TrustExpressError::ReservationLimitReached
    );

    let clock = Clock::get()?;

    // Calculate fiat amount
    let fiat_amount = amount
        .checked_mul(trust_express.price_per_token)
        .ok_or(TrustExpressError::ArithmeticOverflow)?;

    // Create reservation with pending payment status
    let reservation = ReservedAmount {
        taker: ctx.accounts.buyer.key(),
        amount,
        fiat_amount,
        timestamp: clock.unix_timestamp,
        seller_instructions: None,
        status: 0, // Pending payment
        dispute_reason: None,
        dispute_id: None,
        payout_details: buyer_payout_details.clone(),
        payout_reference: Some(payout_reference.clone()),
        payment_mode,
        payment_link: None,
        transaction_reference: None,
    };

    // Add reservation
    trust_express.reserved_amounts.push(reservation);

    // Reduce available amount (tokens already in escrow)
    trust_express.amount = trust_express
        .amount
        .checked_sub(amount)
        .ok_or(TrustExpressError::ArithmeticOverflow)?;

    // Emit event
    emit!(InstantSellReservationCreatedEvent {
        trust_express: trust_express.key(),
        maker: trust_express.maker,
        taker: ctx.accounts.buyer.key(),
        amount,
        fiat_amount,
        currency: String::from_utf8_lossy(&trust_express.currency).to_string(),
        payment_mode,
        payout_reference: payout_reference.clone(),
    });

    msg!(
        "Reservation created for buyer {} to purchase {} tokens for {} fiat (mode: {}, ref: {})",
        ctx.accounts.buyer.key(),
        amount,
        fiat_amount,
        if payment_mode == 0 {
            "payment link"
        } else {
            "direct transfer"
        },
        payout_reference
    );

    Ok(())
}
