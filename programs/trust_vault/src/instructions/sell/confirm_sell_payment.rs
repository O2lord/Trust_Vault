use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::token_interface::{
    self, CloseAccount, Mint, TokenAccount, TokenInterface, TransferChecked,
};

use crate::error::TrustExpressError;
use crate::events::{ExpressClosedEvent, InstantSellPaymentResultEvent};
use crate::state::{TrustExpress, EXPRESS_SELL};
use crate::utils::compute_dust_threshold;
use crate::utils::get_token_account_owner;
#[derive(Accounts)]
pub struct ConfirmSellPayment<'info> {
    #[account(
        mut,
        constraint = trust_express.maker == maker.key(),
        seeds = [b"trust-express", trust_express.maker.as_ref(), &trust_express.seed.to_le_bytes()],
        bump = trust_express.bump,
    )]
    pub trust_express: Account<'info, TrustExpress>,

    pub bot_authority: Signer<'info>,

    /// CHECK: Validated against trust_express.maker (the seller)
    #[account(mut)]
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
    #[account(mut)]
    pub fee_destination_ata: AccountInfo<'info>,

    /// CHECK: Optional taker (buyer) ATA - validated programmatically if success
    #[account(mut)]
    pub taker_ata: AccountInfo<'info>,

    /// CHECK: Optional maker ATA for dust sweep on close - validated programmatically if used
    #[account(mut)]
    pub maker_ata: AccountInfo<'info>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler(
    ctx: Context<ConfirmSellPayment>,
    taker: Pubkey,
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

    let trust_express_key = ctx.accounts.trust_express.key();
    let trust_express_maker = ctx.accounts.trust_express.maker;
    let te_seed_bytes = ctx.accounts.trust_express.seed.to_le_bytes();
    let te_bump = ctx.accounts.trust_express.bump;
    let te_fee_percentage = ctx.accounts.trust_express.fee_percentage;
    let mint_decimals = ctx.accounts.mint.decimals;

    let trust_express = &mut ctx.accounts.trust_express;
    let mint = &ctx.accounts.mint;

    require!(
        trust_express.escrow_type == EXPRESS_SELL,
        TrustExpressError::InvalidEscrowType
    );

    if let Some(reservation_index) = trust_express
        .reserved_amounts
        .iter()
        .position(|r| r.taker == taker && r.payout_reference.as_ref() == Some(&payout_reference))
    {
        let amount = trust_express.reserved_amounts[reservation_index].amount;
        let fiat_amount = trust_express.reserved_amounts[reservation_index].fiat_amount;

        require!(
            trust_express.reserved_amounts[reservation_index].status == 0,
            TrustExpressError::ReservationAlreadyProcessed
        );

        let currency = String::from_utf8_lossy(&trust_express.currency).to_string();

        let seeds = &[
            b"trust-express" as &[u8],
            trust_express_maker.as_ref(),
            &te_seed_bytes[..],
            &[te_bump],
        ];
        let signer_seeds = &[&seeds[..]];

        if success {
            // --- fee calculation ---
            let fee_amount = if te_fee_percentage > 0 {
                amount
                    .checked_mul(te_fee_percentage as u64)
                    .ok_or(TrustExpressError::ArithmeticOverflow)?
                    .checked_div(10000)
                    .ok_or(TrustExpressError::ArithmeticOverflow)?
            } else {
                0
            };

            let actual_fee = fee_amount.min(trust_express.reserved_fee);
            trust_express.reserved_fee = trust_express.reserved_fee.saturating_sub(actual_fee);

            // --- fee transfer ---
            if actual_fee > 0 {
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
                    token_interface::transfer_checked(fee_transfer_ctx, actual_fee, mint.decimals)?;
                    msg!("Transferred fee: {} tokens", actual_fee);
                } else {
                    return Err(TrustExpressError::MissingFeeDestinationAta.into());
                }
            }

            // --- token transfer to buyer ---
            if ctx.accounts.taker_ata.key() != Pubkey::default()
                && *ctx.accounts.taker_ata.owner != system_program::ID
            {
                let token_account_owner =
                    get_token_account_owner(&ctx.accounts.taker_ata, &ctx.accounts.token_program)?;

                require_keys_eq!(
                    token_account_owner,
                    taker,
                    TrustExpressError::InvalidTakerAtaAuthority
                );

                let transfer_ctx = CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    TransferChecked {
                        from: ctx.accounts.trust_express_ata.to_account_info(),
                        to: ctx.accounts.taker_ata.to_account_info(),
                        authority: trust_express.to_account_info(),
                        mint: mint.to_account_info(),
                    },
                    signer_seeds,
                );
                token_interface::transfer_checked(transfer_ctx, amount, mint.decimals)?;

                msg!(
                    "Payment confirmed - transferred {} tokens to buyer {}",
                    amount,
                    taker
                );
            } else {
                return Err(TrustExpressError::MissingTakerAta.into());
            }

            trust_express.reserved_amounts.remove(reservation_index);

            emit!(InstantSellPaymentResultEvent {
                trust_express: trust_express_key,
                maker: trust_express_maker,
                taker,
                amount,
                fiat_amount,
                currency,
                payout_reference,
                success: true,
                message,
                fee_amount: actual_fee,
            });
        } else {
            // --- payment failed / timed out: return tokens to available pool ---
            trust_express.amount = trust_express
                .amount
                .checked_add(amount)
                .ok_or(TrustExpressError::ArithmeticOverflow)?;

            trust_express.reserved_amounts.remove(reservation_index);

            msg!(
                "Payment failed/timed out - {} tokens returned to available pool. Reason: {}",
                amount,
                message
            );

            emit!(InstantSellPaymentResultEvent {
                trust_express: trust_express_key,
                maker: trust_express_maker,
                taker,
                amount,
                fiat_amount,
                currency,
                payout_reference,
                success: false,
                message,
                fee_amount: 0,
            });
        }

        // ─────────────────────────────────────────────────────────────────────
        // ✅ DUST / CLOSE CHECK
        // After processing the reservation, check whether the ATA is at dust
        // level with no active reservations remaining. We intentionally do NOT
        // require trust_express.amount == 0 or reserved_fee == 0 here — those
        // fields can be stale for partially-filled orders, causing zombie accounts
        // that never close. The ATA balance is the ground truth — if it is
        // physically empty/dust and no reservations are pending, the order is
        // done regardless of what the bookkeeping fields say.
        // ─────────────────────────────────────────────────────────────────────
        let seeds = &[
            b"trust-express" as &[u8],
            trust_express_maker.as_ref(),
            &te_seed_bytes[..],
            &[te_bump],
        ];
        let signer_seeds = &[&seeds[..]];

        let has_active_reservations = trust_express.reserved_amounts.iter().any(|r| r.status == 0);

        // Reload the ATA balance after all the transfers above
        ctx.accounts.trust_express_ata.reload()?;
        let remaining_balance = ctx.accounts.trust_express_ata.amount;
        let dust_threshold = compute_dust_threshold(mint_decimals);
        let is_dust_or_empty = remaining_balance <= dust_threshold;

        // ✅ FIX: Removed `no_available_amount` (trust_express.amount == 0) and
        // `reserved_fee_cleared` (trust_express.reserved_fee == 0) conditions.
        // Both fields can be stale/non-zero on partially-filled sell orders,
        // blocking closure even when the ATA is physically empty. The ATA balance
        // after a reload is the authoritative signal — if it is dust and there are
        // no pending reservations, the escrow has nothing left and should close.
        if !has_active_reservations && is_dust_or_empty {
            // Sweep remaining dust back to the seller before closing
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
                    msg!("Dust swept to seller: {} tokens", remaining_balance);
                }
            }

            // Close the token account and reclaim rent to maker/seller
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
            msg!("Trust express ATA closed, rent returned to seller");

            // Close the PDA itself and return lamports to maker/seller
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
                trust_express: trust_express_key,
                maker: trust_express_maker,
                remaining_amount: 0,
            });
            msg!("TrustExpress sell order account closed after final payout");
        }
        // ─────────────────────────────────────────────────────────────────────
    } else {
        return Err(TrustExpressError::ReservationNotFound.into());
    }

    Ok(())
}
