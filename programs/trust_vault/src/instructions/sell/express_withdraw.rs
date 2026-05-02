use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked},
};

use crate::error::TrustExpressError;
use crate::events::{ExpressClosedEvent, ExpressPartialWithdrawalEvent};
use crate::state::TrustExpress;
use crate::utils::token_helpers::compute_dust_threshold;

#[derive(Accounts)]
pub struct ExpressWithdraw<'info> {
    #[account(mut)]
    pub maker: Signer<'info>,

    #[account(mint::token_program = token_program)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        has_one = maker,
        has_one = mint,
        seeds = [b"trust-express", maker.key().as_ref(), trust_express.seed.to_le_bytes().as_ref()],
        bump = trust_express.bump
    )]
    pub trust_express: Account<'info, TrustExpress>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = trust_express,
        associated_token::token_program = token_program,
    )]
    pub trust_express_ata: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = maker,
        associated_token::token_program = token_program,
    )]
    pub maker_ata: InterfaceAccount<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

pub fn handler(ctx: Context<ExpressWithdraw>, withdraw_amount: u64) -> Result<()> {
    // ✅ NO PAUSE CHECK - Withdrawals are always allowed
    // Users must be able to exit their positions even during pause

    let trust_express_key = ctx.accounts.trust_express.key();
    let maker_key = ctx.accounts.maker.key();
    let trust_express_seed = ctx.accounts.trust_express.seed;
    let trust_express_bump = ctx.accounts.trust_express.bump;
    let escrow_amount = ctx.accounts.trust_express_ata.amount;
    let mint_decimals = ctx.accounts.mint.decimals;

    // Available balance for withdrawal is trust_express.amount
    // (which already excludes reserved amounts and reserved fee)
    let available_for_withdrawal = ctx.accounts.trust_express.amount;

    // Validate withdrawal amount
    require!(withdraw_amount > 0, TrustExpressError::InvalidAmount);
    require!(
        withdraw_amount <= available_for_withdrawal,
        TrustExpressError::InsufficientFunds
    );

    let fee_withdraw_amount;
    let total_withdraw_amount;
    let should_close_trust_express;

    {
        let trust_express = &mut ctx.accounts.trust_express;

        // --- proportional fee withdrawal ---
        // If we're withdrawing X% of available amount, we should also withdraw X% of reserved fee
        if trust_express.reserved_fee > 0 && available_for_withdrawal > 0 {
            let numerator = (trust_express.reserved_fee as u128)
                .checked_mul(withdraw_amount as u128)
                .ok_or(TrustExpressError::ArithmeticOverflow)?;

            let fee_withdraw_u128 = numerator
                .checked_div(available_for_withdrawal as u128)
                .ok_or(TrustExpressError::ArithmeticOverflow)?;

            let calculated_fee_withdraw = if fee_withdraw_u128 > u64::MAX as u128 {
                return Err(TrustExpressError::ArithmeticOverflow.into());
            } else {
                fee_withdraw_u128 as u64
            };

            fee_withdraw_amount = calculated_fee_withdraw.min(trust_express.reserved_fee);
            trust_express.reserved_fee = trust_express
                .reserved_fee
                .saturating_sub(fee_withdraw_amount);
        } else {
            fee_withdraw_amount = 0;
        }

        // Total withdrawal = requested amount + proportional fee
        total_withdraw_amount = withdraw_amount
            .checked_add(fee_withdraw_amount)
            .ok_or(TrustExpressError::ArithmeticOverflow)?;

        // Safety check - ensure we're not trying to withdraw more than what's in escrow
        require!(
            total_withdraw_amount <= escrow_amount,
            TrustExpressError::InsufficientFunds
        );

        // Update trust_express available amount
        trust_express.amount = trust_express.amount.saturating_sub(withdraw_amount);

        // --- close-condition evaluation ---
        let has_active_reservations = trust_express
            .reserved_amounts
            .iter()
            .any(|reservation| reservation.status == 0);

        let remaining_after_withdrawal = escrow_amount
            .checked_sub(total_withdraw_amount)
            .unwrap_or(0);

        let dust_threshold = compute_dust_threshold(mint_decimals);

        // Calculate withdrawal percentage based on available amount
        let withdrawal_percentage = if available_for_withdrawal > 0 {
            (withdraw_amount as u128 * 100) / available_for_withdrawal as u128
        } else {
            0
        };

        let is_near_complete_withdrawal = withdrawal_percentage >= 99;

        should_close_trust_express = !has_active_reservations
            && (remaining_after_withdrawal <= dust_threshold || is_near_complete_withdrawal);
    }

    // --- PDA seeds for signing ---
    let seeds = &[
        b"trust-express",
        maker_key.as_ref(),
        &trust_express_seed.to_le_bytes()[..],
        &[trust_express_bump],
    ];
    let signer_seeds = &[&seeds[..]];

    // --- execute the withdrawal transfer ---
    let transfer_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        TransferChecked {
            from: ctx.accounts.trust_express_ata.to_account_info(),
            to: ctx.accounts.maker_ata.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            authority: ctx.accounts.trust_express.to_account_info(),
        },
        signer_seeds,
    );

    transfer_checked(transfer_ctx, total_withdraw_amount, mint_decimals)?;

    msg!(
        "Withdrew {} tokens (including {} fee) from trust express {} to maker {}'s ATA",
        total_withdraw_amount,
        fee_withdraw_amount,
        trust_express_key,
        maker_key
    );

    // --- optionally close the trust express ---
    if should_close_trust_express {
        let dust_threshold = compute_dust_threshold(mint_decimals);
        let remaining_balance = escrow_amount.saturating_sub(total_withdraw_amount);

        msg!(
            "Closing trust_express as remaining amount ({}) is below dust threshold ({})",
            remaining_balance,
            dust_threshold
        );

        // Transfer any remaining dust
        if remaining_balance > 0 {
            let dust_transfer_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.trust_express_ata.to_account_info(),
                    to: ctx.accounts.maker_ata.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    authority: ctx.accounts.trust_express.to_account_info(),
                },
                signer_seeds,
            );
            transfer_checked(dust_transfer_ctx, remaining_balance, mint_decimals)?;
            msg!("Dust transfer completed: {} tokens", remaining_balance);
        }

        // Close the trust_express account and return lamports to maker
        let maker_starting_lamports = ctx.accounts.maker.lamports();
        let trust_express_account_info = ctx.accounts.trust_express.to_account_info();
        let trust_express_lamports = trust_express_account_info.lamports();

        **ctx.accounts.maker.lamports.borrow_mut() = maker_starting_lamports
            .checked_add(trust_express_lamports)
            .ok_or(TrustExpressError::ArithmeticOverflow)?;
        **trust_express_account_info.lamports.borrow_mut() = 0;

        // Zero out the account data
        let mut trust_express_data = trust_express_account_info.try_borrow_mut_data()?;
        for byte in trust_express_data.iter_mut() {
            *byte = 0;
        }

        emit!(ExpressClosedEvent {
            trust_express: trust_express_key,
            maker: maker_key,
            remaining_amount: 0,
        });
        msg!("TrustExpress account closed and lamports transferred to maker");
    } else {
        let remaining_amount = escrow_amount.saturating_sub(total_withdraw_amount);

        emit!(ExpressPartialWithdrawalEvent {
            trust_express: trust_express_key,
            maker: maker_key,
            withdrawal_amount: total_withdraw_amount,
            remaining_amount,
        });
        msg!("TrustExpress not closed; partial withdrawal performed");
    }

    Ok(())
}
