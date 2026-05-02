import { PublicKey } from "@solana/web3.js";

// Batching configuration
export const BATCH_DELAY = 50; // 50ms batching window
export const BATCH_SIZE = 10; // Maximum 10 requests per batch

// Default fee destination
export const DEFAULT_FEE_DESTINATION = new PublicKey(
  "TVogEsLNMyh3sVSPSnzYsCQjLM9nPRzMA9XNpx34Fpy"
);

//  fee constants
export const FEE_PERCENTAGE = 0.05; // 0.5% fee
export const MIN_FEE = 0.001; // Minimum fee
export const MAX_FEE_PERCENTAGE = 1; // Maximum fee percentage


// TrustVault types
export const TRUST_VAULT_TYPE_SELL_ORDER = 0;
export const TRUST_VAULT_TYPE_BUY_ORDER = 1;

// Batch configuration for optimization
export const BALANCE_BATCH_DELAY = 50; // 50ms