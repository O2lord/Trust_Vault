/**
 * /api/solstice/yield-vault/route.ts
 *
 * Server-side proxy for Solstice Finance operations.
 * Keeps the SOLSTICE_API_KEY secret and orchestrates:
 *   1. GET  /api/solstice/yield-vault          → live yield info (APY, eUSX price, TVL)
 *   2. POST /api/solstice/yield-vault           → build mint + lock instructions for the client to sign
 *
 * Flow:
 *   Client calls POST with { walletAddress, usdcAmount, collateral }
 *   This route fetches serialised Solana instructions from Solstice
 *   Client receives the base64 instructions, deserialises them, signs with connected wallet, submits
 *
 * Why server-side?
 *   Minting USX is permissioned — only whitelisted accounts (identified by API key) may call
 *   /instruction/request_mint and /instruction/confirm_mint.  Exposing the API key client-side
 *   would let anyone drain the permissioned whitelist quota.
 */

import { NextRequest, NextResponse } from "next/server";

// ─── Config ─────────────────────────────────────────────────────────────────────────────────

// Sandbox (devnet) by default — set SOLSTICE_ENV=production to switch to mainnet
const SOLSTICE_BASE_URL =
  process.env.SOLSTICE_ENV === "production"
    ? "https://api.solstice.finance/v1"
    : "https://api.sandbox.solsticelabs.io/v1";

// Collateral mint addresses differ between networks
const COLLATERAL_MINTS = {
  production: {
    usdc: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    usdt: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
  },
  sandbox: {
    // TODO: replace these with the exact mint addresses Solstice's sandbox accepts.
    // Email partners@solstice.finance and ask: "What is the accepted USDC collateral
    // mint address on your devnet sandbox?" Then set it in .env.local:
    //   SOLSTICE_DEVNET_USDC_MINT=<address they give you>
    //
    // IMPORTANT: This must be the same mint your LP escrow was funded with on devnet.
    // When you create your test escrow, use the Solstice devnet USDC so both the
    // instant_reserve split transfer and the mint instruction reference the same mint.
    //
    // Fallback is the standard Circle devnet USDC — likely wrong for Solstice sandbox.
    usdc: process.env.SOLSTICE_DEVNET_USDC_MINT ?? "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
    usdt: process.env.SOLSTICE_DEVNET_USDT_MINT ?? "EJwZgeZrdC8TXTQbQBoL6bfuAnFUUy1PVCMB4DYPzVaS",
  },
} as const;

const env = process.env.SOLSTICE_ENV === "production" ? "production" : "sandbox";

const SOLSTICE_API_KEY = process.env.SOLSTICE_API_KEY ?? "";

function solsticeHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${SOLSTICE_API_KEY}`,
  };
}

// ─── Solstice instruction response shape ─────────────────────────────────────────────────

interface SolsticeInstruction {
  instruction: string;   // base64-encoded instruction data
  slot: number;
  accounts: string[];    // base58 account addresses
  programId: string;
  // Some endpoints also return richer account metas
  accountMetas?: { pubkey: string; isSigner: boolean; isWritable: boolean }[];
}

// ─── GET — live yield info ─────────────────────────────────────────────────────

export async function GET() {
  if (!SOLSTICE_API_KEY) {
    return NextResponse.json(
      { error: "SOLSTICE_API_KEY not configured" },
      { status: 503 }
    );
  }

  // Known fallback values — used when the Solstice API is unreachable (e.g. during
  // local dev before sandbox access is confirmed, or transient network issues).
  // The dashboard will display these rather than crashing.
  const FALLBACK_YIELD_INFO = {
    totalAssets:    0,
    totalShares:    0,
    eusxPriceInUsx: 1.0247,
    apy:            0.1396,
    source:         "fallback",
  };

  try {
    const res = await fetch(`${SOLSTICE_BASE_URL}/yield-info`, {
      headers: solsticeHeaders(),
      // Revalidate at most every 60 s so the APY display stays fresh
      next: { revalidate: 60 },
    });

    if (!res.ok) {
      const text = await res.text();
      console.warn(`[solstice/yield-vault] GET non-200 (${res.status}): ${text} — returning fallback`);
      return NextResponse.json({ ...FALLBACK_YIELD_INFO, apiError: text });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    // Network failure (ENOTFOUND, timeout, etc.) — return fallback so the dashboard
    // still renders with known-good values rather than crashing with a 500.
    console.warn("[solstice/yield-vault] GET unreachable — returning fallback:", (err as Error).message);
    return NextResponse.json(FALLBACK_YIELD_INFO);
  }
}

// ─── POST — build instructions for mint → lock flow ───────────────────────────

/**
 * Request body:
 * {
 *   walletAddress: string,   // merchant's Solana wallet (base58)
 *   usdcAmount:    string,   // USDC amount as a string integer (lamports / 6 decimals)
 *                            // e.g. "5000000" for 5 USDC
 *   collateral:    "usdc" | "usdt"
 * }
 *
 * Response — array of steps, each with a base64-encoded Solana instruction:
 * [
 *   { step: "request_mint",  instruction: "<base64>", accounts: [...], programId: "..." },
 *   { step: "confirm_mint",  instruction: "<base64>", accounts: [...], programId: "..." },
 *   { step: "lock",          instruction: "<base64>", accounts: [...], programId: "..." },
 * ]
 *
 * The client executes them in order — each must be confirmed before the next is submitted.
 * The confirm_mint and lock steps may share a single transaction if the wallet supports bundling.
 */

export async function POST(req: NextRequest) {
  if (!SOLSTICE_API_KEY) {
    return NextResponse.json(
      { error: "SOLSTICE_API_KEY not configured" },
      { status: 503 }
    );
  }

  let walletAddress: string;
  let usdcAmount: string;
  let collateral: string;

  try {
    ({ walletAddress, usdcAmount, collateral } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!walletAddress || !usdcAmount || !collateral) {
    return NextResponse.json(
      { error: "Missing required fields: walletAddress, usdcAmount, collateral" },
      { status: 400 }
    );
  }

  const collateralLower = collateral.toLowerCase();
  if (collateralLower !== "usdc" && collateralLower !== "usdt") {
    return NextResponse.json(
      { error: "collateral must be 'usdc' or 'usdt'" },
      { status: 400 }
    );
  }

  // ── Step 1: request_mint ────────────────────────────────────────────────────
  // Initiates the USX mint request. Returns a Solana instruction the merchant must sign.
  let requestMintInstruction: SolsticeInstruction = {} as SolsticeInstruction;
  try {
    const res = await fetch(`${SOLSTICE_BASE_URL}/instruction/request_mint`, {
      method: "POST",
      headers: solsticeHeaders(),
      body: JSON.stringify({
        collateralMint: collateralLower === "usdt"
          ? COLLATERAL_MINTS[env].usdt
          : COLLATERAL_MINTS[env].usdc,
        amount: usdcAmount,
        recipient: walletAddress,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `request_mint failed: ${text}` },
        { status: res.status }
      );
    }

    requestMintInstruction = await res.json();
  } catch (err) {
    const msg = (err as Error).message ?? "Unknown error";
    const isNetworkError = msg.includes("ENOTFOUND") || msg.includes("fetch failed");
    console.error("[solstice/yield-vault] request_mint error:", msg);
    return NextResponse.json(
      {
        error: isNetworkError
          ? "Cannot reach Solstice sandbox — confirm api.sandbox.solsticelabs.io is the correct hostname and your API key is active"
          : `request_mint failed: ${msg}`,
      },
      { status: isNetworkError ? 503 : 500 }
    );
  }

  // ── Step 2: confirm_mint ────────────────────────────────────────────────────
  // Must be submitted after request_mint is confirmed on-chain.
  let confirmMintInstruction: SolsticeInstruction = {} as SolsticeInstruction;
  try {
    const res = await fetch(`${SOLSTICE_BASE_URL}/instruction/confirm_mint`, {
      method: "POST",
      headers: solsticeHeaders(),
      body: JSON.stringify({
        collateralMint: collateralLower === "usdt"
          ? COLLATERAL_MINTS[env].usdt
          : COLLATERAL_MINTS[env].usdc,
        recipient: walletAddress,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `confirm_mint failed: ${text}` },
        { status: res.status }
      );
    }

    confirmMintInstruction = await res.json();
  } catch (err) {
    console.error("[solstice/yield-vault] confirm_mint error:", err);
    return NextResponse.json({ error: "confirm_mint failed" }, { status: 500 });
  }

  // ── Step 3: lock ─────────────────────────────────────────────────────────────
  // Locks the minted USX into YieldVault to receive eUSX.
  // The USX amount equals the USDC amount (1:1 peg on mint).
  let lockInstruction: SolsticeInstruction = {} as SolsticeInstruction;
  try {
    const res = await fetch(`${SOLSTICE_BASE_URL}/instruction/lock`, {
      method: "POST",
      headers: solsticeHeaders(),
      body: JSON.stringify({
        amount: usdcAmount, // USX is pegged 1:1 to USDC on mint
        recipient: walletAddress,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `lock failed: ${text}` },
        { status: res.status }
      );
    }

    lockInstruction = await res.json();
  } catch (err) {
    console.error("[solstice/yield-vault] lock error:", err);
    return NextResponse.json({ error: "lock failed" }, { status: 500 });
  }

  return NextResponse.json([
    { step: "request_mint",  ...requestMintInstruction  },
    { step: "confirm_mint",  ...confirmMintInstruction  },
    { step: "lock",          ...lockInstruction         },
  ]);
}