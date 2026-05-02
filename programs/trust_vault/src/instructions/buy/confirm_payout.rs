use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::token_interface::{
    self, CloseAccount, Mint, TokenAccount, TokenInterface, TransferChecked,
};

use crate::error::TrustExpressError;
use crate::events::{ExpressClosedEvent, InstantPaymentPayoutResultEvent};
use crate::state::TrustExpress;
use crate::utils::get_token_account_owner;

/// Computes a dust threshold based on the token's decimal places.
/// Uses `decimals - 3` (clamped to 0..=18) as the exponent, with a floor of 1000.
fn compute_dust_threshold(decimals: u8) -> u64 {
    let safe_exponent = decimals.saturating_sub(3).min(18);
    if safe_exponent == 0 {
        1000u64
    } else {
        match 10u64.checked_pow(safe_exponent as u32) {
            Some(value) => value.max(1000),
            None => 1000,
        }
    }
}

#[derive(Accounts)]
pub struct ConfirmPayout<'info> {
    #[account(
        mut,
        constraint = trust_express.maker == maker.key(),
        seeds = [b"trust-express", trust_express.maker.as_ref(), &trust_express.seed.to_le_bytes()],
        bump = trust_express.bump,
    )]
    pub trust_express: Account<'info, TrustExpress>,
    pub bot_authority: Signer<'info>,
    /// CHECK: Validated against trust_express.maker
    pub maker: AccountInfo<'info>,

    #[account(
        mint::token_program = token_program
    )]
    pub mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        mut,
        token::mint = mint,
        token::authority = trust_express,
        token::token_program = token_program
    )]
    pub trust_express_ata: Box<InterfaceAccount<'info, TokenAccount>>,

    /// CHECK: Optional fee destination ATA - validated programmatically if used
    pub fee_destination_ata: AccountInfo<'info>,

    /// CHECK: Optional taker ATA for refunds - validated programmatically if used
    pub taker_ata: AccountInfo<'info>,

    /// CHECK: Optional maker ATA for successful payouts - validated programmatically if used
    pub maker_ata: AccountInfo<'info>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler(
    ctx: Context<ConfirmPayout>,
    taker: Pubkey,
    amount: u64,
    fiat_amount: u64,
    currency: String,
    payout_reference: String,
    success: bool,
    message: String,
) -> Result<()> {
    // ✅ NO PAUSE CHECK - Confirmations must always work
    // If pause happens after reservation, we must allow completion to prevent stuck funds

    require_keys_eq!(
        ctx.accounts.maker.key(),
        ctx.accounts.trust_express.maker,
        TrustExpressError::InvalidMaker
    );

    let te_maker = ctx.accounts.trust_express.maker;
    let te_seed_bytes = ctx.accounts.trust_express.seed.to_le_bytes();
    let te_bump = ctx.accounts.trust_express.bump;
    let te_fee_percentage = ctx.accounts.trust_express.fee_percentage;
    let mint_decimals = ctx.accounts.mint.decimals;

    let trust_express = &mut ctx.accounts.trust_express;
    let mint = &ctx.accounts.mint;

    if let Some(reservation_index) = trust_express
        .reserved_amounts
        .iter()
        .position(|r| r.taker == taker && r.payout_reference.as_ref() == Some(&payout_reference))
    {
        require!(
            trust_express.reserved_amounts[reservation_index].status == 0,
            TrustExpressError::ReservationAlreadyProcessed
        );

        let seeds = &[
            b"trust-express" as &[u8],
            te_maker.as_ref(),
            &te_seed_bytes[..],
            &[te_bump],
        ];
        let signer_seeds = &[&seeds[..]];

        if success {
            trust_express.reserved_amounts[reservation_index].status = 2;

            let fee_amount = if te_fee_percentage > 0 {
                amount
                    .checked_mul(te_fee_percentage as u64)
                    .ok_or(TrustExpressError::ArithmeticOverflow)?
                    .checked_div(10000)
                    .ok_or(TrustExpressError::ArithmeticOverflow)?
            } else {
                0
            };

            // --- fee transfer ---
            if fee_amount > 0 {
                if ctx.accounts.fee_destination_ata.key() != Pubkey::default()
                    && *ctx.accounts.fee_destination_ata.owner != system_program::ID
                {
                    let fee_transfer_ctx = CpiContext::new_with_signer(
                        ctx.accounts.token_program.to_account_info(),
                        TransferChecked {
                            from: ctx.accounts.trust_express_ata.to_account_info(),
                            to: ctx.accounts.fee_destination_ata.to_account_info(),
                            authority: trust_express.to_account_info(),
                            mint: mint.to_account_info(),
                        },
                        signer_seeds,
                    );
                    token_interface::transfer_checked(fee_transfer_ctx, fee_amount, mint.decimals)?;
                    msg!("Fee transferred: {} tokens", fee_amount);
                } else {
                    return Err(TrustExpressError::MissingFeeDestinationAta.into());
                }
            }

            // --- maker transfer (buyer receives tokens minus fee) ---
            let maker_amount = amount
                .checked_sub(fee_amount)
                .ok_or(TrustExpressError::ArithmeticOverflow)?;

            if maker_amount > 0 {
                if ctx.accounts.maker_ata.key() != Pubkey::default()
                    && *ctx.accounts.maker_ata.owner != system_program::ID
                {
                    let token_account_owner = get_token_account_owner(
                        &ctx.accounts.maker_ata,
                        &ctx.accounts.token_program,
                    )?;

                    require_keys_eq!(
                        token_account_owner,
                        ctx.accounts.maker.key(),
                        TrustExpressError::InvalidMakerAtaAuthority
                    );

                    let maker_transfer_ctx = CpiContext::new_with_signer(
                        ctx.accounts.token_program.to_account_info(),
                        TransferChecked {
                            from: ctx.accounts.trust_express_ata.to_account_info(),
                            to: ctx.accounts.maker_ata.to_account_info(),
                            authority: trust_express.to_account_info(),
                            mint: mint.to_account_info(),
                        },
                        signer_seeds,
                    );
                    token_interface::transfer_checked(
                        maker_transfer_ctx,
                        maker_amount,
                        mint.decimals,
                    )?;
                    msg!(
                        "Buyer received: {} tokens (amount: {} - fee: {})",
                        maker_amount,
                        amount,
                        fee_amount
                    );
                } else {
                    return Err(TrustExpressError::MissingMakerAta.into());
                }
            }
        } else {
            // --- refund on failure ---
            trust_express.reserved_amounts[reservation_index].status = 3;

            if ctx.accounts.taker_ata.key() != Pubkey::default()
                && *ctx.accounts.taker_ata.owner != system_program::ID
            {
                let refund_transfer_ctx = CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    TransferChecked {
                        from: ctx.accounts.trust_express_ata.to_account_info(),
                        to: ctx.accounts.taker_ata.to_account_info(),
                        authority: trust_express.to_account_info(),
                        mint: mint.to_account_info(),
                    },
                    signer_seeds,
                );
                token_interface::transfer_checked(refund_transfer_ctx, amount, mint.decimals)?;
                msg!("Refunded: {} tokens to seller", amount);
            } else {
                return Err(TrustExpressError::MissingTakerAtaForRefund.into());
            }
        }

        trust_express.reserved_amounts.remove(reservation_index);

        // ─────────────────────────────────────────────────────────────────────
        // ✅ DUST / CLOSE CHECK
        // After removing the reservation, check whether the ATA is at dust
        // level with no active reservations remaining. We intentionally do NOT
        // require trust_express.amount == 0 here — that field can be stale for
        // buy orders (which never deposit tokens) or partially-filled orders,
        // causing zombie accounts that never close. If the ATA is physically
        // empty/dust and no reservations are pending, the order is done.
        // ─────────────────────────────────────────────────────────────────────
        let seeds = &[
            b"trust-express" as &[u8],
            te_maker.as_ref(),
            &te_seed_bytes[..],
            &[te_bump],
        ];
        let signer_seeds = &[&seeds[..]];

        let has_active_reservations = trust_express.reserved_amounts.iter().any(|r| r.status == 0);

        // Reload the ATA balance after the transfers above
        ctx.accounts.trust_express_ata.reload()?;
        let remaining_balance = ctx.accounts.trust_express_ata.amount;
        let dust_threshold = compute_dust_threshold(mint_decimals);
        let is_dust_or_empty = remaining_balance <= dust_threshold;

        // ✅ FIX: Removed `no_available_amount` (trust_express.amount == 0) condition.
        // trust_express.amount can be non-zero even when the order is fully consumed
        // (e.g. buy orders never deposit, partial fills leave stale available amounts).
        // The ATA balance is the ground truth — if it's dust and no reservations are
        // pending, there is nothing left to transact and the account should close.
        if !has_active_reservations && is_dust_or_empty {
            // Sweep any remaining dust to maker before closing
            if remaining_balance > 0 {
                if ctx.accounts.maker_ata.key() != Pubkey::default()
                    && *ctx.accounts.maker_ata.owner != system_program::ID
                {
                    let dust_transfer_ctx = CpiContext::new_with_signer(
                        ctx.accounts.token_program.to_account_info(),
                        TransferChecked {
                            from: ctx.accounts.trust_express_ata.to_account_info(),
                            to: ctx.accounts.maker_ata.to_account_info(),
                            authority: trust_express.to_account_info(),
                            mint: mint.to_account_info(),
                        },
                        signer_seeds,
                    );
                    token_interface::transfer_checked(
                        dust_transfer_ctx,
                        remaining_balance,
                        mint_decimals,
                    )?;
                    msg!("Dust swept to maker: {} tokens", remaining_balance);
                }
            }

            // Close the token account and reclaim rent to maker
            let close_ata_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                CloseAccount {
                    account: ctx.accounts.trust_express_ata.to_account_info(),
                    destination: ctx.accounts.maker.to_account_info(),
                    authority: trust_express.to_account_info(),
                },
                signer_seeds,
            );
            token_interface::close_account(close_ata_ctx)?;
            msg!("Trust express ATA closed, rent returned to maker");

            // Close the PDA itself and return lamports to maker
            let trust_express_account_info = trust_express.to_account_info();
            let trust_express_lamports = trust_express_account_info.lamports();
            **ctx.accounts.maker.lamports.borrow_mut() = ctx
                .accounts
                .maker
                .lamports()
                .checked_add(trust_express_lamports)
                .ok_or(TrustExpressError::ArithmeticOverflow)?;
            **trust_express_account_info.lamports.borrow_mut() = 0;

            let mut data = trust_express_account_info.try_borrow_mut_data()?;
            for byte in data.iter_mut() {
                *byte = 0;
            }

            emit!(ExpressClosedEvent {
                trust_express: ctx.accounts.trust_express.key(),
                maker: te_maker,
                remaining_amount: 0,
            });
            msg!("TrustExpress buy order account closed after final payout");
        }
        // ─────────────────────────────────────────────────────────────────────
    } else {
        return Err(TrustExpressError::ReservationNotFound.into());
    }

    emit!(InstantPaymentPayoutResultEvent {
        trust_express: ctx.accounts.trust_express.key(),
        taker,
        amount,
        fiat_amount,
        currency,
        payout_reference,
        success,
        message,
    });

    Ok(())
}
