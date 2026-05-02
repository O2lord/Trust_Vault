use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{Mint, TokenAccount, TokenInterface},
};

use crate::constants::ANCHOR_DISCRIMINATOR;
use crate::error::TrustExpressError;
use crate::events::ExpressSellOrderCreatedEvent;
use crate::instructions::common::{ensure_high_watermark_preserved, transfer_tokens};
use crate::state::{GlobalState, TrustExpress, EXPRESS_SELL};
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
pub struct CreateExpressSellOrder<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,

    #[account(mint::token_program = token_program)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = seller,
        associated_token::token_program = token_program
    )]
    pub seller_ata: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        init,
        payer = seller,
        space = ANCHOR_DISCRIMINATOR + TrustExpress::INIT_SPACE,
        seeds = [b"trust-express", seller.key().as_ref(), seed.to_le_bytes().as_ref()],
        bump
    )]
    pub trust_express: Box<Account<'info, TrustExpress>>,

    #[account(
        init,
        payer = seller,
        associated_token::mint = mint,
        associated_token::authority = trust_express,
        associated_token::token_program = token_program
    )]
    pub trust_express_ata: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        payer = seller,
        space = 8 + GlobalState::INIT_SPACE,
        seeds = [b"global-state"],
        bump
    )]
    pub global_state: Account<'info, GlobalState>,

    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

fn send_tokens_to_escrow(ctx: &Context<CreateExpressSellOrder>, amount: u64) -> Result<()> {
    transfer_tokens(
        &ctx.accounts.seller_ata,
        &ctx.accounts.trust_express_ata,
        &amount,
        &ctx.accounts.mint,
        &ctx.accounts.seller,
        &ctx.accounts.token_program,
    )
}

pub fn create_express_sell_order(
    context: Context<CreateExpressSellOrder>,
    seed: u64,
    amount: u64,
    price_per_token: u64,
    currency: String,
    payment_instructions: String,
    flutterwave_credential_id: String,
) -> Result<()> {
    // ✅ Check if sell orders are paused (blocks creation)
    require!(
        !context.accounts.global_state.sell_orders_paused,
        TrustExpressError::SellOrdersPaused
    );

    validate_order_fields(
        amount,
        price_per_token,
        &payment_instructions,
        &flutterwave_credential_id,
    )?;

    let currency_bytes = parse_currency(&currency)?;

    // Transfer tokens to escrow
    send_tokens_to_escrow(&context, amount)?;

    // Initialize global state if needed
    initialize_global_state_if_needed(
        &mut context.accounts.global_state,
        &context.accounts.mint,
        context.bumps.global_state,
    );

    // Use fee from global state (initialized to 5 basis points if new)
    let fee_percentage = context.accounts.global_state.fee_percentage;

    // Full deposit is available — fee is charged on settlement, not at creation
    let available_amount = amount;

    let fee_destination = context.accounts.global_state.authority;

    context.accounts.trust_express.set_inner(TrustExpress {
        seed,
        escrow_type: EXPRESS_SELL,
        maker: context.accounts.seller.key(),
        mint: context.accounts.mint.key(),
        amount: available_amount,
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

    emit!(ExpressSellOrderCreatedEvent {
        trust_express: context.accounts.trust_express.key(),
        seller: context.accounts.seller.key(),
        mint: context.accounts.mint.key(),
        amount: available_amount,
        price_per_token,
        currency: String::from_utf8_lossy(&currency_bytes).to_string(),
        payment_instructions,
        flutterwave_credential_id: Some(flutterwave_credential_id.clone()),
    });

    msg!(
        "Sell order created: seller deposited {} tokens, all {} available for sale, fee charged on settlement",
        amount,
        available_amount
    );
    msg!(
        "Using Flutterwave credential: {} (supports API monitoring mode)",
        flutterwave_credential_id
    );

    Ok(())
}
