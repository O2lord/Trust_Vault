use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{self, CloseAccount, Mint, TokenAccount, TokenInterface, TransferChecked},
};
use solana_keccak_hasher::hashv;

use crate::error::TrustExpressError;
use crate::events::{ExpressClosedEvent, ValidatorVoteCastEvent, ValidatorVoteExecutedEvent};
use crate::state::{GlobalState, TrustExpress, ValidatorEarnings, ValidatorVote};
use crate::utils::compute_dust_threshold;
use crate::utils::get_token_account_owner;

/// How long (seconds) a vote account stays open before it expires.
pub const VOTE_EXPIRY_SECONDS: i64 = 30 * 60; // 30 minutes

/// Space needed for a ValidatorEarnings account (discriminator + fields)
pub const VALIDATOR_EARNINGS_SPACE: usize = 8 + ValidatorEarnings::INIT_SPACE;

/// Produces a fixed 32-byte seed from a payout reference string.
fn reference_hash(payout_reference: &str) -> [u8; 32] {
    hashv(&[payout_reference.as_bytes()]).to_bytes()
}

/// Splits a total fee into platform, maker, and validator pool shares.
///
/// Split: 20% platform / 60% maker / 20% validator pool
/// Validator pool receives the true remainder to avoid any dust loss from
/// integer division (remainder can only be 0 or 1 token).
///
/// Returns (platform_fee, maker_fee, validator_pool_fee)
fn split_fee(total_fee: u64) -> Result<(u64, u64, u64)> {
    let platform_fee = total_fee
        .checked_mul(20)
        .ok_or(TrustExpressError::ArithmeticOverflow)?
        .checked_div(100)
        .ok_or(TrustExpressError::ArithmeticOverflow)?;

    let maker_fee = total_fee
        .checked_mul(60)
        .ok_or(TrustExpressError::ArithmeticOverflow)?
        .checked_div(100)
        .ok_or(TrustExpressError::ArithmeticOverflow)?;

    // Validator pool gets the remainder to avoid any dust loss
    let validator_pool_fee = total_fee
        .checked_sub(platform_fee)
        .ok_or(TrustExpressError::ArithmeticOverflow)?
        .checked_sub(maker_fee)
        .ok_or(TrustExpressError::ArithmeticOverflow)?;

    Ok((platform_fee, maker_fee, validator_pool_fee))
}

/// Credits each participating validator's ValidatorEarnings PDA from remaining_accounts.
///
/// remaining_accounts layout: one ValidatorEarnings PDA per voter, passed in any order.
/// The function matches each voter to their PDA by deriving the expected address.
///
/// - If the PDA exists: deserialise, credit, re-serialise.
/// - If the PDA doesn't exist and the voter IS the signing validator: initialise it
///   (signing validator pays rent).
/// - If the PDA doesn't exist and the voter is NOT the signing validator: their
///   share is returned as `uncredited` and redirected to the platform by the caller.
///
/// First voter (index 0 in the active voters list) receives any remainder from
/// integer division of the pool fee.
///
/// Returns the total uncredited amount (for platform redirect).
fn credit_validator_earnings<'info>(
    voters: &[Pubkey; 5],
    validator_pool_fee: u64,
    mint_key: Pubkey,
    clock_ts: i64,
    signing_validator_key: Pubkey,
    signing_validator_info: &AccountInfo<'info>,
    remaining_accounts: &[AccountInfo<'info>],
    system_program: &AccountInfo<'info>,
) -> Result<u64> {
    let active_voters: Vec<Pubkey> = voters
        .iter()
        .filter(|v| **v != Pubkey::default())
        .cloned()
        .collect();

    let voter_count = active_voters.len() as u64;
    if voter_count == 0 || validator_pool_fee == 0 {
        return Ok(0);
    }

    let per_validator = validator_pool_fee
        .checked_div(voter_count)
        .ok_or(TrustExpressError::ArithmeticOverflow)?;

    let remainder = validator_pool_fee
        .checked_sub(
            per_validator
                .checked_mul(voter_count)
                .ok_or(TrustExpressError::ArithmeticOverflow)?,
        )
        .ok_or(TrustExpressError::ArithmeticOverflow)?;

    let mut uncredited: u64 = 0;

    for (i, voter_key) in active_voters.iter().enumerate() {
        // First voter gets per_validator + any remainder
        let share = if i == 0 {
            per_validator
                .checked_add(remainder)
                .ok_or(TrustExpressError::ArithmeticOverflow)?
        } else {
            per_validator
        };

        // Derive the expected PDA address for this voter
        let (expected_pda, bump) = Pubkey::find_program_address(
            &[b"validator-earnings", voter_key.as_ref(), mint_key.as_ref()],
            &crate::ID,
        );

        // Find this PDA in remaining_accounts
        let earnings_account = remaining_accounts
            .iter()
            .find(|a| a.key() == expected_pda)
            .cloned();

        match earnings_account {
            Some(account_info) => {
                if account_info.data_is_empty() {
                    // ── Init any voter's PDA ───────────────────────────────────
                    // The signing validator funds rent for everyone.
                    // allocate + assign use the PDA's own seeds as signer —
                    // PDAs are valid signers for CPI via invoke_signed.
                    let space = VALIDATOR_EARNINGS_SPACE;
                    let rent = Rent::get()?;
                    let lamports = rent.minimum_balance(space);

                    // Transfer rent from the signing validator (wallet signer)
                    anchor_lang::system_program::transfer(
                        CpiContext::new(
                            system_program.to_account_info(),
                            anchor_lang::system_program::Transfer {
                                from: signing_validator_info.to_account_info(),
                                to: account_info.clone(),
                            },
                        ),
                        lamports,
                    )?;

                    // PDA signs for allocate + assign using its own seeds
                    let pda_seeds: &[&[u8]] = &[
                        b"validator-earnings",
                        voter_key.as_ref(),
                        mint_key.as_ref(),
                        &[bump],
                    ];
                    let pda_signer_seeds = &[pda_seeds];

                    anchor_lang::system_program::allocate(
                        CpiContext::new_with_signer(
                            system_program.to_account_info(),
                            anchor_lang::system_program::Allocate {
                                account_to_allocate: account_info.clone(),
                            },
                            pda_signer_seeds,
                        ),
                        space as u64,
                    )?;

                    anchor_lang::system_program::assign(
                        CpiContext::new_with_signer(
                            system_program.to_account_info(),
                            anchor_lang::system_program::Assign {
                                account_to_assign: account_info.clone(),
                            },
                            pda_signer_seeds,
                        ),
                        &crate::ID,
                    )?;

                    let earnings = ValidatorEarnings {
                        validator: *voter_key,
                        mint: mint_key,
                        accumulated_amount: share,
                        total_earned: share,
                        total_credits: 1,
                        last_credited_at: clock_ts,
                        bump,
                    };

                    let mut data = account_info.try_borrow_mut_data()?;
                    // try_serialize writes the 8-byte discriminator followed by the
                    // struct fields — pass the full buffer so it doesn't overflow.
                    let mut write_buf = &mut data[..];
                    earnings.try_serialize(&mut write_buf)?;

                    msg!(
                        "ValidatorEarnings PDA created and credited {} tokens for validator {}",
                        share,
                        voter_key
                    );
                } else {
                    // ── Account exists — credit it ────────────────────────────
                    let mut earnings: ValidatorEarnings =
                        ValidatorEarnings::try_deserialize(&mut &account_info.data.borrow()[..])?;

                    require_keys_eq!(
                        earnings.validator,
                        *voter_key,
                        TrustExpressError::UnauthorizedValidator
                    );
                    require_keys_eq!(earnings.mint, mint_key, TrustExpressError::InvalidMint);

                    earnings.accumulated_amount = earnings
                        .accumulated_amount
                        .checked_add(share)
                        .ok_or(TrustExpressError::ArithmeticOverflow)?;
                    earnings.total_earned = earnings
                        .total_earned
                        .checked_add(share)
                        .ok_or(TrustExpressError::ArithmeticOverflow)?;
                    earnings.total_credits += 1;
                    earnings.last_credited_at = clock_ts;

                    let mut data = account_info.try_borrow_mut_data()?;
                    // try_serialize writes the 8-byte discriminator followed by the
                    // struct fields — pass the full buffer so it doesn't overflow.
                    let mut write_buf = &mut data[..];
                    earnings.try_serialize(&mut write_buf)?;

                    msg!(
                        "Credited {} tokens to validator {} earnings",
                        share,
                        voter_key
                    );
                }
            }
            None => {
                // PDA not passed in remaining_accounts — redirect share to platform
                msg!(
                    "ValidatorEarnings PDA for {} not provided — {} tokens redirected to platform",
                    voter_key,
                    share
                );
                uncredited = uncredited
                    .checked_add(share)
                    .ok_or(TrustExpressError::ArithmeticOverflow)?;
            }
        }
    }

    Ok(uncredited)
}

