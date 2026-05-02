use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked},
};

use crate::error::TrustExpressError;
use crate::events::ValidatorFeeClaimedEvent;
use crate::state::{GlobalState, ValidatorEarnings};

#[derive(Accounts)]
pub struct ClaimValidatorFees<'info> {
    /// The validator claiming their fees — must match validator_earnings.validator
    #[account(mut)]
    pub validator: Signer<'info>,

    #[account(
        seeds = [b"global-state"],
        bump = global_state.bump,
    )]
    pub global_state: Account<'info, GlobalState>,

    #[account(mint::token_program = token_program)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,

    /// The validator's earnings ledger for this mint
    #[account(
        mut,
        seeds = [
            b"validator-earnings",
            validator.key().as_ref(),
            mint.key().as_ref(),
        ],
        bump = validator_earnings.bump,
        constraint = validator_earnings.validator == validator.key() @ TrustExpressError::UnauthorizedValidator,
        constraint = validator_earnings.mint == mint.key() @ TrustExpressError::InvalidMint,
    )]
    pub validator_earnings: Account<'info, ValidatorEarnings>,

    /// The dedicated pool authority PDA — signs transfers out of the pool ATA
    /// CHECK: Derived from seeds, validated against global_state.validator_fee_pool_authority
    #[account(
        seeds = [b"validator-fee-pool-authority"],
        bump,
    )]
    pub validator_fee_pool_authority: AccountInfo<'info>,

    /// The pool ATA holding pending validator earnings for this mint
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = validator_fee_pool_authority,
        associated_token::token_program = token_program,
    )]
    pub validator_fee_pool_ata: Box<InterfaceAccount<'info, TokenAccount>>,

    /// The validator's own ATA — receives the claimed tokens
    #[account(
        init_if_needed,
        payer = validator,
        associated_token::mint = mint,
        associated_token::authority = validator,
        associated_token::token_program = token_program,
    )]
    pub validator_ata: Box<InterfaceAccount<'info, TokenAccount>>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn claim_validator_fees(ctx: Context<ClaimValidatorFees>) -> Result<()> {
    // Verify the pool authority matches what global_state has on record
    require_keys_eq!(
        ctx.accounts.validator_fee_pool_authority.key(),
        ctx.accounts.global_state.validator_fee_pool_authority,
        TrustExpressError::InvalidPoolAuthority
    );

    // Verify this validator is registered
    require!(
        ctx.accounts
            .global_state
            .validators
            .contains(&ctx.accounts.validator.key()),
        TrustExpressError::UnauthorizedValidator
    );

    let claimable = ctx.accounts.validator_earnings.accumulated_amount;
    require!(claimable > 0, TrustExpressError::NothingToClaim);

    // Sanity check — pool must have enough tokens
    require!(
        ctx.accounts.validator_fee_pool_ata.amount >= claimable,
        TrustExpressError::InsufficientPoolBalance
    );

    // Sign with the pool authority PDA seeds
    let pool_authority_bump = ctx.bumps.validator_fee_pool_authority;
    let pool_seeds = &[b"validator-fee-pool-authority" as &[u8], &[pool_authority_bump]];
    let pool_signer_seeds = &[&pool_seeds[..]];

    // Transfer claimable amount from pool ATA to validator's ATA
    let transfer_cpi = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        TransferChecked {
            from: ctx.accounts.validator_fee_pool_ata.to_account_info(),
            to: ctx.accounts.validator_ata.to_account_info(),
            authority: ctx.accounts.validator_fee_pool_authority.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
        },
        pool_signer_seeds,
    );
    transfer_checked(
        transfer_cpi,
        claimable,
        ctx.accounts.mint.decimals,
    )?;

    // Reset accumulated amount — lifetime stats untouched
    ctx.accounts.validator_earnings.accumulated_amount = 0;

    let validator_key = ctx.accounts.validator.key();
    let mint_key = ctx.accounts.mint.key();

    emit!(ValidatorFeeClaimedEvent {
        validator: validator_key,
        mint: mint_key,
        amount: claimable,
        timestamp: Clock::get()?.unix_timestamp,
    });

    msg!(
        "Validator {} claimed {} tokens for mint {}",
        validator_key,
        claimable,
        mint_key,
    );

    Ok(())
}