use anchor_lang::prelude::*;

use crate::events::{BuyOrdersPausedEvent, SellOrdersPausedEvent};
use crate::state::GlobalState;

#[derive(Accounts)]
pub struct PauseGlobalOrders<'info> {
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

/// Pause or unpause buy order creation AND reservations globally
/// When paused:
/// - Cannot create new buy orders
/// - Cannot make reservations on existing buy orders
/// - CAN still confirm payouts, withdraw, and cancel
pub fn pause_buy_orders(ctx: Context<PauseGlobalOrders>, paused: bool) -> Result<()> {
    let global_state = &mut ctx.accounts.global_state;
    global_state.buy_orders_paused = paused;

    emit!(BuyOrdersPausedEvent {
        authority: ctx.accounts.authority.key(),
        paused,
        timestamp: Clock::get()?.unix_timestamp,
    });

    msg!(
        "Buy orders and reservations {}",
        if paused { "paused" } else { "unpaused" }
    );

    Ok(())
}

/// Pause or unpause sell order creation AND reservations globally
/// When paused:
/// - Cannot create new sell orders
/// - Cannot make reservations on existing sell orders
/// - CAN still confirm payments, withdraw, and cancel
pub fn pause_sell_orders(ctx: Context<PauseGlobalOrders>, paused: bool) -> Result<()> {
    let global_state = &mut ctx.accounts.global_state;
    global_state.sell_orders_paused = paused;

    emit!(SellOrdersPausedEvent {
        authority: ctx.accounts.authority.key(),
        paused,
        timestamp: Clock::get()?.unix_timestamp,
    });

    msg!(
        "Sell orders and reservations {}",
        if paused { "paused" } else { "unpaused" }
    );

    Ok(())
}
