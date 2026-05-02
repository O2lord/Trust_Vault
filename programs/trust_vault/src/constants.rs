use anchor_lang::prelude::*;

#[constant]
pub const SEED: &str = "anchor";

pub const ANCHOR_DISCRIMINATOR: usize = 8;

pub const FEE_BASIS_POINTS: u16 = 5;
pub const FEE_RECEIVER: Pubkey = pubkey!("TVogEsLNMyh3sVSPSnzYsCQjLM9nPRzMA9XNpx34Fpy");

pub const RESOLVER_AUTHORITY: Pubkey = pubkey!("TVogEsLNMyh3sVSPSnzYsCQjLM9nPRzMA9XNpx34Fpy");
