use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct ReservedAmount {
    pub taker: Pubkey,
    pub amount: u64,
    pub fiat_amount: u64,
    pub timestamp: i64,
    #[max_len(100)]
    pub seller_instructions: Option<String>,
    pub status: u8,
    #[max_len(100)]
    pub dispute_reason: Option<String>,
    #[max_len(6)]
    pub dispute_id: Option<String>,
    #[max_len(100)]
    pub payout_details: Option<String>,
    #[max_len(64)]
    pub payout_reference: Option<String>,
    /// 0 = payment link, 1 = direct transfer with API monitoring
    pub payment_mode: u8,
    /// Flutterwave payment link if payment_mode == 0
    #[max_len(200)]
    pub payment_link: Option<String>,
    #[max_len(64)]
    pub transaction_reference: Option<String>,
}
