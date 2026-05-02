use anchor_lang::prelude::*;
use crate::error::TrustExpressError;
use crate::state::GlobalState;

#[derive(Accounts)]
pub struct SetGlobalStats<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"global-state"],
        bump = global_state.bump,
        has_one = authority
    )]
    pub global_state: Account<'info, GlobalState>,

    pub system_program: Program<'info, System>,
}

pub fn set_global_stats(
    ctx: Context<SetGlobalStats>,
    total_volume: Option<u64>,
    total_confirmations: Option<u64>,
    total_trust_express_created: Option<u64>,
    total_trust_express_closed: Option<u64>,
    total_fees_collected: Option<u64>,
) -> Result<()> {
    let gs = &mut ctx.accounts.global_state;

    if let Some(v) = total_volume {
        gs.total_volume = v;
        msg!("total_volume set to {}", v);
    }
    if let Some(v) = total_confirmations {
        gs.total_confirmations = v;
        msg!("total_confirmations set to {}", v);
    }
    if let Some(v) = total_trust_express_created {
        gs.total_trust_express_created = v;
        msg!("total_trust_express_created set to {}", v);
    }
    if let Some(v) = total_trust_express_closed {
        gs.total_trust_express_closed = v;
        msg!("total_trust_express_closed set to {}", v);
    }
    if let Some(v) = total_fees_collected {
        gs.total_fees_collected = v;
        msg!("total_fees_collected set to {}", v);
    }

    Ok(())
}