// ─────────────────────────────────────────────────────────────────────────────
// BUY-SIDE vote
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(reference_hash: [u8; 32])]
pub struct SubmitBuyVote<'info> {
    /// Must be a registered validator
    #[account(mut)]
    pub validator: Signer<'info>,

    #[account(
        mut,
        seeds = [b"global-state"],
        bump = global_state.bump,
    )]
    pub global_state: Account<'info, GlobalState>,

    #[account(
        mut,
        seeds = [
            b"trust-express",
            trust_express.maker.as_ref(),
            &trust_express.seed.to_le_bytes(),
        ],
        bump = trust_express.bump,
    )]
    pub trust_express: Account<'info, TrustExpress>,

    #[account(
        init_if_needed,
        payer = validator,
        space = 8 + ValidatorVote::INIT_SPACE,
        seeds = [
            b"validator-vote",
            trust_express.key().as_ref(),
            reference_hash.as_ref(),
        ],
        bump
    )]
    pub validator_vote: Account<'info, ValidatorVote>,

    /// CHECK: Validated against trust_express.maker — mut for lamport return on close
    #[account(mut)]
    pub maker: AccountInfo<'info>,

    #[account(mint::token_program = token_program)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        mut,
        token::mint = mint,
        token::authority = trust_express,
        token::token_program = token_program,
    )]
    pub trust_express_ata: Box<InterfaceAccount<'info, TokenAccount>>,

    /// CHECK: Platform fee destination ATA — receives 20% of fee
    #[account(mut)]
    pub fee_destination_ata: AccountInfo<'info>,

    /// CHECK: Taker ATA — used for refunds on failure
    #[account(mut)]
    pub taker_ata: AccountInfo<'info>,

    /// CHECK: Maker ATA — receives principal + 60% fee rebate on success; dust on close
    #[account(mut)]
    pub maker_ata: AccountInfo<'info>,

    /// CHECK: Dedicated pool authority PDA — signs validator pool ATA transfers
    /// Validated against global_state.validator_fee_pool_authority in handler
    #[account(
        seeds = [b"validator-fee-pool-authority"],
        bump,
    )]
    pub validator_fee_pool_authority: AccountInfo<'info>,

    /// Pool ATA accumulating the validator 20% share for this mint
    #[account(
        init_if_needed,
        payer = validator,
        associated_token::mint = mint,
        associated_token::authority = validator_fee_pool_authority,
        associated_token::token_program = token_program,
    )]
    pub validator_fee_pool_ata: Box<InterfaceAccount<'info, TokenAccount>>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    // remaining_accounts: up to 5 ValidatorEarnings PDAs (one per voter)
}

