// tests/validator_consensus_test.ts
//
// Covers:
//   1.  initialize_global_state
//   2.  register_validator / remove_validator / update_required_votes
//   3.  create buy order + instant_reserve (setup helpers)
//   4.  submit_buy_vote — 3-of-5 happy path → tokens released to maker
//   5.  submit_buy_vote — 3 rejections → impossible_to_approve → refund
//   6.  submit_buy_vote — duplicate vote rejected (AlreadyVoted)
//   7.  submit_buy_vote — non-validator rejected (UnauthorizedValidator)
//   8.  finalize_expired_vote — documented (clock-manipulation required)
//   9.  submit_sell_vote — 3-of-5 happy path
//  10.  PARTIAL FILL CLOSE FIX — buy order that is partially settled stays open;
//       only closes when trust_express.amount reaches 0

import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { TrustVault } from "../target/types/trust_vault";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  getAccount,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { assert } from "chai";
import { keccak256 } from "js-sha3";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function globalStatePda(programId: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("global-state")],
    programId
  );
  return pda;
}

function trustExpressPda(maker: PublicKey, seed: BN, programId: PublicKey): PublicKey {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(seed.toString()), 0);
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("trust-express"), maker.toBuffer(), buf],
    programId
  );
  return pda;
}

function referenceHash(payoutReference: string): Buffer {
  return Buffer.from(keccak256.array(payoutReference));
}

function validatorVotePda(
  trustExpress: PublicKey,
  payoutReference: string,
  programId: PublicKey
): PublicKey {
  const refHash = referenceHash(payoutReference);
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("validator-vote"), trustExpress.toBuffer(), refHash],
    programId
  );
  return pda;
}

async function airdrop(
  connection: anchor.web3.Connection,
  pubkey: PublicKey,
  sol = 2
) {
  const sig = await connection.requestAirdrop(pubkey, sol * LAMPORTS_PER_SOL);
  await connection.confirmTransaction(sig, "confirmed");
}

// ─── Test Suite ───────────────────────────────────────────────────────────────


/** Derives the validator fee pool authority PDA */
function validatorFeePoolAuthorityPda(programId: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("validator-fee-pool-authority")],
    programId
  );
  return pda;
}

