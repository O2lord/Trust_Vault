use anchor_lang::prelude::*;

use crate::state::reservation::ReservedAmount;

pub const EXPRESS_SELL: u8 = 0;
pub const EXPRESS_BUY: u8 = 1;

#[account]
#[derive(InitSpace)]
pub struct TrustExpress {
    pub seed: u64,
    pub maker: Pubkey,
    pub mint: Pubkey,
    #[max_len(3)]
    pub currency: [u8; 3],
    pub escrow_type: u8,
    pub fee_percentage: u16,
    pub fee_destination: Pubkey,
    pub reserved_fee: u64,
    pub amount: u64,
    pub price_per_token: u64,
    #[max_len(100)]
    pub payment_instructions: String,
    #[max_len(10)]
    pub reserved_amounts: Vec<ReservedAmount>,
    #[max_len(64)]
    pub flutterwave_credential_id: Option<String>,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct LiquidityProvider {
    pub owner: Pubkey,
    #[max_len(3)]
    pub currency: [u8; 3],
    pub min_amount: u64,
    pub max_amount: u64,
    pub fee_bps: u16,
    #[max_len(128)]
    pub api_endpoint: String,
    #[max_len(64)]
    pub identifier: String,
    pub active: bool,
    pub bump: u8,
}