pub fn submit_buy_vote<'info>(
    ctx: Context<'_, '_, '_, 'info, SubmitBuyVote<'info>>,
    reference_hash: [u8; 32],
    payout_reference: String,
    taker: Pubkey,
    amount: u64,
    fiat_amount: u64,
    currency: String,
    vote: bool,
    evidence: String,
) -> Result<()> {
    let validator_key = ctx.accounts.validator.key();

    // ── 0. Verify the caller-supplied hash matches what we'd derive ourselves ─
    let expected_hash = self::reference_hash(&payout_reference);
    require!(
        reference_hash == expected_hash,
        TrustExpressError::InvalidReferenceHash
    );

    // ── 1. Confirm registered validator ──────────────────────────────────────
    require!(
        ctx.accounts
            .global_state
            .validators
            .contains(&validator_key),
        TrustExpressError::UnauthorizedValidator
    );

    // Verify pool authority matches global state
    require_keys_eq!(
        ctx.accounts.validator_fee_pool_authority.key(),
        ctx.accounts.global_state.validator_fee_pool_authority,
        TrustExpressError::InvalidPoolAuthority
    );

    // ── 2. Initialise vote account on first vote ──────────────────────────────
    let clock = Clock::get()?;
    {
        let va = &mut ctx.accounts.validator_vote;
        if !va.executed && va.created_at == 0 {
            va.trust_express = ctx.accounts.trust_express.key();
            va.taker = taker;
            va.reference_hash = reference_hash;
            va.votes_for = 0;
            va.votes_against = 0;
            va.voters = [Pubkey::default(); 5];
            va.vote_results = [false; 5];
            va.executed = false;
            va.created_at = clock.unix_timestamp;
            va.expires_at = clock.unix_timestamp + VOTE_EXPIRY_SECONDS;
            va.is_buy_order = true;
            va.bump = ctx.bumps.validator_vote;
            ctx.accounts.global_state.active_vote_count += 1;
        }
    }

    // ── 3. Guard checks ───────────────────────────────────────────────────────
    require!(
        !ctx.accounts.validator_vote.executed,
        TrustExpressError::VoteAlreadyExecuted
    );
    require!(
        clock.unix_timestamp < ctx.accounts.validator_vote.expires_at,
        TrustExpressError::VoteExpired
    );
    require!(
        !ctx.accounts.validator_vote.voters.contains(&validator_key),
        TrustExpressError::AlreadyVoted
    );
    require_keys_eq!(
        ctx.accounts.maker.key(),
        ctx.accounts.trust_express.maker,
        TrustExpressError::InvalidMaker
    );

    // ── 4. Record vote ────────────────────────────────────────────────────────
    let slot = ctx
        .accounts
        .validator_vote
        .voters
        .iter()
        .position(|v| *v == Pubkey::default())
        .ok_or(TrustExpressError::VoteSlotsFull)?;

    ctx.accounts.validator_vote.voters[slot] = validator_key;
    ctx.accounts.validator_vote.vote_results[slot] = vote;

    if vote {
        ctx.accounts.validator_vote.votes_for += 1;
    } else {
        ctx.accounts.validator_vote.votes_against += 1;
    }

    let votes_for = ctx.accounts.validator_vote.votes_for;
    let votes_against = ctx.accounts.validator_vote.votes_against;
    let threshold = ctx.accounts.global_state.required_votes;
    let val_count = ctx.accounts.global_state.validator_count;

    emit!(ValidatorVoteCastEvent {
        trust_express: ctx.accounts.trust_express.key(),
        validator: validator_key,
        payout_reference: payout_reference.clone(),
        vote,
        votes_for,
        votes_against,
        timestamp: clock.unix_timestamp,
    });

    msg!(
        "Buy vote by {} — approve: {}. Tally: {}/{} for, {} against",
        validator_key,
        vote,
        votes_for,
        threshold,
        votes_against,
    );

    // ── 5. Execute when threshold is reached ──────────────────────────────────
    let impossible_to_approve = votes_against > (val_count - threshold);
    let should_execute = votes_for >= threshold || impossible_to_approve;
    let execute_success = votes_for >= threshold;

    if should_execute {
        ctx.accounts.validator_vote.executed = true;
        ctx.accounts.global_state.active_vote_count = ctx
            .accounts
            .global_state
            .active_vote_count
            .saturating_sub(1);

        let te_maker = ctx.accounts.trust_express.maker;
        let te_seed_bytes = ctx.accounts.trust_express.seed.to_le_bytes();
        let te_bump = ctx.accounts.trust_express.bump;
        let te_fee_pct = ctx.accounts.trust_express.fee_percentage;
        let trust_express_key = ctx.accounts.trust_express.key();
        let mint_key = ctx.accounts.mint.key();
        let mint_decimals = ctx.accounts.mint.decimals;

        let seeds = &[
            b"trust-express" as &[u8],
            te_maker.as_ref(),
            &te_seed_bytes[..],
            &[te_bump],
        ];
        let signer_seeds = &[&seeds[..]];

        let pool_authority_bump = ctx.bumps.validator_fee_pool_authority;
        let pool_seeds = &[
            b"validator-fee-pool-authority" as &[u8],
            &[pool_authority_bump],
        ];
        let pool_signer_seeds = &[&pool_seeds[..]];

        // Find reservation
        let idx = ctx
            .accounts
            .trust_express
            .reserved_amounts
            .iter()
            .position(|r| {
                r.taker == taker && r.payout_reference.as_ref() == Some(&payout_reference)
            })
            .ok_or(TrustExpressError::ReservationNotFound)?;

        require!(
            ctx.accounts.trust_express.reserved_amounts[idx].status == 0,
            TrustExpressError::ReservationAlreadyProcessed
        );

        if execute_success {
            ctx.accounts.trust_express.reserved_amounts[idx].status = 2;

            // ── Fee calculation ───────────────────────────────────────────────
            let total_fee = if te_fee_pct > 0 {
                amount
                    .checked_mul(te_fee_pct as u64)
                    .ok_or(TrustExpressError::ArithmeticOverflow)?
                    .checked_div(10000)
                    .ok_or(TrustExpressError::ArithmeticOverflow)?
            } else {
                0
            };

            let (platform_fee, maker_fee, validator_pool_fee) = split_fee(total_fee)?;

            // ── Platform fee (20%) ────────────────────────────────────────────
            if platform_fee > 0 {
                require!(
                    ctx.accounts.fee_destination_ata.key() != Pubkey::default()
                        && *ctx.accounts.fee_destination_ata.owner != system_program::ID,
                    TrustExpressError::MissingFeeDestinationAta
                );
                token_interface::transfer_checked(
                    CpiContext::new_with_signer(
                        ctx.accounts.token_program.to_account_info(),
                        TransferChecked {
                            from: ctx.accounts.trust_express_ata.to_account_info(),
                            to: ctx.accounts.fee_destination_ata.to_account_info(),
                            authority: ctx.accounts.trust_express.to_account_info(),
                            mint: ctx.accounts.mint.to_account_info(),
                        },
                        signer_seeds,
                    ),
                    platform_fee,
                    mint_decimals,
                )?;
                msg!("Platform fee: {} tokens (20%)", platform_fee);
            }

            // ── Validator pool (20%) ──────────────────────────────────────────
            if validator_pool_fee > 0 {
                token_interface::transfer_checked(
                    CpiContext::new_with_signer(
                        ctx.accounts.token_program.to_account_info(),
                        TransferChecked {
                            from: ctx.accounts.trust_express_ata.to_account_info(),
                            to: ctx.accounts.validator_fee_pool_ata.to_account_info(),
                            authority: ctx.accounts.trust_express.to_account_info(),
                            mint: ctx.accounts.mint.to_account_info(),
                        },
                        signer_seeds,
                    ),
                    validator_pool_fee,
                    mint_decimals,
                )?;
                msg!("Validator pool: {} tokens (20%)", validator_pool_fee);
            }

            // ── Credit each voter's ValidatorEarnings PDA ─────────────────────
            let voters = ctx.accounts.validator_vote.voters;
            let uncredited = credit_validator_earnings(
                &voters,
                validator_pool_fee,
                mint_key,
                clock.unix_timestamp,
                validator_key,
                &ctx.accounts.validator.to_account_info(),
                ctx.remaining_accounts,
                &ctx.accounts.system_program.to_account_info(),
            )?;

            // Redirect any uncredited share from pool ATA back to platform
            if uncredited > 0 {
                require!(
                    ctx.accounts.fee_destination_ata.key() != Pubkey::default()
                        && *ctx.accounts.fee_destination_ata.owner != system_program::ID,
                    TrustExpressError::MissingFeeDestinationAta
                );
                token_interface::transfer_checked(
                    CpiContext::new_with_signer(
                        ctx.accounts.token_program.to_account_info(),
                        TransferChecked {
                            from: ctx.accounts.validator_fee_pool_ata.to_account_info(),
                            to: ctx.accounts.fee_destination_ata.to_account_info(),
                            authority: ctx.accounts.validator_fee_pool_authority.to_account_info(),
                            mint: ctx.accounts.mint.to_account_info(),
                        },
                        pool_signer_seeds,
                    ),
                    uncredited,
                    mint_decimals,
                )?;
                msg!(
                    "Redirected {} uncredited validator tokens to platform",
                    uncredited
                );
            }

            // ── Maker receives: (amount - total_fee) + maker_fee rebate (60%) ─
            // Net effect: maker pays only the 20% platform and 20% validator share
            let maker_receives = amount
                .checked_sub(total_fee)
                .ok_or(TrustExpressError::ArithmeticOverflow)?
                .checked_add(maker_fee)
                .ok_or(TrustExpressError::ArithmeticOverflow)?;

            if maker_receives > 0 {
                require!(
                    ctx.accounts.maker_ata.key() != Pubkey::default()
                        && *ctx.accounts.maker_ata.owner != system_program::ID,
                    TrustExpressError::MissingMakerAta
                );
                let owner =
                    get_token_account_owner(&ctx.accounts.maker_ata, &ctx.accounts.token_program)?;
                require_keys_eq!(
                    owner,
                    ctx.accounts.maker.key(),
                    TrustExpressError::InvalidMakerAtaAuthority
                );

                token_interface::transfer_checked(
                    CpiContext::new_with_signer(
                        ctx.accounts.token_program.to_account_info(),
                        TransferChecked {
                            from: ctx.accounts.trust_express_ata.to_account_info(),
                            to: ctx.accounts.maker_ata.to_account_info(),
                            authority: ctx.accounts.trust_express.to_account_info(),
                            mint: ctx.accounts.mint.to_account_info(),
                        },
                        signer_seeds,
                    ),
                    maker_receives,
                    mint_decimals,
                )?;
                msg!(
                    "Maker received {} tokens (principal - total_fee + 60% rebate: {} + {})",
                    maker_receives,
                    amount.saturating_sub(total_fee),
                    maker_fee
                );
            }

            // ── Global stats ──────────────────────────────────────────────────
            ctx.accounts.global_state.total_volume = ctx
                .accounts
                .global_state
                .total_volume
                .checked_add(amount)
                .ok_or(TrustExpressError::ArithmeticOverflow)?;
            ctx.accounts.global_state.total_confirmations += 1;
            if total_fee > 0 {
                ctx.accounts.global_state.total_fees_collected = ctx
                    .accounts
                    .global_state
                    .total_fees_collected
                    .checked_add(total_fee)
                    .ok_or(TrustExpressError::ArithmeticOverflow)?;
            }
        } else {
            // ── Rejected — refund taker, restore available amount ─────────────
            ctx.accounts.trust_express.amount = ctx
                .accounts
                .trust_express
                .amount
                .checked_add(amount)
                .ok_or(TrustExpressError::ArithmeticOverflow)?;

            require!(
                ctx.accounts.taker_ata.key() != Pubkey::default()
                    && *ctx.accounts.taker_ata.owner != system_program::ID,
                TrustExpressError::MissingTakerAtaForRefund
            );
            token_interface::transfer_checked(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    TransferChecked {
                        from: ctx.accounts.trust_express_ata.to_account_info(),
                        to: ctx.accounts.taker_ata.to_account_info(),
                        authority: ctx.accounts.trust_express.to_account_info(),
                        mint: ctx.accounts.mint.to_account_info(),
                    },
                    signer_seeds,
                ),
                amount,
                mint_decimals,
            )?;
            msg!("Payment rejected — {} tokens returned to taker", amount);
        }

        ctx.accounts.trust_express.reserved_amounts.remove(idx);

        emit!(ValidatorVoteExecutedEvent {
            trust_express: trust_express_key,
            taker,
            payout_reference: payout_reference.clone(),
            success: execute_success,
            message: evidence,
            amount,
            fiat_amount,
            currency,
            timestamp: clock.unix_timestamp,
        });

        // ─────────────────────────────────────────────────────────────────────
        // BUY-ORDER CLOSE CHECK
        // Close only when ALL THREE hold:
        //   1. trust_express.amount == 0  → no remaining unfilled capacity
        //      (decremented at reservation time, so > 0 on partial fills)
        //   2. no active reservations     → no in-flight votes pending
        //   3. ATA balance <= dust        → all taker tokens paid out
        // ─────────────────────────────────────────────────────────────────────
        let order_fully_consumed = ctx.accounts.trust_express.amount == 0;
        let has_active_reservations = ctx
            .accounts
            .trust_express
            .reserved_amounts
            .iter()
            .any(|r| r.status == 0);
        let active_reservation_count = ctx
            .accounts
            .trust_express
            .reserved_amounts
            .iter()
            .filter(|r| r.status == 0)
            .count();
        let total_reservation_count = ctx.accounts.trust_express.reserved_amounts.len();

        ctx.accounts.trust_express_ata.reload()?;
        let remaining_balance = ctx.accounts.trust_express_ata.amount;
        let dust_threshold = compute_dust_threshold(mint_decimals);

        msg!(
            "🔍 BUY CLOSE CHECK | amount_remaining={} order_fully_consumed={} | active_reservations={}/{} has_active={} | ata_balance={} dust_threshold={} | will_close={}",
            ctx.accounts.trust_express.amount,
            order_fully_consumed,
            active_reservation_count,
            total_reservation_count,
            has_active_reservations,
            remaining_balance,
            dust_threshold,
            order_fully_consumed && !has_active_reservations && remaining_balance <= dust_threshold,
        );

        if order_fully_consumed && !has_active_reservations && remaining_balance <= dust_threshold {
            if remaining_balance > 0 {
                if ctx.accounts.maker_ata.key() != Pubkey::default()
                    && *ctx.accounts.maker_ata.owner != system_program::ID
                {
                    token_interface::transfer_checked(
                        CpiContext::new_with_signer(
                            ctx.accounts.token_program.to_account_info(),
                            TransferChecked {
                                from: ctx.accounts.trust_express_ata.to_account_info(),
                                to: ctx.accounts.maker_ata.to_account_info(),
                                authority: ctx.accounts.trust_express.to_account_info(),
                                mint: ctx.accounts.mint.to_account_info(),
                            },
                            signer_seeds,
                        ),
                        remaining_balance,
                        mint_decimals,
                    )?;
                    msg!("Dust swept to maker: {} tokens", remaining_balance);
                }
            }

            token_interface::close_account(CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                CloseAccount {
                    account: ctx.accounts.trust_express_ata.to_account_info(),
                    destination: ctx.accounts.maker.to_account_info(),
                    authority: ctx.accounts.trust_express.to_account_info(),
                },
                signer_seeds,
            ))?;
            msg!("Trust express ATA closed, rent returned to maker");

            let trust_express_info = ctx.accounts.trust_express.to_account_info();
            let trust_express_lamports = trust_express_info.lamports();
            **ctx.accounts.maker.lamports.borrow_mut() = ctx
                .accounts
                .maker
                .lamports()
                .checked_add(trust_express_lamports)
                .ok_or(TrustExpressError::ArithmeticOverflow)?;
            **trust_express_info.lamports.borrow_mut() = 0;
            let mut data = trust_express_info.try_borrow_mut_data()?;
            for byte in data.iter_mut() {
                *byte = 0;
            }

            ctx.accounts.global_state.total_trust_express_closed += 1;
            emit!(ExpressClosedEvent {
                trust_express: trust_express_key,
                maker: te_maker,
                remaining_amount: 0,
            });
            msg!("TrustExpress buy order closed after final vote execution");
        }
    }

    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// SELL-SIDE vote
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(reference_hash: [u8; 32])]
pub struct SubmitSellVote<'info> {
    /// Must be a registered validator
    #[account(mut)]
    pub validator: Signer<'info>,

    #[account(
        mut,
        seeds = [b"global-state"],
        bump = global_state.bump,
    )]
    pub global_state: Account<'info, GlobalState>,

    #[account(
        mut,
        seeds = [
            b"trust-express",
            trust_express.maker.as_ref(),
            &trust_express.seed.to_le_bytes(),
        ],
        bump = trust_express.bump,
    )]
    pub trust_express: Account<'info, TrustExpress>,

    #[account(
        init_if_needed,
        payer = validator,
        space = 8 + ValidatorVote::INIT_SPACE,
        seeds = [
            b"validator-vote",
            trust_express.key().as_ref(),
            reference_hash.as_ref(),
        ],
        bump
    )]
    pub validator_vote: Account<'info, ValidatorVote>,

    /// CHECK: Validated against trust_express.maker
    #[account(mut)]
    pub maker: AccountInfo<'info>,

    #[account(mint::token_program = token_program)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        mut,
        token::mint = mint,
        token::authority = trust_express,
        token::token_program = token_program,
    )]
    pub trust_express_ata: Box<InterfaceAccount<'info, TokenAccount>>,

    /// CHECK: Platform fee destination ATA — receives 20% of fee
    #[account(mut)]
    pub fee_destination_ata: AccountInfo<'info>,

    /// CHECK: Taker (buyer) ATA — receives tokens on success
    #[account(mut)]
    pub taker_ata: AccountInfo<'info>,

    /// CHECK: Maker ATA — receives 60% fee rebate + dust sweep on close
    #[account(mut)]
    pub maker_ata: AccountInfo<'info>,

    /// CHECK: Dedicated pool authority PDA — signs validator pool ATA transfers
    /// Validated against global_state.validator_fee_pool_authority in handler
    #[account(
        seeds = [b"validator-fee-pool-authority"],
        bump,
    )]
    pub validator_fee_pool_authority: AccountInfo<'info>,

    /// Pool ATA accumulating the validator 20% share for this mint
    #[account(
        init_if_needed,
        payer = validator,
        associated_token::mint = mint,
        associated_token::authority = validator_fee_pool_authority,
        associated_token::token_program = token_program,
    )]
    pub validator_fee_pool_ata: Box<InterfaceAccount<'info, TokenAccount>>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    // remaining_accounts: up to 5 ValidatorEarnings PDAs (one per voter)
}

