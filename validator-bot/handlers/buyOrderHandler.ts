// validator-bot/handlers/buyOrderHandler.ts
//
// Handles InstantPaymentReservedEvent in the decentralised validator system.
//
// ✅ ZERO SUPABASE — validators hold no DB credentials whatsoever.
//    All state (executor election, payout status) goes through the platform API.
//    Validators only need: VALIDATOR_API_KEY + PLATFORM_API_URL + Solana keypair.
//
// Flow:
//   1. ALL validators POST /api/bot/elect-executor — server does the DB race.
//      One wins EXECUTOR, the rest become VERIFIERS.
//   2. EXECUTOR POSTs /api/initiate-buy-payout — server fetches LP Flutterwave
//      credentials, sends fiat, records flw_transfer_reference in DB.
//   3. ALL validators poll GET /api/bot/payout-status until flw_transfer_reference
//      appears (or status = failed_to_initiate).
//   4. ALL validators poll GET /api/verify-transfer until SUCCESSFUL or FAILED.
//   5. Each validator submits its on-chain vote via submitBuyVote.
//   6. On-chain program executes when threshold (3-of-5) is reached.

import {
  Connection,
  PublicKey,
  Keypair,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';
import { Program } from '@coral-xyz/anchor';
import BN from 'bn.js';
import { keccak_256 } from '@noble/hashes/sha3';
import chalk from 'chalk';
import type { TrustVault } from '../relics/trust_vault.js';
import { BOT_VERSION, botHeaders } from '../val_bot.js';

// ─────────────────────────────────────────────────────────────────────────────
// ReservationEvent — must include payoutDetails decoded from the on-chain event
// ─────────────────────────────────────────────────────────────────────────────

export interface ReservationEvent {
  orderType: 'buy' | 'sell';
  trustExpress: string;
  maker: string;
  taker: string;
  amount: bigint;
  fiatAmount: bigint;       // plain fiat value — use Number() directly, no decimal scaling
  currency: string;
  payoutReference: string;
  payoutDetails: string | null;  // JSON string: { account_number, bank_code, ... }
  signature: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function computeReferenceHash(payoutReference: string): number[] {
  return Array.from(keccak_256(Buffer.from(payoutReference, 'utf8')));
}

function deriveValidatorVotePda(
  trustExpressPubkey: PublicKey,
  referenceHash: number[],
  programId: PublicKey
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('validator-vote'), trustExpressPubkey.toBuffer(), Buffer.from(referenceHash)],
    programId
  );
  return pda;
}

function deriveGlobalStatePda(programId: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('global-state')],
    programId
  );
  return pda;
}

function deriveValidatorFeePoolAuthorityPda(programId: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('validator-fee-pool-authority')],
    programId
  );
  return pda;
}

function deriveValidatorFeePoolAta(
  programId: PublicKey,
  mint: PublicKey,
  tokenProgram: PublicKey
): PublicKey {
  return getAssociatedTokenAddressSync(
    mint,
    deriveValidatorFeePoolAuthorityPda(programId),
    true,
    tokenProgram
  );
}

function deriveValidatorEarningsPda(
  validatorKey: PublicKey,
  mint: PublicKey,
  programId: PublicKey
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('validator-earnings'), validatorKey.toBuffer(), mint.toBuffer()],
    programId
  );
  return pda;
}

