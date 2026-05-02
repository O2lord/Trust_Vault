use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked},
};

use crate::error::TrustExpressError;
use crate::events::InstantPaymentReservedEvent;
use crate::state::{GlobalState, ReservedAmount, TrustExpress};

#[derive(Accounts)]
pub struct InstantReserve<'info> {
    #[account(mut, has_one = maker)]
    pub trust_express: Account<'info, TrustExpress>,

    /// CHECK: This account is validated by has_one = maker
    pub maker: AccountInfo<'info>,

    #[account(mut)]
    pub taker: Signer<'info>,

    #[account(
        mint::token_program = token_program
    )]
    pub mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        init_if_needed,
        payer = taker,
        associated_token::mint = mint,
        associated_token::authority = taker,
        associated_token::token_program = token_program
    )]
    pub taker_ata: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        payer = taker,
        associated_token::mint = mint,
        associated_token::authority = trust_express,
        associated_token::token_program = token_program
    )]
    pub trust_express_ata: Box<InterfaceAccount<'info, TokenAccount>>,

    // ✅ ADD: GlobalState to check pause status
    #[account(
        seeds = [b"global-state"],
        bump = global_state.bump,
    )]
    pub global_state: Account<'info, GlobalState>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<InstantReserve>,
    amount: u64,
    fiat_amount: u64,
    currency: String,
    payout_details: Option<String>,
) -> Result<()> {
    // ✅ Check if buy orders (including reservations) are paused globally
    require!(
        !ctx.accounts.global_state.buy_orders_paused,
        TrustExpressError::BuyOrdersPaused
    );

    require!(amount > 0, TrustExpressError::InvalidAmount);
    let trust_express = &mut ctx.accounts.trust_express;
    let mint = &ctx.accounts.mint;

    let clock = Clock::get()?;
    let payout_reference = format!(
        "IP-{}-{}",
        clock.unix_timestamp,
        &ctx.accounts.taker.key().to_string()[..8]
    );

    require!(
        trust_express.reserved_amounts.len() < 10,
        TrustExpressError::ReservationLimitReached
    );

    let transfer_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        TransferChecked {
            from: ctx.accounts.taker_ata.to_account_info(),
            to: ctx.accounts.trust_express_ata.to_account_info(),
            authority: ctx.accounts.taker.to_account_info(),
            mint: mint.to_account_info(),
        },
    );

    transfer_checked(transfer_ctx, amount, mint.decimals)?;

    let reservation = ReservedAmount {
        taker: ctx.accounts.taker.key(),
        amount,
        fiat_amount,
        timestamp: clock.unix_timestamp,
        seller_instructions: None,
        status: 0,
        dispute_reason: None,
        dispute_id: None,
        payout_details: payout_details.clone(),
        payout_reference: Some(payout_reference.clone()),
        payment_link: None,
        payment_mode: 0,
        transaction_reference: None,
    };

    trust_express.reserved_amounts.push(reservation);

    trust_express.amount = trust_express
        .amount
        .checked_sub(amount)
        .ok_or(TrustExpressError::ArithmeticOverflow)?;

    emit!(InstantPaymentReservedEvent {
        trust_express: trust_express.key(),
        taker: ctx.accounts.taker.key(),
        amount,
        fiat_amount,
        currency,
        payout_details,
        payout_reference,
    });

    Ok(())
}
