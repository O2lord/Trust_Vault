use anchor_lang::prelude::*;
use anchor_lang::solana_program::program_pack::Pack;
use anchor_spl::token::spl_token;
use anchor_spl::token_interface::TokenInterface;
use spl_token::state::Account as LegacyTokenAccount;
use spl_token_2022::extension::StateWithExtensions;
use spl_token_2022::state::Account as Token2022Account;

use crate::error::TrustExpressError;

/// Reads the owner pubkey from a token account regardless of whether it belongs
/// to the legacy `spl_token` program or the `spl_token_2022` program.
///
/// Returns `InvalidMakerAtaAuthority` on any unpack failure so callers can
/// re-map to a more specific error if needed.
pub fn get_token_account_owner(
    token_account_info: &AccountInfo,
    _token_program: &Interface<TokenInterface>,
) -> Result<Pubkey> {
    let token_account_data = token_account_info.try_borrow_data()?;

    if *token_account_info.owner == spl_token::ID {
        let token_account = LegacyTokenAccount::unpack(&token_account_data)
            .map_err(|_| TrustExpressError::InvalidMakerAtaAuthority)?;
        Ok(token_account.owner)
    } else if *token_account_info.owner == spl_token_2022::ID {
        let token_account = StateWithExtensions::<Token2022Account>::unpack(&token_account_data)
            .map_err(|_| TrustExpressError::InvalidMakerAtaAuthority)?;
        Ok(token_account.base.owner)
    } else {
        msg!("Unknown token program: {}", token_account_info.owner);
        Err(TrustExpressError::InvalidMakerAtaAuthority.into())
    }
}

pub fn compute_dust_threshold(decimals: u8) -> u64 {
    let safe_exponent = decimals.saturating_sub(3).min(18);
    if safe_exponent == 0 {
        1000u64
    } else {
        match 10u64.checked_pow(safe_exponent as u32) {
            Some(value) => value.max(1000),
            None => 1000,
        }
    }
}
