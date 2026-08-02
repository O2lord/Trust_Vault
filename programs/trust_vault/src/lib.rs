use anchor_lang::prelude::*;

pub mod constants;
pub use constants::*;

pub mod error;
pub use error::*;

pub mod events;
pub use events::*;

pub mod instructions;
pub use instructions::*;

pub mod state;
pub use state::*;

pub mod utils;
pub use utils::*;

declare_id!("6gHrdm5AtG8TFvMknv5ZBEt1CHpKwBEToVbEaGBL8r7M");

#[program]
pub mod trust_vault {
    use super::*;

    pub fn initialize_global_state(ctx: Context<InitializeGlobalState>) -> Result<()> {
        instructions::admin::initialize_global_state::initialize_global_state(ctx)
    }

    // ==================== BUY ORDER FUNCTIONS ====================

    pub fn create_express_buy_order(
        ctx: Context<CreateExpressBuyOrder>,
        seed: u64,
        amount: u64,
        price_per_token: u64,
        currency: String,
        payment_instructions: String,
        flutterwave_credential_id: String,
    ) -> Result<()> {
        instructions::buy::create_buy_order::create_express_buy_order(
            ctx,
            seed,
            amount,
            price_per_token,
            currency,
            payment_instructions,
            flutterwave_credential_id,
        )
    }

    pub fn cancel_or_reduce_buy_order(
        ctx: Context<CancelOrReduceBuyOrder>,
        new_amount: u64,
    ) -> Result<()> {
        instructions::buy::cancel_buy_order::cancel_or_reduce_buy_order(ctx, new_amount)
    }

    pub fn instant_reserve(
        ctx: Context<InstantReserve>,
        amount: u64,
        fiat_amount: u64,
        currency: String,
        payout_details: Option<String>,
    ) -> Result<()> {
        instructions::buy::instant_reserve::handler(
            ctx,
            amount,
            fiat_amount,
            currency,
            payout_details,
        )
    }

    // NOTE: confirm_payout (single-bot) is intentionally kept for now so
    // existing tests pass. Once validators are live and tested, remove it.
    pub fn confirm_payout(
        ctx: Context<ConfirmPayout>,
        taker: Pubkey,
        amount: u64,
        fiat_amount: u64,
        currency: String,
        payout_reference: String,
        success: bool,
        message: String,
    ) -> Result<()> {
        instructions::buy::confirm_payout::handler(
            ctx,
            taker,
            amount,
            fiat_amount,
            currency,
            payout_reference,
            success,
            message,
        )
    }

    // ==================== SELL ORDER FUNCTIONS ====================

    pub fn create_express_sell(
        ctx: Context<CreateExpressSellOrder>,
        seed: u64,
        amount: u64,
        price_per_token: u64,
        currency: String,
        payment_instructions: String,
        flutterwave_credential_id: String,
    ) -> Result<()> {
        instructions::sell::create_sell_order::create_express_sell_order(
            ctx,
            seed,
            amount,
            price_per_token,
            currency,
            payment_instructions,
            flutterwave_credential_id,
        )
    }

    pub fn instant_sell_reserve(
        ctx: Context<InstantSellReserve>,
        amount: u64,
        payment_mode: u8,
        payout_details: Option<String>,
        payout_reference: String,
    ) -> Result<()> {
        instructions::sell::instant_sell_reserve::handler(
            ctx,
            amount,
            payment_mode,
            payout_details,
            payout_reference,
        )
    }

    // NOTE: confirm_sell_payment kept alongside validator path for migration.
    pub fn confirm_sell_payment(
        ctx: Context<ConfirmSellPayment>,
        taker: Pubkey,
        payout_reference: String,
        success: bool,
        message: String,
    ) -> Result<()> {
        instructions::sell::confirm_sell_payment::handler(
            ctx,
            taker,
            payout_reference,
            success,
            message,
        )
    }

    pub fn express_withdraw(ctx: Context<ExpressWithdraw>, withdraw_amount: u64) -> Result<()> {
        instructions::sell::express_withdraw::handler(ctx, withdraw_amount)
    }

    // ==================== GENERAL FUNCTIONS ====================

    pub fn update_price(ctx: Context<UpdatePrice>, new_price_per_token: u64) -> Result<()> {
        instructions::common::update_price::update_price(ctx, new_price_per_token)
    }

    // ==================== ADMIN PAUSE FUNCTIONS ====================