/** Derives the validator fee pool ATA (associated token account) */
function validatorFeePoolAta(
  feePoolAuthority: PublicKey,
  mint: PublicKey
): PublicKey {
  const [ata] = PublicKey.findProgramAddressSync(
    [feePoolAuthority.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  return ata;
}

describe("Validator Consensus — 3-of-5 voting system", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.TrustVault as Program<TrustVault>;
  const connection = provider.connection;

  const authority = provider.wallet as anchor.Wallet;
  const maker = Keypair.generate();   // LP / buyer
  const taker = Keypair.generate();   // seller / counterparty

  const validators = Array.from({ length: 5 }, () => Keypair.generate());

  let mint: PublicKey;
  let makerAta: PublicKey;
  let takerAta: PublicKey;
  let feeDestinationAta: PublicKey;

  let globalState: PublicKey;
  const trustSeed = new BN(42);
  let trustExpress: PublicKey;
  let trustExpressAta: PublicKey;

  const TOKEN_DECIMALS  = 6;
  const DEPOSIT_AMOUNT  = 1_000_000; // 1 token (6 dec)
  const PRICE_PER_TOKEN = 1_500;
  const FIAT_AMOUNT     = DEPOSIT_AMOUNT * PRICE_PER_TOKEN;
  let actualPayoutReference = "";

  // ── Before all ─────────────────────────────────────────────────────────────
  before(async () => {
    await airdrop(connection, maker.publicKey);
    await airdrop(connection, taker.publicKey);
    for (const v of validators) await airdrop(connection, v.publicKey);

    mint = await createMint(
      connection, authority.payer, authority.publicKey, null, TOKEN_DECIMALS
    );

    makerAta = await createAssociatedTokenAccount(
      connection, authority.payer, mint, maker.publicKey
    );
    takerAta = await createAssociatedTokenAccount(
      connection, authority.payer, mint, taker.publicKey
    );
    feeDestinationAta = await createAssociatedTokenAccount(
      connection, authority.payer, mint, authority.publicKey
    );

    // Taker needs tokens to lock into the buy-order escrow
    await mintTo(connection, authority.payer, mint, takerAta, authority.publicKey, DEPOSIT_AMOUNT * 20);

    globalState = globalStatePda(program.programId);
    trustExpress = trustExpressPda(maker.publicKey, trustSeed, program.programId);
    trustExpressAta = await anchor.utils.token.associatedAddress({ mint, owner: trustExpress });
  });

  // ── 1. Initialize global state ─────────────────────────────────────────────
  it("initializes global state with validator defaults", async () => {
    await program.methods
      .initializeGlobalState()
      .accountsPartial({
        authority: authority.publicKey,
        globalState,
        mint,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const gs = await program.account.globalState.fetch(globalState);
    assert.equal(gs.requiredVotes, 3, "Default threshold should be 3");
    assert.equal(gs.validatorCount, 0, "No validators registered yet");
    assert.ok(
      gs.validators.every((v: PublicKey) => v.equals(PublicKey.default)),
      "All validator slots should be empty"
    );

    // Verify the fee pool authority PDA was stored correctly.
    // If this fails with PublicKey.default the local validator is running
    // stale GlobalState from a previous deploy — restart it with:
    //   solana-test-validator --reset   OR   anchor localnet (without --skip-local-validator)
    const expectedPoolAuthority = validatorFeePoolAuthorityPda(program.programId);
    assert.ok(
      gs.validatorFeePoolAuthority.equals(expectedPoolAuthority),
      `validatorFeePoolAuthority mismatch — got ${gs.validatorFeePoolAuthority.toBase58()}, ` +
        `expected ${expectedPoolAuthority.toBase58()}. ` +
        `Restart the local validator to clear stale GlobalState.`
    );
  });

  // ── 2. Register validators ─────────────────────────────────────────────────
  it("registers all 5 validators", async () => {
    for (let i = 0; i < 5; i++) {
      await program.methods
        .registerValidator(validators[i].publicKey)
        .accountsPartial({
          authority: authority.publicKey,
          globalState,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    }

    const gs = await program.account.globalState.fetch(globalState);
    assert.equal(gs.validatorCount, 5);
    for (let i = 0; i < 5; i++) {
      assert.ok(gs.validators[i].equals(validators[i].publicKey), `Slot ${i}`);
    }
  });

  it("rejects registering the same validator twice", async () => {
    try {
      await program.methods
        .registerValidator(validators[0].publicKey)
        .accountsPartial({
          authority: authority.publicKey,
          globalState,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      assert.fail("Should have thrown ValidatorAlreadyRegistered");
    } catch (e: any) {
      assert.include(e.toString(), "ValidatorAlreadyRegistered");
    }
  });

  it("rejects registering a 6th validator when slots full", async () => {
    const extra = Keypair.generate();
    try {
      await program.methods
        .registerValidator(extra.publicKey)
        .accountsPartial({
          authority: authority.publicKey,
          globalState,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      assert.fail("Should have thrown ValidatorSlotsFull");
    } catch (e: any) {
      assert.include(e.toString(), "ValidatorSlotsFull");
    }
  });

  it("removes a validator and frees the slot", async () => {
    await program.methods
      .removeValidator(validators[4].publicKey)
      .accountsPartial({
        authority: authority.publicKey,
        globalState,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const gs = await program.account.globalState.fetch(globalState);
    assert.equal(gs.validatorCount, 4);

    // Re-add so subsequent tests have 5 validators
    await program.methods
      .registerValidator(validators[4].publicKey)
      .accountsPartial({
        authority: authority.publicKey,
        globalState,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  });

  it("rejects threshold > validator_count", async () => {
    try {
      await program.methods
        .updateRequiredVotes(6)
        .accountsPartial({
          authority: authority.publicKey,
          globalState,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      assert.fail("Should have thrown InvalidVoteThreshold");
    } catch (e: any) {
      assert.include(e.toString(), "InvalidVoteThreshold");
    }
  });

  // ── 3. Create buy order + reservation ──────────────────────────────────────
  it("creates a buy order", async () => {
    await program.methods
      .createExpressBuyOrder(
        trustSeed,
        new BN(DEPOSIT_AMOUNT),
        new BN(PRICE_PER_TOKEN),
        "NGN",
        "Send to Account 1234",
        "FLW-CRED-001"
      )
      .accountsPartial({
        buyer: maker.publicKey,
        mint,
        trustExpress,
        globalState,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .signers([maker])
      .rpc();
  });

  it("taker creates a reservation (instant_reserve)", async () => {
    await program.methods
      .instantReserve(
        new BN(DEPOSIT_AMOUNT),
        new BN(FIAT_AMOUNT),
        "NGN",
        JSON.stringify({ account_number: "0123456789", bank_code: "044" })
      )
      .accountsPartial({
        trustExpress,
        maker: maker.publicKey,
        taker: taker.publicKey,
        mint,
        takerAta,
        trustExpressAta,
        globalState,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([taker])
      .rpc();

    const escrow = await getAccount(connection, trustExpressAta);
    assert.equal(escrow.amount.toString(), DEPOSIT_AMOUNT.toString());

    const te = await program.account.trustExpress.fetch(trustExpress);
    const reservation = te.reservedAmounts.find(
      (r: any) => r.taker.equals(taker.publicKey)
    );
    assert.ok(reservation, "Reservation should exist");
    actualPayoutReference = reservation.payoutReference as string;
    assert.ok(actualPayoutReference, "payout_reference should be set on-chain");
    console.log("    ℹ captured payout_reference:", actualPayoutReference);
  });

  // ── 4. Happy path: 3-of-5 approve → tokens released ───────────────────────
  it("releases tokens after 3 approve votes (3-of-5 consensus)", async () => {
    const votePda = validatorVotePda(trustExpress, actualPayoutReference, program.programId);
    const makerAtaBefore = await getAccount(connection, makerAta);

    for (let i = 0; i < 3; i++) {
      await program.methods
        .submitBuyVote(
          Array.from(referenceHash(actualPayoutReference)),
          actualPayoutReference,
          taker.publicKey,
          new BN(DEPOSIT_AMOUNT),
          new BN(FIAT_AMOUNT),
          "NGN",
          true,
          `flw_ref_${i}`
        )
        .accountsPartial({
          validator: validators[i].publicKey,
          globalState,
          validatorVote: votePda,
          trustExpress,
          maker: maker.publicKey,
          mint,
          trustExpressAta,
          feeDestinationAta,
          takerAta,
          makerAta,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
                      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
              validatorFeePoolAuthority: validatorFeePoolAuthorityPda(program.programId),
              validatorFeePoolAta: validatorFeePoolAta(validatorFeePoolAuthorityPda(program.programId), mint),
})
        .signers([validators[i]])
        .rpc();
    }

    const voteAccount = await program.account.validatorVote.fetch(votePda);
    assert.ok(voteAccount.executed, "Vote should be executed after 3 approvals");
    assert.equal(voteAccount.votesFor, 3);

    // Fee split: 20% platform / 60% maker rebate / 20% validator pool
    // total_fee   = DEPOSIT_AMOUNT * 5 / 10000          (5 bps  = 500 tokens)
    // maker_rebate = total_fee * 60 / 100               (3 bps  = 300 tokens)
    // net cost to maker = total_fee - maker_rebate      (2 bps  = 200 tokens)
    const totalFee         = Math.floor((DEPOSIT_AMOUNT * 5) / 10000);
    const makerRebate      = Math.floor(totalFee * 60 / 100);
    const platformFee      = Math.floor(totalFee * 20 / 100);
    const expectedReceived = DEPOSIT_AMOUNT - totalFee + makerRebate;
    const makerAtaAfter    = await getAccount(connection, makerAta);
    const received         = Number(makerAtaAfter.amount) - Number(makerAtaBefore.amount);
    assert.equal(received, expectedReceived, "Maker should receive tokens minus net fee (2 bps after 60% rebate)");

    const feeAta = await getAccount(connection, feeDestinationAta);
    assert.ok(Number(feeAta.amount) >= platformFee, "Fee destination should have received platform share");
  });

  // ── 5. Rejection path: 3 reject votes → refund ────────────────────────────
  it("refunds taker after 3 reject votes", async () => {
    // Fresh buy order — seed 42 is exhausted after test 4
    const seed2 = new BN(43);
    const trustExpress2 = trustExpressPda(maker.publicKey, seed2, program.programId);
    const trustExpressAta2 = await anchor.utils.token.associatedAddress({
      mint, owner: trustExpress2,
    });

    await program.methods
      .createExpressBuyOrder(
        seed2,
        new BN(DEPOSIT_AMOUNT),
        new BN(PRICE_PER_TOKEN),
        "NGN",
        "Send to Account 5678",
        "FLW-CRED-002"
      )
      .accountsPartial({
        buyer: maker.publicKey,
        mint,
        trustExpress: trustExpress2,
        globalState,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .signers([maker])
      .rpc();

    await mintTo(connection, authority.payer, mint, takerAta, authority.publicKey, DEPOSIT_AMOUNT);

    await program.methods
      .instantReserve(new BN(DEPOSIT_AMOUNT), new BN(FIAT_AMOUNT), "NGN", null)
      .accountsPartial({
        trustExpress: trustExpress2,
        maker: maker.publicKey,
        taker: taker.publicKey,
        mint,
        takerAta,
        trustExpressAta: trustExpressAta2,
        globalState,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([taker])
      .rpc();

    const te2    = await program.account.trustExpress.fetch(trustExpress2);
    const res2   = te2.reservedAmounts.find((r: any) => r.taker.equals(taker.publicKey));
    if (!res2) throw new Error("No pending reservation found for taker");
    const ref2   = res2.payoutReference as string;
    const votePda2 = validatorVotePda(trustExpress2, ref2, program.programId);

    const takerBefore = await getAccount(connection, takerAta);

    for (let i = 0; i < 3; i++) {
      await program.methods
        .submitBuyVote(
          Array.from(referenceHash(ref2)),
          ref2,
          taker.publicKey,
          new BN(DEPOSIT_AMOUNT),
          new BN(FIAT_AMOUNT),
          "NGN",
          false,
          "Payment not found in Flutterwave"
        )
        .accountsPartial({
          validator: validators[i].publicKey,
          globalState,
          validatorVote: votePda2,
          trustExpress: trustExpress2,
          maker: maker.publicKey,
          mint,
          trustExpressAta: trustExpressAta2,
          feeDestinationAta,
          takerAta,
          makerAta,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
                      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
              validatorFeePoolAuthority: validatorFeePoolAuthorityPda(program.programId),
              validatorFeePoolAta: validatorFeePoolAta(validatorFeePoolAuthorityPda(program.programId), mint),
})
        .signers([validators[i]])
        .rpc();
    }

    const voteAccount = await program.account.validatorVote.fetch(votePda2);
    assert.ok(voteAccount.executed, "Vote should be executed after impossible-to-approve");
    assert.equal(voteAccount.votesAgainst, 3);

    const takerAfter = await getAccount(connection, takerAta);
    const refunded   = Number(takerAfter.amount) - Number(takerBefore.amount);
    assert.equal(refunded, DEPOSIT_AMOUNT, "Taker should be fully refunded");
  });

  // ── 6. Duplicate vote rejected ─────────────────────────────────────────────
  it("rejects a validator voting twice on the same reservation", async () => {
    const seed3 = new BN(44);
    const trustExpress3 = trustExpressPda(maker.publicKey, seed3, program.programId);
    const trustExpressAta3 = await anchor.utils.token.associatedAddress({
      mint, owner: trustExpress3,
    });

    await program.methods
      .createExpressBuyOrder(
        seed3,
        new BN(DEPOSIT_AMOUNT),
        new BN(PRICE_PER_TOKEN),
        "NGN",
        "Send to Account 9999",
        "FLW-CRED-003"
      )
      .accountsPartial({
        buyer: maker.publicKey,
        mint,
        trustExpress: trustExpress3,
        globalState,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .signers([maker])
      .rpc();

    await mintTo(connection, authority.payer, mint, takerAta, authority.publicKey, DEPOSIT_AMOUNT);

    await program.methods
      .instantReserve(new BN(DEPOSIT_AMOUNT), new BN(FIAT_AMOUNT), "NGN", null)
      .accountsPartial({
        trustExpress: trustExpress3,
        maker: maker.publicKey,
        taker: taker.publicKey,
        mint,
        takerAta,
        trustExpressAta: trustExpressAta3,
        globalState,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([taker])
      .rpc();

    const te3    = await program.account.trustExpress.fetch(trustExpress3);
    const res3   = te3.reservedAmounts.find((r: any) => r.taker.equals(taker.publicKey));
    if (!res3) throw new Error("No pending reservation found for taker");
    const ref3   = res3.payoutReference as string;
    const votePda3 = validatorVotePda(trustExpress3, ref3, program.programId);

    // First vote — should succeed
    await program.methods
      .submitBuyVote(
        Array.from(referenceHash(ref3)),
        ref3,
        taker.publicKey,
        new BN(DEPOSIT_AMOUNT),
        new BN(FIAT_AMOUNT),
        "NGN",
        true,
        "ok"
      )
      .accountsPartial({
        validator: validators[0].publicKey,
        globalState,
        validatorVote: votePda3,
        trustExpress: trustExpress3,
        maker: maker.publicKey,
        mint,
        trustExpressAta: trustExpressAta3,
        feeDestinationAta,
        takerAta,
        makerAta,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
                    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
              validatorFeePoolAuthority: validatorFeePoolAuthorityPda(program.programId),
              validatorFeePoolAta: validatorFeePoolAta(validatorFeePoolAuthorityPda(program.programId), mint),
})
      .signers([validators[0]])
      .rpc();

    // Second vote from same validator — must fail
    try {
      await program.methods
        .submitBuyVote(
          Array.from(referenceHash(ref3)),
          ref3,
          taker.publicKey,
          new BN(DEPOSIT_AMOUNT),
          new BN(FIAT_AMOUNT),
          "NGN",
          true,
          "ok"
        )
        .accountsPartial({
          validator: validators[0].publicKey,
          globalState,
          validatorVote: votePda3,
          trustExpress: trustExpress3,
          maker: maker.publicKey,
          mint,
          trustExpressAta: trustExpressAta3,
          feeDestinationAta,
          takerAta,
          makerAta,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
                      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
              validatorFeePoolAuthority: validatorFeePoolAuthorityPda(program.programId),
              validatorFeePoolAta: validatorFeePoolAta(validatorFeePoolAuthorityPda(program.programId), mint),
})
        .signers([validators[0]])
        .rpc();
      assert.fail("Should have thrown AlreadyVoted");
    } catch (e: any) {
      assert.include(e.toString(), "AlreadyVoted");
    }
  });

  // ── 7. Non-validator rejected ──────────────────────────────────────────────
  it("rejects a vote from an unregistered signer", async () => {
    const rogue = Keypair.generate();
    await airdrop(connection, rogue.publicKey);

    // Create a fresh buy order with a live reservation so that:
    //   (a) trust_express PDA exists (account constraint passes)
    //   (b) trust_express_ata exists (token::authority constraint passes)
    // Without both, Anchor rejects the transaction before the handler runs
    // and we never reach the UnauthorizedValidator check.
    const seed4 = new BN(45);
    const trustExpress4 = trustExpressPda(maker.publicKey, seed4, program.programId);
    const trustExpressAta4 = await anchor.utils.token.associatedAddress({
      mint, owner: trustExpress4,
    });

    await program.methods
      .createExpressBuyOrder(
        seed4,
        new BN(DEPOSIT_AMOUNT),
        new BN(PRICE_PER_TOKEN),
        "NGN",
        "Send to Account 0000",
        "FLW-CRED-004"
      )
      .accountsPartial({
        buyer: maker.publicKey,
        mint,
        trustExpress: trustExpress4,
        globalState,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .signers([maker])
      .rpc();

    // Mint tokens to taker and create the reservation — this initialises the
    // trust_express_ata so the token::authority constraint is satisfied.
    await mintTo(connection, authority.payer, mint, takerAta, authority.publicKey, DEPOSIT_AMOUNT);

    await program.methods
      .instantReserve(new BN(DEPOSIT_AMOUNT), new BN(FIAT_AMOUNT), "NGN", null)
      .accountsPartial({
        trustExpress: trustExpress4,
        maker: maker.publicKey,
        taker: taker.publicKey,
        mint,
        takerAta,
        trustExpressAta: trustExpressAta4,
        globalState,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([taker])
      .rpc();

    const te4 = await program.account.trustExpress.fetch(trustExpress4);
    const res4 = te4.reservedAmounts.find((r: any) => r.taker.equals(taker.publicKey));
    if (!res4) throw new Error("No pending reservation found for taker");
    const ref4 = res4.payoutReference as string;
    const votePda4 = validatorVotePda(trustExpress4, ref4, program.programId);

    try {
      await program.methods
        .submitBuyVote(
          Array.from(referenceHash(ref4)),
          ref4,
          taker.publicKey,
          new BN(DEPOSIT_AMOUNT),
          new BN(FIAT_AMOUNT),
          "NGN",
          true,
          "hack"
        )
        .accountsPartial({
          validator: rogue.publicKey,
          globalState,
          validatorVote: votePda4,
          trustExpress: trustExpress4,
          maker: maker.publicKey,
          mint,
          trustExpressAta: trustExpressAta4,
          feeDestinationAta,
          takerAta,
          makerAta,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
                      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
              validatorFeePoolAuthority: validatorFeePoolAuthorityPda(program.programId),
              validatorFeePoolAta: validatorFeePoolAta(validatorFeePoolAuthorityPda(program.programId), mint),
})
        .signers([rogue])
        .rpc();
      assert.fail("Should have thrown UnauthorizedValidator");
    } catch (e: any) {
      assert.include(e.toString(), "UnauthorizedValidator");
    }
  });

  // ── 8. Expired vote — documented ──────────────────────────────────────────
  it("documents: finalize_expired_vote triggers refund after timeout", async () => {
    console.log(
      "  ⚠  Clock-manipulation test skipped in standard localnet.",
      "  Run with BanksClient or set VOTE_EXPIRY_SECONDS=1 in a test build."
    );
  });

  // ── 9. Sell-side happy path ────────────────────────────────────────────────
  it("releases tokens to buyer after 3 approve votes on sell order", async () => {
    const sellSeed = new BN(99);
    const sellExpress = trustExpressPda(taker.publicKey, sellSeed, program.programId);
    const sellExpressAta = await anchor.utils.token.associatedAddress({ mint, owner: sellExpress });
    const sellerAta = takerAta;
    const buyerAta  = makerAta;

    await mintTo(connection, authority.payer, mint, sellerAta, authority.publicKey, DEPOSIT_AMOUNT * 2);

    await program.methods
      .createExpressSell(
        sellSeed,
        new BN(DEPOSIT_AMOUNT),
        new BN(PRICE_PER_TOKEN),
        "NGN",
        "Send to GTB 0000111100",
        "FLW-SELL-001"
      )
      .accountsPartial({
        seller: taker.publicKey,
        mint,
        sellerAta,
        trustExpress: sellExpress,
        trustExpressAta: sellExpressAta,
        globalState,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .signers([taker])
      .rpc();

    const sellRef   = "IS-sell-test-000001";
    const sellTe    = await program.account.trustExpress.fetch(sellExpress);
    const available = sellTe.amount as BN;

    await program.methods
      .instantSellReserve(available, 0, null, sellRef)
      .accountsPartial({
        trustExpress: sellExpress,
        maker: taker.publicKey,
        buyer: maker.publicKey,
        globalState,
        systemProgram: SystemProgram.programId,
      })
      .signers([maker])
      .rpc();

    const sellVotePda = validatorVotePda(sellExpress, sellRef, program.programId);

    for (let i = 0; i < 3; i++) {
      await program.methods
        .submitSellVote(
          Array.from(referenceHash(sellRef)),
          sellRef,
          maker.publicKey,
          true,
          `sell_evidence_${i}`
        )
        .accountsPartial({
          validator: validators[i].publicKey,
          globalState,
          validatorVote: sellVotePda,
          trustExpress: sellExpress,
          maker: taker.publicKey,
          mint,
          trustExpressAta: sellExpressAta,
          feeDestinationAta,
          takerAta: buyerAta,
          makerAta,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          validatorFeePoolAuthority: validatorFeePoolAuthorityPda(program.programId),
          validatorFeePoolAta: validatorFeePoolAta(validatorFeePoolAuthorityPda(program.programId), mint),
        })
        .signers([validators[i]])
        .rpc();
    }

    const sv = await program.account.validatorVote.fetch(sellVotePda);
    assert.ok(sv.executed, "Sell vote should be executed");
    assert.equal(sv.votesFor, 3);

    const buyerAccount = await getAccount(connection, buyerAta);
    assert.ok(Number(buyerAccount.amount) > 0, "Buyer should have received tokens");
  });

  // ── 10. Partial-fill close fix (regression) ────────────────────────────────
  //
  // Bug: old condition was  !has_active_reservations && remaining_balance <= dust
  // For buy orders the ATA empties to 0 after every settlement, so the old
  // condition fired after the first partial fill and closed the escrow prematurely.
  //
  // Fix: added  order_fully_consumed = trust_express.amount == 0  as a third gate.
  // This test proves the fix is in place.

  describe("Partial-Fill Close Fix (regression)", () => {
    const TOTAL  = 3_000_000; // 3 tokens total capacity
    const FILL_A = 1_000_000; // first partial fill
    const FILL_B = 1_000_000; // second partial fill
    const FILL_C = 1_000_000; // final fill — should trigger close
    const PRICE  = 1_000;

    let tePda: PublicKey;
    let teAta: PublicKey;

    before(async () => {
      const seed = new BN(200);
      tePda = trustExpressPda(maker.publicKey, seed, program.programId);
      teAta = await anchor.utils.token.associatedAddress({ mint, owner: tePda });

      await program.methods
        .createExpressBuyOrder(
          seed,
          new BN(TOTAL),
          new BN(PRICE),
          "NGN",
          "partial-fill close fix test",
          "FLW-PARTIAL-001"
        )
        .accountsPartial({
          buyer: maker.publicKey,
          mint,
          trustExpress: tePda,
          globalState,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([maker])
        .rpc();

      // Fund taker
      await mintTo(connection, authority.payer, mint, takerAta, authority.publicKey, TOTAL * 3);
    });

    /** Reserve `amount` from taker and settle it with 3 approve votes. */
    async function fillAndSettle(amount: number) {
      await program.methods
        .instantReserve(
          new BN(amount),
          new BN(amount * PRICE),
          "NGN",
          null
        )
        .accountsPartial({
          trustExpress: tePda,
          maker: maker.publicKey,
          taker: taker.publicKey,
          mint,
          takerAta,
          trustExpressAta: teAta,
          globalState,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([taker])
        .rpc();

      const te  = await program.account.trustExpress.fetch(tePda);
      const res = te.reservedAmounts.find(
        (r: any) => r.taker.equals(taker.publicKey) && r.status === 0
      );
      if (!res) throw new Error("No pending reservation found for taker");
      const ref     = res.payoutReference as string;
      const votePda = validatorVotePda(tePda, ref, program.programId);

      for (let i = 0; i < 3; i++) {
        await program.methods
          .submitBuyVote(
            Array.from(referenceHash(ref)),
            ref,
            taker.publicKey,
            new BN(amount),
            new BN(amount * PRICE),
            "NGN",
            true,
            `ev${i}`
          )
          .accountsPartial({
            validator: validators[i].publicKey,
            globalState,
            validatorVote: votePda,
            trustExpress: tePda,
            maker: maker.publicKey,
            mint,
            trustExpressAta: teAta,
            feeDestinationAta,
            takerAta,
            makerAta,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
                        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
              validatorFeePoolAuthority: validatorFeePoolAuthorityPda(program.programId),
              validatorFeePoolAta: validatorFeePoolAta(validatorFeePoolAuthorityPda(program.programId), mint),
})
          .signers([validators[i]])
          .rpc();
      }
    }

    it("escrow stays open after first partial fill", async () => {
      await fillAndSettle(FILL_A);

      const te = await program.account.trustExpress.fetch(tePda).catch(() => null);
      assert.ok(
        te !== null,
        "BUG REGRESSION: escrow closed prematurely after fill A"
      );
      assert.equal(
        te.amount.toNumber(),
        TOTAL - FILL_A,
        "Remaining capacity should be TOTAL - FILL_A"
      );
    });

    it("escrow stays open after second partial fill", async () => {
      await fillAndSettle(FILL_B);

      const te = await program.account.trustExpress.fetch(tePda).catch(() => null);
      assert.ok(
        te !== null,
        "BUG REGRESSION: escrow closed prematurely after fill B"
      );
      assert.equal(
        te.amount.toNumber(),
        TOTAL - FILL_A - FILL_B,
        "Remaining capacity should be TOTAL - FILL_A - FILL_B"
      );
    });

    it("escrow closes exactly on final fill (amount == 0)", async () => {
      await fillAndSettle(FILL_C);

      const te = await program.account.trustExpress.fetch(tePda).catch(() => null);
      assert.isNull(
        te,
        "Escrow must be closed after FILL_C brings trust_express.amount to 0"
      );
    });
  });
});