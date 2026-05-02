use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{Mint, TokenInterface},
};

use crate::constants::ANCHOR_DISCRIMINATOR;
use crate::error::TrustExpressError;
use crate::events::ExpressBuyOrderCreatedEvent;
use crate::instructions::common::ensure_high_watermark_preserved;
use crate::state::{GlobalState, TrustExpress, EXPRESS_BUY};
use crate::utils::{initialize_global_state_if_needed, parse_currency, validate_order_fields};

#[derive(Accounts)]
#[instruction(
    seed: u64,
    amount: u64,
    price_per_token: u64,
    currency: String,
    payment_instructions: String,
    flutterwave_credential_id: String,
)]
pub struct CreateExpressBuyOrder<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(mint::token_program = token_program)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        init,
        payer = buyer,
        space = ANCHOR_DISCRIMINATOR + TrustExpress::INIT_SPACE,
        seeds = [b"trust-express", buyer.key().as_ref(), seed.to_le_bytes().as_ref()],
        bump
    )]
    pub trust_express: Box<Account<'info, TrustExpress>>,

    #[account(
        init_if_needed,
        payer = buyer,
        space = 8 + GlobalState::INIT_SPACE,
        seeds = [b"global-state"],
        bump
    )]
    pub global_state: Account<'info, GlobalState>,

    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

pub fn create_express_buy_order(
    context: Context<CreateExpressBuyOrder>,
    seed: u64,
    amount: u64,
    price_per_token: u64,
    currency: String,
    payment_instructions: String,
    flutterwave_credential_id: String,
) -> Result<()> {
    // ✅ Check if buy orders are paused (blocks creation)
    require!(
        !context.accounts.global_state.buy_orders_paused,
        TrustExpressError::BuyOrdersPaused
    );

    validate_order_fields(
        amount,
        price_per_token,
        &payment_instructions,
        &flutterwave_credential_id,
    )?;

    let currency_bytes = parse_currency(&currency)?;

    initialize_global_state_if_needed(
        &mut context.accounts.global_state,
        &context.accounts.mint,
        context.bumps.global_state,
    );

    // Use fee from global state (initialized to 5 basis points if new)
    let fee_percentage = context.accounts.global_state.fee_percentage;
    let fee_destination = context.accounts.global_state.authority;

    context.accounts.trust_express.set_inner(TrustExpress {
        seed,
        escrow_type: EXPRESS_BUY,
        maker: context.accounts.buyer.key(),
        mint: context.accounts.mint.key(),
        amount,
        reserved_fee: 0,
        price_per_token,
        currency: currency_bytes,
        fee_percentage,
        fee_destination,
        payment_instructions: payment_instructions.clone(),
        reserved_amounts: Vec::new(),
        flutterwave_credential_id: Some(flutterwave_credential_id.clone()),
        bump: context.bumps.trust_express,
    });

    let global_state = &mut context.accounts.global_state;
    global_state.total_trust_express_created += 1;

    ensure_high_watermark_preserved(global_state)?;

    emit!(ExpressBuyOrderCreatedEvent {
        trust_express: context.accounts.trust_express.key(),
        buyer: context.accounts.buyer.key(),
        mint: context.accounts.mint.key(),
        amount,
        price_per_token,
        currency: String::from_utf8_lossy(&currency_bytes).to_string(),
        payment_instructions,
        flutterwave_credential_id: Some(flutterwave_credential_id.clone()),
    });

    msg!(
        "Buy order created for {} tokens at {} per token",
        amount,
        price_per_token
    );
    msg!(
        "Using Flutterwave credential: {}",
        flutterwave_credential_id
    );

    Ok(())
}