    pub fn pause_buy_orders(ctx: Context<PauseGlobalOrders>, paused: bool) -> Result<()> {
        instructions::admin::pause_orders::pause_buy_orders(ctx, paused)
    }

    pub fn pause_sell_orders(ctx: Context<PauseGlobalOrders>, paused: bool) -> Result<()> {
        instructions::admin::pause_orders::pause_sell_orders(ctx, paused)
    }

    // ==================== ADMIN FEE FUNCTIONS ====================

    pub fn update_fee_percentage(ctx: Context<UpdateFee>, new_fee_percentage: u16) -> Result<()> {
        instructions::admin::fee_management::update_fee_percentage(ctx, new_fee_percentage)
    }

    pub fn update_fee_destination(
        ctx: Context<UpdateFee>,
        new_fee_destination: Pubkey,
    ) -> Result<()> {
        instructions::admin::fee_management::update_fee_destination(ctx, new_fee_destination)
    }

    // ==================== ADMIN GLOBAL STATS ====================

    pub fn set_global_stats(
        ctx: Context<SetGlobalStats>,
        total_volume: Option<u64>,
        total_confirmations: Option<u64>,
        total_trust_express_created: Option<u64>,
        total_trust_express_closed: Option<u64>,
        total_fees_collected: Option<u64>,
    ) -> Result<()> {
        instructions::admin::set_global_stats::set_global_stats(
            ctx,
            total_volume,
            total_confirmations,
            total_trust_express_created,
            total_trust_express_closed,
            total_fees_collected,
        )
    }

    // ==================== VALIDATOR MANAGEMENT ====================

    /// Register a new validator pubkey into the 5-slot registry.
    /// Only the authority can call this.
    pub fn register_validator(
        ctx: Context<ManageValidator>,
        validator_pubkey: Pubkey,
    ) -> Result<()> {
        instructions::admin::validator_management::register_validator(ctx, validator_pubkey)
    }

    /// Remove a validator from the registry.
    pub fn remove_validator(ctx: Context<ManageValidator>, validator_pubkey: Pubkey) -> Result<()> {
        instructions::admin::validator_management::remove_validator(ctx, validator_pubkey)
    }

    /// Change the vote threshold (1–5, must not exceed validator_count).
    pub fn update_required_votes(ctx: Context<ManageValidator>, required_votes: u8) -> Result<()> {
        instructions::admin::validator_management::update_required_votes(ctx, required_votes)
    }

    // ==================== VALIDATOR VOTING ====================

    /// Cast a vote on a buy-order payout (replaces the single-bot confirm_payout).
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
        instructions::validator::submit_validator_vote::submit_buy_vote(
            ctx,
            reference_hash,
            payout_reference,
            taker,
            amount,
            fiat_amount,
            currency,
            vote,
            evidence,
        )
    }

    /// Cast a vote on a sell-order payment confirmation.
    pub fn submit_sell_vote<'info>(
        ctx: Context<'_, '_, '_, 'info, SubmitSellVote<'info>>,
        reference_hash: [u8; 32],
        payout_reference: String,
        taker: Pubkey,
        vote: bool,
        evidence: String,
    ) -> Result<()> {
        instructions::validator::submit_validator_vote::submit_sell_vote(
            ctx,
            reference_hash,
            payout_reference,
            taker,
            vote,
            evidence,
        )
    }

    /// Anyone can call this after a vote account has expired without consensus.
    /// Always triggers a full refund to the taker.
    pub fn finalize_expired_vote(
        ctx: Context<FinalizeExpiredVote>,
        payout_reference: String,
    ) -> Result<()> {
        instructions::validator::submit_validator_vote::finalize_expired_vote(ctx, payout_reference)
    }

    // ==================== VALIDATOR FEE CLAIMS ====================

    /// Validators call this to withdraw their accumulated fee earnings for a
    /// specific token mint. Transfers from the validator fee pool ATA to the
    /// validator's own ATA and resets their accumulated balance to zero.
    pub fn claim_validator_fees(ctx: Context<ClaimValidatorFees>) -> Result<()> {
        instructions::validator::claim_validator_fees::claim_validator_fees(ctx)
    }

    pub fn close_executed_vote(ctx: Context<CloseExecutedVote>) -> Result<()> {
        instructions::validator::submit_validator_vote::close_executed_vote(ctx)
    }
}
