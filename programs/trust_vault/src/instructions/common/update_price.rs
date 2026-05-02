use anchor_lang::prelude::*;

use crate::error::TrustExpressError;
use crate::state::TrustExpress;

#[derive(Accounts)]
pub struct UpdatePrice<'info> {
    #[account(mut)]
    pub maker: Signer<'info>,

    #[account(
        mut,
        has_one = maker,
        seeds = [b"trust-express", maker.key().as_ref(), trust_express.seed.to_le_bytes().as_ref()],
        bump = trust_express.bump
    )]
    pub trust_express: Account<'info, TrustExpress>,
}

pub fn update_price(ctx: Context<UpdatePrice>, new_price_per_token: u64) -> Result<()> {
    let trust_express_pubkey = ctx.accounts.trust_express.key();
    let maker_pubkey = ctx.accounts.maker.key();
    let currency_string = String::from_utf8_lossy(&ctx.accounts.trust_express.currency).to_string();

    let trust_express = &mut ctx.accounts.trust_express;

    require!(new_price_per_token > 0, TrustExpressError::InvalidPrice);

    let old_price = trust_express.price_per_token;

    trust_express.price_per_token = new_price_per_token;

    emit!(ExpressPriceUpdatedEvent {
        trust_express: trust_express_pubkey,
        maker: maker_pubkey,
        old_price,
        new_price: new_price_per_token,
        currency: currency_string.clone(),
    });

    msg!(
        "Price updated from {} to {} {}",
        old_price,
        new_price_per_token,
        currency_string
    );

    Ok(())
}

#[event]
pub struct ExpressPriceUpdatedEvent {
    pub trust_express: Pubkey,
    pub maker: Pubkey,
    pub old_price: u64,
    pub new_price: u64,
    pub currency: String,
}