pub fn submit_sell_vote<'info>(
    ctx: Context<'_, '_, '_, 'info, SubmitSellVote<'info>>,
    reference_hash: [u8; 32],
    payout_reference: String,
    taker: Pubkey,
    vote: bool,
    evidence: String,
) -> Result<()> {
    let validator_key = ctx.accounts.validator.key();

    // ── 0. Verify the caller-supplied hash matches what we'd derive ourselves ─
    let expected_hash = self::reference_hash(&payout_reference);
    require!(
        reference_hash == expected_hash,
        TrustExpressError::InvalidReferenceHash
    );

    // ── 1. Confirm registered validator ──────────────────────────────────────
    require!(
        ctx.accounts
            .global_state
            .validators
            .contains(&validator_key),
        TrustExpressError::UnauthorizedValidator
    );

    // Verify pool authority matches global state
    require_keys_eq!(
        ctx.accounts.validator_fee_pool_authority.key(),
        ctx.accounts.global_state.validator_fee_pool_authority,
        TrustExpressError::InvalidPoolAuthority
    );

    // ── 2. Initialise on first vote ───────────────────────────────────────────
    let clock = Clock::get()?;
    {
        let va = &mut ctx.accounts.validator_vote;
        if !va.executed && va.created_at == 0 {
            va.trust_express = ctx.accounts.trust_express.key();
            va.taker = taker;
            va.reference_hash = reference_hash;
            va.votes_for = 0;
            va.votes_against = 0;
            va.voters = [Pubkey::default(); 5];
            va.vote_results = [false; 5];
            va.executed = false;
            va.created_at = clock.unix_timestamp;
            va.expires_at = clock.unix_timestamp + VOTE_EXPIRY_SECONDS;
            va.is_buy_order = false;
            va.bump = ctx.bumps.validator_vote;
            ctx.accounts.global_state.active_vote_count += 1;
        }
    }

    // ── 3. Guard checks ───────────────────────────────────────────────────────
    require!(
        !ctx.accounts.validator_vote.executed,
        TrustExpressError::VoteAlreadyExecuted
    );
    require!(
        clock.unix_timestamp < ctx.accounts.validator_vote.expires_at,
        TrustExpressError::VoteExpired
    );
    require!(
        !ctx.accounts.validator_vote.voters.contains(&validator_key),
        TrustExpressError::AlreadyVoted
    );
    require_keys_eq!(
        ctx.accounts.maker.key(),
        ctx.accounts.trust_express.maker,
        TrustExpressError::InvalidMaker
    );

    // ── 4. Record vote ────────────────────────────────────────────────────────
    let slot = ctx
        .accounts
        .validator_vote
        .voters
        .iter()
        .position(|v| *v == Pubkey::default())
        .ok_or(TrustExpressError::VoteSlotsFull)?;

    ctx.accounts.validator_vote.voters[slot] = validator_key;
    ctx.accounts.validator_vote.vote_results[slot] = vote;

    if vote {
        ctx.accounts.validator_vote.votes_for += 1;
    } else {
        ctx.accounts.validator_vote.votes_against += 1;
    }

    let votes_for = ctx.accounts.validator_vote.votes_for;
    let votes_against = ctx.accounts.validator_vote.votes_against;
    let threshold = ctx.accounts.global_state.required_votes;
    let val_count = ctx.accounts.global_state.validator_count;

    emit!(ValidatorVoteCastEvent {
        trust_express: ctx.accounts.trust_express.key(),
        validator: validator_key,
        payout_reference: payout_reference.clone(),
        vote,
        votes_for,
        votes_against,
        timestamp: clock.unix_timestamp,
    });

    msg!(
        "Sell vote by {} — approve: {}. Tally: {}/{} for, {} against",
        validator_key,
        vote,
        votes_for,
        threshold,
        votes_against,
    );

    // ── 5. Execute when threshold reached ─────────────────────────────────────
    let impossible_to_approve = votes_against > (val_count - threshold);
    let should_execute = votes_for >= threshold || impossible_to_approve;
    let execute_success = votes_for >= threshold;

    if should_execute {
        ctx.accounts.validator_vote.executed = true;
        ctx.accounts.global_state.active_vote_count = ctx
            .accounts
            .global_state
            .active_vote_count
            .saturating_sub(1);

        let te_maker = ctx.accounts.trust_express.maker;
        let te_seed_bytes = ctx.accounts.trust_express.seed.to_le_bytes();
        let te_bump = ctx.accounts.trust_express.bump;
        let te_fee_pct = ctx.accounts.trust_express.fee_percentage;
        let trust_express_key = ctx.accounts.trust_express.key();
        let currency = String::from_utf8_lossy(&ctx.accounts.trust_express.currency).to_string();
        let mint_key = ctx.accounts.mint.key();
        let mint_decimals = ctx.accounts.mint.decimals;

        let seeds = &[
            b"trust-express" as &[u8],
            te_maker.as_ref(),
            &te_seed_bytes[..],
            &[te_bump],
        ];
        let signer_seeds = &[&seeds[..]];

        let pool_authority_bump = ctx.bumps.validator_fee_pool_authority;
        let pool_seeds = &[
            b"validator-fee-pool-authority" as &[u8],
            &[pool_authority_bump],
        ];
        let pool_signer_seeds = &[&pool_seeds[..]];

        let idx = ctx
            .accounts
            .trust_express
            .reserved_amounts
            .iter()
            .position(|r| {
                r.taker == taker && r.payout_reference.as_ref() == Some(&payout_reference)
            })
            .ok_or(TrustExpressError::ReservationNotFound)?;

        require!(
            ctx.accounts.trust_express.reserved_amounts[idx].status == 0,
            TrustExpressError::ReservationAlreadyProcessed
        );

        let amount = ctx.accounts.trust_express.reserved_amounts[idx].amount;
        let fiat_amount = ctx.accounts.trust_express.reserved_amounts[idx].fiat_amount;

        if execute_success {
            // ── Fee calculation ───────────────────────────────────────────────
            // Fee is charged from the taker's token amount at settlement.
            // Maker gets a 60% rebate; taker receives the net amount.
            let total_fee = if te_fee_pct > 0 {
                amount
                    .checked_mul(te_fee_pct as u64)
                    .ok_or(TrustExpressError::ArithmeticOverflow)?
                    .checked_div(10000)
                    .ok_or(TrustExpressError::ArithmeticOverflow)?
            } else {
                0
            };

            let (platform_fee, maker_fee, validator_pool_fee) = split_fee(total_fee)?;

            // Taker receives tokens minus the total fee
            let taker_receives = amount
                .checked_sub(total_fee)
                .ok_or(TrustExpressError::ArithmeticOverflow)?;

            // ── Platform fee (20%) ────────────────────────────────────────────
            if platform_fee > 0 {
                require!(
                    ctx.accounts.fee_destination_ata.key() != Pubkey::default()
                        && *ctx.accounts.fee_destination_ata.owner != system_program::ID,
                    TrustExpressError::MissingFeeDestinationAta
                );
                token_interface::transfer_checked(
                    CpiContext::new_with_signer(
                        ctx.accounts.token_program.to_account_info(),
                        TransferChecked {
                            from: ctx.accounts.trust_express_ata.to_account_info(),
                            to: ctx.accounts.fee_destination_ata.to_account_info(),
                            authority: ctx.accounts.trust_express.to_account_info(),
                            mint: ctx.accounts.mint.to_account_info(),
                        },
                        signer_seeds,
                    ),
                    platform_fee,
                    mint_decimals,
                )?;
                msg!("Platform fee: {} tokens (20%)", platform_fee);
            }

            // ── Validator pool (20%) ──────────────────────────────────────────
            if validator_pool_fee > 0 {
                token_interface::transfer_checked(
                    CpiContext::new_with_signer(
                        ctx.accounts.token_program.to_account_info(),
                        TransferChecked {
                            from: ctx.accounts.trust_express_ata.to_account_info(),
                            to: ctx.accounts.validator_fee_pool_ata.to_account_info(),
                            authority: ctx.accounts.trust_express.to_account_info(),
                            mint: ctx.accounts.mint.to_account_info(),
                        },
                        signer_seeds,
                    ),
                    validator_pool_fee,
                    mint_decimals,
                )?;
                msg!("Validator pool: {} tokens (20%)", validator_pool_fee);
            }

            // ── Credit each voter's ValidatorEarnings PDA ─────────────────────
            let voters = ctx.accounts.validator_vote.voters;
            let uncredited = credit_validator_earnings(
                &voters,
                validator_pool_fee,
                mint_key,
                clock.unix_timestamp,
                validator_key,
                &ctx.accounts.validator.to_account_info(),
                ctx.remaining_accounts,
                &ctx.accounts.system_program.to_account_info(),
            )?;

            // Redirect any uncredited share from pool ATA back to platform
            if uncredited > 0 {
                require!(
                    ctx.accounts.fee_destination_ata.key() != Pubkey::default()
                        && *ctx.accounts.fee_destination_ata.owner != system_program::ID,
                    TrustExpressError::MissingFeeDestinationAta
                );
                token_interface::transfer_checked(
                    CpiContext::new_with_signer(
                        ctx.accounts.token_program.to_account_info(),
                        TransferChecked {
                            from: ctx.accounts.validator_fee_pool_ata.to_account_info(),
                            to: ctx.accounts.fee_destination_ata.to_account_info(),
                            authority: ctx.accounts.validator_fee_pool_authority.to_account_info(),
                            mint: ctx.accounts.mint.to_account_info(),
                        },
                        pool_signer_seeds,
                    ),
                    uncredited,
                    mint_decimals,
                )?;
                msg!(
                    "Redirected {} uncredited validator tokens to platform",
                    uncredited
                );
            }

            // ── Maker fee rebate (60%) ────────────────────────────────────────
            // Maker receives 60% of the fee back as a rebate.
            if maker_fee > 0 {
                if ctx.accounts.maker_ata.key() != Pubkey::default()
                    && *ctx.accounts.maker_ata.owner != system_program::ID
                {
                    token_interface::transfer_checked(
                        CpiContext::new_with_signer(
                            ctx.accounts.token_program.to_account_info(),
                            TransferChecked {
                                from: ctx.accounts.trust_express_ata.to_account_info(),
                                to: ctx.accounts.maker_ata.to_account_info(),
                                authority: ctx.accounts.trust_express.to_account_info(),
                                mint: ctx.accounts.mint.to_account_info(),
                            },
                            signer_seeds,
                        ),
                        maker_fee,
                        mint_decimals,
                    )?;
                    msg!(
                        "Maker fee rebate: {} tokens (60% of fee returned to seller)",
                        maker_fee
                    );
                }
            }

            // ── Token transfer to buyer (taker) ───────────────────────────────
            // Taker receives the reserved amount minus the total fee.
            require!(
                ctx.accounts.taker_ata.key() != Pubkey::default()
                    && *ctx.accounts.taker_ata.owner != system_program::ID,
                TrustExpressError::MissingTakerAta
            );
            let owner =
                get_token_account_owner(&ctx.accounts.taker_ata, &ctx.accounts.token_program)?;
            require_keys_eq!(owner, taker, TrustExpressError::InvalidTakerAtaAuthority);

            token_interface::transfer_checked(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    TransferChecked {
                        from: ctx.accounts.trust_express_ata.to_account_info(),
                        to: ctx.accounts.taker_ata.to_account_info(),
                        authority: ctx.accounts.trust_express.to_account_info(),
                        mint: ctx.accounts.mint.to_account_info(),
                    },
                    signer_seeds,
                ),
                taker_receives,
                mint_decimals,
            )?;
            msg!(
                "Transferred {} tokens to buyer {} ({} fee deducted)",
                taker_receives,
                taker,
                total_fee
            );

            // ── Global stats ──────────────────────────────────────────────────
            ctx.accounts.global_state.total_volume = ctx
                .accounts
                .global_state
                .total_volume
                .checked_add(amount)
                .ok_or(TrustExpressError::ArithmeticOverflow)?;
            ctx.accounts.global_state.total_confirmations += 1;
            if total_fee > 0 {
                ctx.accounts.global_state.total_fees_collected = ctx
                    .accounts
                    .global_state
                    .total_fees_collected
                    .checked_add(total_fee)
                    .ok_or(TrustExpressError::ArithmeticOverflow)?;
            }

            ctx.accounts.trust_express.reserved_amounts[idx].status = 2;
        } else {
            // ── Rejected — restore tokens to available pool ───────────────────
            ctx.accounts.trust_express.amount = ctx
                .accounts
                .trust_express
                .amount
                .checked_add(amount)
                .ok_or(TrustExpressError::ArithmeticOverflow)?;
            msg!("Payment rejected — {} tokens returned to pool", amount);
        }

        ctx.accounts.trust_express.reserved_amounts.remove(idx);

        emit!(ValidatorVoteExecutedEvent {
            trust_express: trust_express_key,
            taker,
            payout_reference: payout_reference.clone(),
            success: execute_success,
            message: evidence,
            amount,
            fiat_amount,
            currency,
            timestamp: clock.unix_timestamp,
        });

        // ─────────────────────────────────────────────────────────────────────
        // SELL-ORDER CLOSE CHECK
        // ATA balance after reload is the ground truth — if dust with no
        // pending reservations the escrow is fully consumed and should close.
        // ─────────────────────────────────────────────────────────────────────
        let has_active_reservations = ctx
            .accounts
            .trust_express
            .reserved_amounts
            .iter()
            .any(|r| r.status == 0);

        ctx.accounts.trust_express_ata.reload()?;
        let remaining_balance = ctx.accounts.trust_express_ata.amount;
        let dust_threshold = compute_dust_threshold(mint_decimals);

        if !has_active_reservations && remaining_balance <= dust_threshold {
            if remaining_balance > 0 {
                if ctx.accounts.maker_ata.key() != Pubkey::default()
                    && *ctx.accounts.maker_ata.owner != system_program::ID
                {
                    token_interface::transfer_checked(
                        CpiContext::new_with_signer(
                            ctx.accounts.token_program.to_account_info(),
                            TransferChecked {
                                from: ctx.accounts.trust_express_ata.to_account_info(),
                                to: ctx.accounts.maker_ata.to_account_info(),
                                authority: ctx.accounts.trust_express.to_account_info(),
                                mint: ctx.accounts.mint.to_account_info(),
                            },
                            signer_seeds,
                        ),
                        remaining_balance,
                        mint_decimals,
                    )?;
                    msg!("Dust swept to seller: {} tokens", remaining_balance);
                }
            }

            token_interface::close_account(CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                CloseAccount {
                    account: ctx.accounts.trust_express_ata.to_account_info(),
                    destination: ctx.accounts.maker.to_account_info(),
                    authority: ctx.accounts.trust_express.to_account_info(),
                },
                signer_seeds,
            ))?;
            msg!("Trust express ATA closed, rent returned to seller");

            let trust_express_info = ctx.accounts.trust_express.to_account_info();
            let trust_express_lamports = trust_express_info.lamports();
            **ctx.accounts.maker.lamports.borrow_mut() = ctx
                .accounts
                .maker
                .lamports()
                .checked_add(trust_express_lamports)
                .ok_or(TrustExpressError::ArithmeticOverflow)?;
            **trust_express_info.lamports.borrow_mut() = 0;
            let mut data = trust_express_info.try_borrow_mut_data()?;
            for byte in data.iter_mut() {
                *byte = 0;
            }

            ctx.accounts.global_state.total_trust_express_closed += 1;
            emit!(ExpressClosedEvent {
                trust_express: trust_express_key,
                maker: te_maker,
                remaining_amount: 0,
            });
            msg!("TrustExpress sell order closed after final vote execution");
        }
    }

    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// Finalize expired vote (anyone can call after expires_at)
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct FinalizeExpiredVote<'info> {
    /// Anyone can call — they receive the vote account's rent as reward
    #[account(mut)]
    pub caller: Signer<'info>,

    #[account(
        mut,
        seeds = [b"global-state"],
        bump = global_state.bump,
    )]
    pub global_state: Account<'info, GlobalState>,

    #[account(
        mut,
        seeds = [
            b"validator-vote",
            trust_express.key().as_ref(),
            &validator_vote.reference_hash,
        ],
        bump = validator_vote.bump,
        close = caller,
    )]
    pub validator_vote: Account<'info, ValidatorVote>,

    #[account(
        mut,
        seeds = [
            b"trust-express",
            trust_express.maker.as_ref(),
            &trust_express.seed.to_le_bytes(),
        ],
        bump = trust_express.bump,
    )]
    pub trust_express: Account<'info, TrustExpress>,

    #[account(mint::token_program = token_program)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        mut,
        token::mint = mint,
        token::authority = trust_express,
        token::token_program = token_program,
    )]
    pub trust_express_ata: Box<InterfaceAccount<'info, TokenAccount>>,

    /// CHECK: Taker ATA for refund
    #[account(mut)]
    pub taker_ata: AccountInfo<'info>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn finalize_expired_vote(
    ctx: Context<FinalizeExpiredVote>,
    payout_reference: String,
) -> Result<()> {
    let clock = Clock::get()?;

    require!(
        !ctx.accounts.validator_vote.executed,
        TrustExpressError::VoteAlreadyExecuted
    );
    require!(
        clock.unix_timestamp >= ctx.accounts.validator_vote.expires_at,
        TrustExpressError::VoteNotYetExpired
    );

    // Verify the payout_reference matches the hash stored in the vote account
    let expected_hash = self::reference_hash(&payout_reference);
    require!(
        ctx.accounts.validator_vote.reference_hash == expected_hash,
        TrustExpressError::InvalidReferenceHash
    );

    ctx.accounts.global_state.active_vote_count = ctx
        .accounts
        .global_state
        .active_vote_count
        .saturating_sub(1);

    let taker = ctx.accounts.validator_vote.taker;
    let te_maker = ctx.accounts.trust_express.maker;
    let te_seed_bytes = ctx.accounts.trust_express.seed.to_le_bytes();
    let te_bump = ctx.accounts.trust_express.bump;

    let idx = ctx
        .accounts
        .trust_express
        .reserved_amounts
        .iter()
        .position(|r| {
            r.taker == taker
                && r.status == 0
                && r.payout_reference.as_deref() == Some(payout_reference.as_str())
        })
        .ok_or(TrustExpressError::ReservationNotFound)?;

    let amount = ctx.accounts.trust_express.reserved_amounts[idx].amount;

    let seeds = &[
        b"trust-express" as &[u8],
        te_maker.as_ref(),
        &te_seed_bytes[..],
        &[te_bump],
    ];
    let signer_seeds = &[&seeds[..]];

    require!(
        ctx.accounts.taker_ata.key() != Pubkey::default()
            && *ctx.accounts.taker_ata.owner != system_program::ID,
        TrustExpressError::MissingTakerAtaForRefund
    );

    token_interface::transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.trust_express_ata.to_account_info(),
                to: ctx.accounts.taker_ata.to_account_info(),
                authority: ctx.accounts.trust_express.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
        ctx.accounts.mint.decimals,
    )?;

    // For buy orders: restore the available amount so the order stays alive
    if ctx.accounts.validator_vote.is_buy_order {
        ctx.accounts.trust_express.amount = ctx
            .accounts
            .trust_express
            .amount
            .checked_add(amount)
            .ok_or(TrustExpressError::ArithmeticOverflow)?;
        msg!(
            "Buy order expired — {} tokens refunded and capacity restored",
            amount
        );
    }

    ctx.accounts.trust_express.reserved_amounts[idx].status = 3;
    ctx.accounts.trust_express.reserved_amounts.remove(idx);

    msg!(
        "Expired vote finalized — refunded {} tokens to taker {}",
        amount,
        taker
    );

    // validator_vote PDA closed by Anchor's `close = caller` constraint

    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// Close executed vote (anyone can call to reclaim rent)
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct CloseExecutedVote<'info> {
    /// Anyone can call — they receive the vote account rent as reward
    #[account(mut)]
    pub caller: Signer<'info>,

    #[account(
        mut,
        close = caller,
        constraint = validator_vote.executed @ TrustExpressError::VoteNotYetExecuted,
        seeds = [
            b"validator-vote",
            validator_vote.trust_express.as_ref(),
            &validator_vote.reference_hash,
        ],
        bump = validator_vote.bump,
    )]
    pub validator_vote: Account<'info, ValidatorVote>,

    pub system_program: Program<'info, System>,
}

pub fn close_executed_vote(_ctx: Context<CloseExecutedVote>) -> Result<()> {
    // Anchor's `close = caller` handles the rent reclaim.
    // The constraint already verified `executed == true` before we get here.
    Ok(())
}
