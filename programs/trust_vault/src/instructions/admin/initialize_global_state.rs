use anchor_lang::prelude::*;

use crate::state::GlobalState;

#[derive(Accounts)]
pub struct InitializeGlobalState<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + GlobalState::INIT_SPACE,
        seeds = [b"global-state"],
        bump
    )]
    pub global_state: Account<'info, GlobalState>,

    pub system_program: Program<'info, System>,
}

pub fn initialize_global_state(ctx: Context<InitializeGlobalState>) -> Result<()> {
    let global_state = &mut ctx.accounts.global_state;

    // Already initialized — nothing to do
    if global_state.authority != Pubkey::default() {
        msg!("Global state already initialized");
        return Ok(());
    }

    global_state.authority = ctx.accounts.authority.key();
    global_state.total_trust_express_created = 0;
    global_state.total_trust_express_closed = 0;
    global_state.total_confirmations = 0;
    global_state.total_volume = 0;
    global_state.high_watermark_volume = 0;
    global_state.last_volume_update = Clock::get()?.unix_timestamp;
    global_state.fee_percentage = 5;
    global_state.fee_destination = ctx.accounts.authority.key();
    global_state.buy_orders_paused = false;
    global_state.sell_orders_paused = false;

    // Validator consensus — no validators registered yet; admin calls
    // register_validator separately for each of the 5 nodes.
    global_state.validators = [Pubkey::default(); 5];
    global_state.validator_count = 0;
    global_state.required_votes = 3; // Default: 3-of-5

    // Derive and store the validator fee pool authority PDA so that
    // submit_buy_vote / submit_sell_vote can verify it on every call.
    let (fee_pool_authority, _) =
        Pubkey::find_program_address(&[b"validator-fee-pool-authority"], ctx.program_id);
    global_state.validator_fee_pool_authority = fee_pool_authority;

    global_state.bump = ctx.bumps.global_state;

    msg!(
        "Global state initialized. Required votes: 3-of-5. Fee pool authority: {}",
        global_state.validator_fee_pool_authority
    );
    Ok(())
}