// Builds the remainingAccounts list for submitBuyVote / submitSellVote.
//
// Fetches global_state.validators — the authoritative list of all registered
// validators — and derives a ValidatorEarnings PDA for each active slot.
// This replaces the old approach of reading the vote account for prior voters,
// which had a race condition: late voters' PDAs were missing from early votes.
async function buildValidatorEarningRemainingAccounts(
  program: Program<TrustVault>,
  signingValidatorKey: PublicKey,  // kept for signature compatibility, no longer needed
  mint: PublicKey,
  programId: PublicKey,
  tag = ''
): Promise<{ pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[]> {

  const globalStatePda = PublicKey.findProgramAddressSync(
    [Buffer.from('global-state')],
    programId
  )[0];

  const globalState = await (program.account as any).globalState.fetch(globalStatePda);

  const allValidators: PublicKey[] = (globalState.validators as PublicKey[]).filter(
    (v: PublicKey) => !v.equals(PublicKey.default)
  );

  const pdas = allValidators.map((validator) => ({
    pubkey: PublicKey.findProgramAddressSync(
      [Buffer.from('validator-earnings'), validator.toBuffer(), mint.toBuffer()],
      programId
    )[0],
    isSigner: false,
    isWritable: true,
  }));

  console.log(
    chalk.gray(`${tag} 📋 Earnings PDAs (${pdas.length}): ${allValidators.map((v) => v.toBase58().slice(0, 8) + '...').join(', ')}`)
  );

  return pdas;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared fetch helper with timeout
// ─────────────────────────────────────────────────────────────────────────────

async function apiFetch(
  url: string,
  options: RequestInit & { timeoutMs?: number } = {}
): Promise<Response> {
  const { timeoutMs = 15_000, ...fetchOptions } = options;
  return fetch(url, {
    ...fetchOptions,
    signal: AbortSignal.timeout(timeoutMs),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 1 — Executor election through platform API
//
// Server does the Supabase INSERT race. Returns 'executor' or 'verifier'.
// Validators never touch the DB directly.
// ─────────────────────────────────────────────────────────────────────────────

async function electExecutor(
  event: ReservationEvent,
  validatorApiKey: string,
  platformApiUrl: string,
  tag: string
): Promise<'executor' | 'verifier'> {
  try {
    const res = await apiFetch(`${platformApiUrl}/api/bot/elect-executor`, {
      method: 'POST',
      headers: botHeaders(validatorApiKey),
      body: JSON.stringify({
        payout_reference: event.payoutReference,
        trust_express_pda: event.trustExpress,
      }),
      timeoutMs: 10_000,
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(chalk.yellow(`${tag} ⚠️  elect-executor returned ${res.status}: ${text}`));
      // Default to verifier on error — safe, prevents double-payout
      return 'verifier';
    }

    const data = await res.json() as { role: 'executor' | 'verifier' };
    return data.role;
  } catch (err) {
    console.error(chalk.yellow(`${tag} ⚠️  elect-executor network error: ${err instanceof Error ? err.message : err}`));
    return 'verifier';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2 — Executor calls the platform API to initiate the Flutterwave transfer
//
// Server-side: fetches + decrypts LP credentials, calls Flutterwave,
// records flw_transfer_reference in buy_order_payouts, returns the ref.
// ─────────────────────────────────────────────────────────────────────────────

async function executePayout(
  event: ReservationEvent,
  scaledFiatAmount: number,
  validatorApiKey: string,
  platformApiUrl: string,
  tag: string,
  program: Program<TrustVault>
): Promise<{ success: boolean; flwReference: string | null; error?: string }> {
  // Guard: payout_details is required for the server to know where to send money
  if (!event.payoutDetails) {
    const errMsg = 'Missing payout_details on event — cannot route fiat transfer';
    console.error(chalk.red(`${tag} ❌ ${errMsg}`));
    return { success: false, flwReference: null, error: errMsg };
  }

  // Fetch fee percentage from on-chain order and deduct from fiat sent to taker
  const trustExpressAccount = await (program.account as any).trustExpress.fetch(
    new PublicKey(event.trustExpress)
  );
  const feePercentage: number = trustExpressAccount.feePercentage;
  const fiatFee = Math.floor(scaledFiatAmount * feePercentage / 10000);
  const takerFiatAmount = scaledFiatAmount - fiatFee;

  console.log(
    chalk.cyan(`${tag} 💸 Sending ${takerFiatAmount} ${event.currency} to taker (${fiatFee} fee deducted) — ref: ${event.payoutReference}`)
  );

  try {
    const res = await apiFetch(`${platformApiUrl}/api/initiate-buy-payout`, {
      method: 'POST',
      headers: botHeaders(validatorApiKey),
      body: JSON.stringify({
        payout_reference:  event.payoutReference,
        trust_express_pda: event.trustExpress,
        taker:             event.taker,
        maker:             event.maker, 
        fiat_amount:       takerFiatAmount,
        token_amount:      event.amount.toString(),
        currency:          event.currency,
        payout_details:    event.payoutDetails,
      }),
      timeoutMs: 30_000,
    });

    const data = await res.json() as {
      success: boolean;
      flw_reference?: string;
      error?: string;
      idempotent?: boolean;
    };

    if (!res.ok || !data.success) {
      throw new Error(data.error ?? `HTTP ${res.status}`);
    }

    if (data.idempotent) {
      console.log(chalk.gray(`${tag} ℹ️  Payout already exists (idempotent). FLW ref: ${data.flw_reference}`));
    }

    const flwReference = data.flw_reference ?? null;

    if (!flwReference) {
      const errMsg = `initiate-buy-payout returned success but no flw_reference for ${event.payoutReference}`;
      console.error(`❌ ${errMsg}`);
      return { success: false, flwReference: null, error: errMsg };
    }

    console.log(chalk.green(`${tag} ✅ Payout initiated — FLW ref: ${flwReference}`));
    return { success: true, flwReference };

  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`${tag} ❌ Payout initiation failed: ${errMsg}`));
    return { success: false, flwReference: null, error: errMsg };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 3 — All validators wait for executor + verify transfer outcome
//
// Phase A: poll /api/bot/payout-status until flw_transfer_reference appears
//          or status = 'failed_to_initiate' (fast-fail).
// Phase B: poll /api/verify-transfer until SUCCESSFUL or FAILED.
// ─────────────────────────────────────────────────────────────────────────────

async function waitForTransferResult(
  event: ReservationEvent,
  validatorApiKey: string,
  platformApiUrl: string,
  tag: string
): Promise<{ verified: boolean; evidence: string }> {
  const MAX_WAIT_FOR_EXECUTOR_MS = 60_000;  // 60s for executor to initiate
  const POLL_INTERVAL_MS         = 5_000;
  const MAX_TRANSFER_POLLS       = 24;       // 24 × 5s = 2 min of transfer polling

  // ── Phase A: wait for flw_transfer_reference ──────────────────────────────
  console.log(chalk.gray(`${tag} ⏳ Waiting for payout confirmation (${event.payoutReference})...`));
  const deadline = Date.now() + MAX_WAIT_FOR_EXECUTOR_MS;
  let flwReference: string | null = null;

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);

    try {
      const res = await apiFetch(
        `${platformApiUrl}/api/bot/payout-status` +
        `?payout_reference=${encodeURIComponent(event.payoutReference)}`,
        {
          headers: botHeaders(validatorApiKey),
          timeoutMs: 10_000,
        }
      );

      if (!res.ok) continue;

      const data = await res.json() as {
        status: string;
        flw_transfer_reference: string | null;
      };

      // Executor couldn't initiate — fast-fail, no point polling Flutterwave
      if (data.status === 'failed_to_initiate') {
        return {
          verified: false,
          evidence: 'Payout initiation failed — executor marked status=failed_to_initiate',
        };
      }

      if (data.flw_transfer_reference) {
        flwReference = data.flw_transfer_reference;
        console.log(chalk.green(`${tag} ✅ Payout confirmed — FLW ref: ${flwReference}`));
        break;
      }
    } catch (err) {
      console.warn(chalk.yellow(`${tag} ⚠️  payout-status poll error: ${err instanceof Error ? err.message : err}`));
    }
  }

  if (!flwReference) {
    return {
      verified: false,
      evidence: `Executor did not record FLW ref within ${MAX_WAIT_FOR_EXECUTOR_MS / 1000}s`,
    };
  }

  // ── Phase B: poll verify-transfer ─────────────────────────────────────────
  console.log(chalk.gray(`${tag} 🔄 Verifying transfer with Flutterwave (${flwReference})...`));

  for (let attempt = 1; attempt <= MAX_TRANSFER_POLLS; attempt++) {
    await sleep(POLL_INTERVAL_MS);

    try {
      const url =
        `${platformApiUrl}/api/verify-transfer` +
        `?payout_reference=${encodeURIComponent(event.payoutReference)}` +
        `&trust_express_pda=${encodeURIComponent(event.trustExpress)}`;

      const res = await apiFetch(url, {
        headers: botHeaders(validatorApiKey),
        timeoutMs: 10_000,
      });

      if (!res.ok) {
        console.warn(chalk.yellow(`${tag} ⚠️  verify-transfer returned ${res.status} (check ${attempt})`));
        continue;
      }

      const result = await res.json() as {
        verified: boolean;
        status?: string;
        amount?: number;
        currency?: string;
        error?: string;
      };

      if (result.verified) {
        return {
          verified: true,
          evidence:
            `Transfer SUCCESSFUL. FLW ref: ${flwReference}. ` +
            `Amount: ${result.amount} ${result.currency}`,
        };
      }

      if (result.status === 'FAILED' || result.status === 'REVERSED') {
        return {
          verified: false,
          evidence: `Transfer ${result.status}. FLW ref: ${flwReference}`,
        };
      }

      console.log(
        chalk.gray(`${tag} ⏳ Transfer check ${attempt}/${MAX_TRANSFER_POLLS}: ${result.status ?? 'pending'}...`)
      );
    } catch (err) {
      console.warn(
        chalk.yellow(`${tag} ⚠️  verify-transfer error (check ${attempt}): ${err instanceof Error ? err.message : err}`)
      );
    }
  }

  return {
    verified: false,
    evidence: `Transfer still PENDING after ${MAX_TRANSFER_POLLS} polls. FLW ref: ${flwReference}`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 4b — Submit buy vote on-chain
// ─────────────────────────────────────────────────────────────────────────────

async function submitBuyVoteOnChain(
  program: Program<TrustVault>,
  validatorKeypair: Keypair,
  connection: Connection,
  event: ReservationEvent,
  vote: boolean,
  evidence: string,
  tag: string
): Promise<void> {
  const trustExpressPubkey = new PublicKey(event.trustExpress);
  const takerPubkey        = new PublicKey(event.taker);
  const makerPubkey        = new PublicKey(event.maker);

  const referenceHash    = computeReferenceHash(event.payoutReference);
  const programId        = program.programId;
  const validatorVotePda = deriveValidatorVotePda(trustExpressPubkey, referenceHash, programId);
  const globalStatePda   = deriveGlobalStatePda(programId);

  const trustExpressAccount  = await (program.account as any).trustExpress.fetch(trustExpressPubkey);
  const mint: PublicKey          = trustExpressAccount.mint;
  const feeDestination: PublicKey = trustExpressAccount.feeDestination;

  const mintInfo     = await connection.getAccountInfo(mint);
  const tokenProgram = mintInfo?.owner.equals(TOKEN_2022_PROGRAM_ID)
    ? TOKEN_2022_PROGRAM_ID
    : TOKEN_PROGRAM_ID;

  const trustExpressAta   = getAssociatedTokenAddressSync(mint, trustExpressPubkey, true, tokenProgram);
  const feeDestinationAta = getAssociatedTokenAddressSync(mint, feeDestination, false, tokenProgram);
  const takerAta          = getAssociatedTokenAddressSync(mint, takerPubkey, false, tokenProgram);
  const makerAta          = getAssociatedTokenAddressSync(mint, makerPubkey, false, tokenProgram);

  // Create any missing ATAs so the on-chain execution can transfer tokens
  const preIxs = [];
  for (const [ata, authority] of [
    [feeDestinationAta, feeDestination],
    [makerAta,          makerPubkey],
    [takerAta,          takerPubkey],
  ] as [PublicKey, PublicKey][]) {
    if (!(await connection.getAccountInfo(ata))) {
      preIxs.push(
        createAssociatedTokenAccountInstruction(
          validatorKeypair.publicKey,
          ata,
          authority,
          mint,
          tokenProgram
        )
      );
    }
  }

  if (preIxs.length > 0) {
    const ataTx = new Transaction().add(...preIxs);
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    ataTx.recentBlockhash = blockhash;
    ataTx.feePayer = validatorKeypair.publicKey;
    ataTx.sign(validatorKeypair);
    await connection.sendRawTransaction(ataTx.serialize(), { skipPreflight: false });
    console.log(chalk.gray(`${tag} 📝 Created ${preIxs.length} missing ATA(s)`));
  }

  const sig = await program.methods
    .submitBuyVote(
      referenceHash,
      event.payoutReference,
      takerPubkey,
      new BN(event.amount.toString()),
      new BN(event.fiatAmount.toString()),
      event.currency,
      vote,
      evidence.substring(0, 200)
    )
    .accountsPartial({
      validator:         validatorKeypair.publicKey,
      globalState:       globalStatePda,
      trustExpress:      trustExpressPubkey,
      validatorVote:     validatorVotePda,
      maker:             makerPubkey,
      mint,
      trustExpressAta,
      feeDestinationAta,
      takerAta,
      makerAta,
      tokenProgram,
      systemProgram:     SystemProgram.programId,
      validatorFeePoolAuthority: deriveValidatorFeePoolAuthorityPda(programId),
      validatorFeePoolAta: deriveValidatorFeePoolAta(programId, mint, tokenProgram),
    })
    .remainingAccounts(
      await buildValidatorEarningRemainingAccounts(
        program,
        validatorKeypair.publicKey,
        mint,
        programId,
        tag
      )
    )
    .rpc();

  console.log(chalk.green(`${tag} ✅ Vote cast (${vote ? 'YES' : 'NO'}) — tx: ${sig.slice(0, 20)}...`));
}

async function submitBuyVoteWithRetry(
  program: Program<TrustVault>,
  validatorKeypair: Keypair,
  connection: Connection,
  event: ReservationEvent,
  vote: boolean,
  evidence: string,
  tag: string,
  maxAttempts = 3
): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await submitBuyVoteOnChain(
        program, validatorKeypair, connection, event, vote, evidence, tag
      );
      return;
    } catch (err: any) {
      // Normalise the error message — raw RPC errors may not be Error instances
      // and can stringify as "[object Object]" if not handled carefully.
      const msg: string =
        err?.message ??
        err?.error?.errorMessage ??
        (typeof err === 'string' ? err : JSON.stringify(err));

      // Extract numeric custom error code from raw RPC JSON responses like:
      //   {"InstructionError":[0,{"Custom":6052}]}
      // These arrive when the transaction is already executed and the on-chain
      // program rejects the duplicate before Anchor can format the error name.
      const codeMatch = msg.match(/"Custom"\s*:\s*(\d+)/);
      const code = codeMatch ? Number(codeMatch[1]) : undefined;

      // Terminal conditions — do not retry, not an error.
      // Codes from error.rs (Anchor assigns 6000 + enum index):
      //   6051 AlreadyVoted | 6052 VoteAlreadyExecuted | 6035 ReservationAlreadyProcessed
      //   6034 ReservationNotFound | 6053 VoteExpired
      if (
        msg.includes('AlreadyVoted')                || code === 6051 ||
        msg.includes('VoteAlreadyExecuted')         || code === 6052 ||
        msg.includes('ReservationAlreadyProcessed') || code === 6035
      ) {
        console.log(chalk.gray(`${tag} ℹ️  Vote already recorded for ${event.payoutReference} — skipping`));
        return;
      }
      if (msg.includes('ReservationNotFound') || code === 6034) {
        console.log(chalk.gray(`${tag} ℹ️  Reservation ${event.payoutReference} already resolved — skipping`));
        return;
      }
      if (msg.includes('VoteExpired') || code === 6053) {
        console.log(chalk.yellow(`${tag} ⌛ Vote window expired for ${event.payoutReference}`));
        return;
      }

      // Retryable failure
      console.error(chalk.red(`${tag} ❌ Vote attempt ${attempt}/${maxAttempts} failed: ${msg}`));
      if (attempt < maxAttempts) {
        await sleep(1000 * attempt);
      } else {
        throw err;
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export — called by val_bot.ts for every buy reservation
// ─────────────────────────────────────────────────────────────────────────────

export async function handleBuyReservation(
  program: Program<TrustVault>,
  validatorKeypair: Keypair,
  connection: Connection,
  event: ReservationEvent,
  apiKey: string,
  tag: string
): Promise<void> {
  const platformApiUrl = process.env.PLATFORM_API_URL;

  if (!platformApiUrl) {
    throw new Error('PLATFORM_API_URL env var is required');
  }

  if (!apiKey) {
    throw new Error('VALIDATOR_API_KEY is required — ensure it is set in your .env');
  }

  // ── Correct fiat scaling using mint decimals ───────────────────────────────
  // Buy order fiatAmount is the plain human-readable fiat value (e.g. 200 = N200).
  // Unlike sell orders which scale token_amount * price by mint decimals, buy orders
  // store fiat amount directly. Confirmed from old bot: parseFloat(fiatAmount), no scaling.
// ── Correct fiat scaling using mint decimals ───────────────────────────────
const scaledFiatAmount = Number(event.fiatAmount);

// Fetch mint decimals from the trust express account (same approach as val_bot.ts)
let tokenDisplay = event.amount.toString();
try {
  const teAccount = await (program.account as any).trustExpress.fetch(
    new PublicKey(event.trustExpress)
  );
  const mintInfo = await connection.getAccountInfo(teAccount.mint);
  const decimals = mintInfo?.data[44] ?? 9; // decimals at offset 44 in mint layout
  tokenDisplay = (Number(event.amount) / Math.pow(10, decimals)).toFixed(2);
} catch { /* fall back to raw */ }

console.log(chalk.white(`${tag} 💰 Fiat: ${Number(event.fiatAmount) / 1e9} ${event.currency} | Tokens: ${tokenDisplay} | Ref: ${event.payoutReference}`));
  // ── 1. Race to become executor (server handles the DB race) ───────────────
  const role = await electExecutor(event, apiKey, platformApiUrl, tag);
  const roleColour = role === 'executor' ? chalk.magenta : chalk.blue;
  console.log(roleColour(`${tag} 🏷️  Role: ${role.toUpperCase()} — ${event.payoutReference}`));

  // ── 2. Executor: initiate the fiat payout ─────────────────────────────────
  if (role === 'executor') {
    const payoutResult = await executePayout(
      event,
      scaledFiatAmount,
      apiKey,
      platformApiUrl,
      tag,
      program
    );

    if (!payoutResult.success) {
      // Vote false immediately — verifiers will see failed_to_initiate and fast-fail
      console.error(chalk.red(`${tag} ❌ Executor payout failed — voting NO immediately`));
      await submitBuyVoteWithRetry(
        program, validatorKeypair, connection, event,
        false,
        `Payout initiation failed: ${payoutResult.error}`,
        tag
      );
      return;
    }
  }

  // ── 3. ALL validators: wait for payout then verify transfer ───────────────
  // Random jitter so 5 validators don't hammer verify-transfer simultaneously
  await sleep(Math.floor(Math.random() * 3_000));

  const { verified, evidence } = await waitForTransferResult(
    event,
    apiKey,
    platformApiUrl,
    tag
  );

  const verifiedColour = verified ? chalk.green : chalk.red;
  console.log(verifiedColour(`${tag} 📊 ${verified ? '✅ VERIFIED' : '❌ UNVERIFIED'} — ${evidence}`));

  // ── 4. ALL validators: submit on-chain vote ───────────────────────────────
  console.log(chalk.cyan(`${tag} ⛓️  Casting ${verified ? 'YES' : 'NO'} vote on-chain...`));
  await submitBuyVoteWithRetry(
    program, validatorKeypair, connection, event,
    verified,
    evidence,
    tag
  );
}