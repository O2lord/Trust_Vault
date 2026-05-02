/**
 * mintConstants.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Single source of truth for token symbol → mint address mappings.
 *
 * Priority order for each token:
 *   1. Environment variable  (NEXT_PUBLIC_<SYMBOL>_MINT)
 *   2. Hard-coded mainnet fallback
 *
 * To add a new token:
 *   1. Add a NEXT_PUBLIC_<SYMBOL>_MINT entry in your .env file for devnet/custom mints.
 *   2. Add the symbol + mainnet fallback address in MINT_CONFIG below.
 *   3. That's it — route.ts, ActionCard, and the dialogs all pick it up automatically.
 * ─────────────────────────────────────────────────────────────────────────────
 */

interface MintEntry {
  /** Uppercase token symbol, e.g. "USDC" */
  symbol: string;
  /** Env variable name to read at runtime */
  envKey: string;
  /** Mainnet fallback — used when envKey is not set */
  mainnetMint: string;
  /** How many decimal places this token uses on-chain */
  decimals: number;
}

const MINT_CONFIG: MintEntry[] = [
  {
    symbol: "USDC",
    envKey: "NEXT_PUBLIC_USDC_MINT",
    mainnetMint: "usdkTpkj3mKoK8D3QZjeFt728ZY9wZjSHVKoDfJcjTp",
    decimals: 6,
  },
  {
    symbol: "USDT",
    envKey: "NEXT_PUBLIC_USDT_MINT",
    mainnetMint: "usdkTpkj3mKoK8D3QZjeFt728ZY9wZjSHVKoDfJcjTp",
    decimals: 6,
  },
  // ── Add more tokens below ────────────────────────────────────────────────
  // {
  //   symbol: "BONK",
  //   envKey: "NEXT_PUBLIC_BONK_MINT",
  //   mainnetMint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
  //   decimals: 5,
  // },
];

// ── Derived maps (built once at module load) ──────────────────────────────────

/** symbol (uppercase) → mint address */
export const SYMBOL_TO_MINT: Record<string, string> = {};

/** mint address → symbol (uppercase) */
export const MINT_TO_SYMBOL: Record<string, string> = {};

/** mint address → decimals */
export const MINT_TO_DECIMALS: Record<string, number> = {};

for (const entry of MINT_CONFIG) {
  // In Next.js, process.env values are inlined at build time for NEXT_PUBLIC_ keys.
  // On the server (route.ts) non-NEXT_PUBLIC_ keys are also available.
  const mint: string =
    (typeof process !== "undefined" && process.env[entry.envKey]) ||
    entry.mainnetMint;

  SYMBOL_TO_MINT[entry.symbol] = mint;
  MINT_TO_SYMBOL[mint] = entry.symbol;
  MINT_TO_DECIMALS[mint] = entry.decimals;
}

/**
 * Resolve a token symbol (case-insensitive) to its active mint address.
 * Returns `undefined` if the symbol is not recognised.
 *
 * @example
 * mintForSymbol("usdc") // → "EPjFWdd5..." or env override
 */
export function mintForSymbol(symbol: string): string | undefined {
  return SYMBOL_TO_MINT[symbol.toUpperCase()];
}

/**
 * Resolve a mint address to its symbol.
 * Returns `undefined` if the mint is not in the constants list.
 */
export function symbolForMint(mint: string): string | undefined {
  return MINT_TO_SYMBOL[mint];
}

/**
 * Return all known mints as a flat array — useful for allowedMints lists.
 */
export function allKnownMints(): string[] {
  return Object.values(SYMBOL_TO_MINT);
}

/**
 * Return all entries — useful for building the AI system-prompt mint reference.
 */
export function allMintEntries(): Array<{ symbol: string; mint: string; decimals: number }> {
  return MINT_CONFIG.map((entry) => ({
    symbol: entry.symbol,
    mint: SYMBOL_TO_MINT[entry.symbol],
    decimals: entry.decimals,
  }));
}