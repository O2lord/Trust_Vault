// tests/trust-vault_test.ts
//
// Covers:
//   • Global-state initialisation
//   • Admin pause controls — buy orders and sell orders independently
//   • Pause does NOT block exits (cancel / withdraw)
//   • Partial-fill close-fix: buy order stays open after partial settlement

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { TrustVault } from "../target/types/trust_vault";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { assert, expect } from "chai";
import * as fs from "fs";
import { keccak256 } from "js-sha3";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Derive an ATA address without creating it on-chain. */
function deriveAta(mint: PublicKey, owner: PublicKey): PublicKey {
  const [ata] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  return ata;
}

function loadAuthorityKeypair(): Keypair {
  try {
    const data = JSON.parse(
      fs.readFileSync(
        "/Users/o2lord/keypairs/solana-hackathon/TVogEsLNMyh3sVSPSnzYsCQjLM9nPRzMA9XNpx34Fpy.json",
        "utf-8"
      )
    );
    return Keypair.fromSecretKey(new Uint8Array(data));
  } catch {
    return Keypair.fromSeed(new Uint8Array(32).fill(1));
  }
}

function referenceHashBytes(ref: string): number[] {
  return Array.from(Buffer.from(keccak256.array(ref)));
}

function validatorVotePda(
  trustExpress: PublicKey,
  payoutRef: string,
  programId: PublicKey
): PublicKey {
  const refHash = Buffer.from(keccak256.array(payoutRef));
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("validator-vote"), trustExpress.toBuffer(), refHash],
    programId
  );
  return pda;
}


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
  return deriveAta(mint, feePoolAuthority);
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe("Trust Vault", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.TrustVault as Program<TrustVault>;
  const connection = provider.connection;

  let authority: Keypair;
  let buyer: Keypair;
  let seller: Keypair;
  let taker: Keypair;
  let mint: PublicKey;
  let globalStatePda: PublicKey;

  // 5 validators for the partial-fill close test
  const validators = Array.from({ length: 5 }, () => Keypair.generate());

  async function airdrop(publicKey: PublicKey, amount = 2 * LAMPORTS_PER_SOL) {
    const sig = await connection.requestAirdrop(publicKey, amount);
    await connection.confirmTransaction(sig);
  }

  function getTrustExpressPda(maker: PublicKey, seed: number): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("trust-express"),
        maker.toBuffer(),
        new anchor.BN(seed).toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );
    return pda;
  }

  function getGlobalStatePda(): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("global-state")],
      program.programId
    );
    return pda;
  }

  before(async () => {
    authority = loadAuthorityKeypair();
    buyer = Keypair.generate();
    seller = Keypair.generate();
    taker = Keypair.generate();

    await airdrop(authority.publicKey);
    await airdrop(buyer.publicKey);
    await airdrop(seller.publicKey);
    await airdrop(taker.publicKey);
    for (const v of validators) await airdrop(v.publicKey);

    mint = await createMint(
      connection,
      authority,
      authority.publicKey,
      null,
      9
    );

    globalStatePda = getGlobalStatePda();
  });

  // ── Initialisation ──────────────────────────────────────────────────────────

  describe("Initialization", () => {
    it("Initializes or verifies global state", async () => {
      await program.methods
        .initializeGlobalState()
        .accountsPartial({
          authority: authority.publicKey,
          globalState: globalStatePda,
          mint,
        })
        .rpc();

      const gs = await program.account.globalState.fetch(globalStatePda);
      expect(gs.authority.toString()).to.equal(authority.publicKey.toString());
      expect(gs.tokenDecimals).to.equal(9);
      expect(gs.feePercentage).to.equal(5);
      expect(gs.totalTrustExpressCreated.toNumber()).to.be.greaterThanOrEqual(0);
    });

    it("Registers validators for subsequent tests", async () => {
      for (const v of validators) {
        try {
          await program.methods
            .registerValidator(v.publicKey)
            .accountsPartial({ authority: authority.publicKey, globalState: globalStatePda })
            .rpc();
        } catch {
          // Already registered — ignore
        }
      }
      const gs = await program.account.globalState.fetch(globalStatePda);
      assert.ok(gs.validatorCount >= 5, "At least 5 validators should be registered");
    });
  });

  // ── Admin Pause Controls ────────────────────────────────────────────────────

  describe("Admin Pause Controls", () => {

    // ── Buy Order Pause ──────────────────────────────────────────────────────

    describe("Buy Order Pause", () => {
      it("Pauses buy order creation globally", async () => {
        await program.methods
          .pauseBuyOrders(true)
          .accountsPartial({
            authority: authority.publicKey,
            globalState: globalStatePda,
            systemProgram: SystemProgram.programId,
          })
          .signers([authority])
          .rpc();

        const gs = await program.account.globalState.fetch(globalStatePda);
        assert.equal(gs.buyOrdersPaused, true);

        const seed = 9001;
        const pda = getTrustExpressPda(buyer.publicKey, seed);

        try {
          await program.methods
            .createExpressBuyOrder(
              new anchor.BN(seed),
              new anchor.BN(1000 * 10 ** 9),
              new anchor.BN(100),
              "NGN",
              "Payment instructions",
              "flw_cred_test"
            )
            .accountsPartial({
              buyer: buyer.publicKey,
              mint,
              trustExpress: pda,
              globalState: globalStatePda,
              systemProgram: SystemProgram.programId,
              tokenProgram: TOKEN_PROGRAM_ID,
              associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            })
            .signers([buyer])
            .rpc();
          assert.fail("Should have failed — buy order creation paused");
        } catch (error) {
          assert.include((error as Error).toString(), "BuyOrdersPaused");
        }

        // Unpause
        await program.methods
          .pauseBuyOrders(false)
          .accountsPartial({
            authority: authority.publicKey,
            globalState: globalStatePda,
            systemProgram: SystemProgram.programId,
          })
          .signers([authority])
          .rpc();
      });

      it("Prevents reservations on buy orders when paused", async () => {
        const seed = 9002;
        const pda = getTrustExpressPda(buyer.publicKey, seed);

        // Create order while unpaused
        await program.methods
          .createExpressBuyOrder(
            new anchor.BN(seed),
            new anchor.BN(1000 * 10 ** 9),
            new anchor.BN(100),
            "NGN",
            "Payment instructions",
            "flw_cred_test"
          )
          .accountsPartial({
            buyer: buyer.publicKey,
            mint,
            trustExpress: pda,
            globalState: globalStatePda,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          })
          .signers([buyer])
          .rpc();

        // Mint tokens for taker
        const takerAta = await getOrCreateAssociatedTokenAccount(
          connection, taker, mint, taker.publicKey
        );
        await mintTo(connection, authority, mint, takerAta.address, authority, 500 * 10 ** 9);

        const trustExpressAta = deriveAta(mint, pda);

        // Pause
        await program.methods
          .pauseBuyOrders(true)
          .accountsPartial({
            authority: authority.publicKey,
            globalState: globalStatePda,
            systemProgram: SystemProgram.programId,
          })
          .signers([authority])
          .rpc();

        try {
          await program.methods
            .instantReserve(
              new anchor.BN(100 * 10 ** 9),
              new anchor.BN(10000),
              "NGN",
              null
            )
            .accountsPartial({
              trustExpress: pda,
              maker: buyer.publicKey,
              taker: taker.publicKey,
              mint,
              takerAta: takerAta.address,
              trustExpressAta,
              globalState: globalStatePda,
              tokenProgram: TOKEN_PROGRAM_ID,
              associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
              systemProgram: SystemProgram.programId,
            })
            .signers([taker])
            .rpc();
          assert.fail("Should have failed — buy order reservations paused");
        } catch (error) {
          assert.include((error as Error).toString(), "BuyOrdersPaused");
        }

        // Unpause
        await program.methods
          .pauseBuyOrders(false)
          .accountsPartial({
            authority: authority.publicKey,
            globalState: globalStatePda,
            systemProgram: SystemProgram.programId,
          })
          .signers([authority])
          .rpc();
      });

      it("Still allows cancellations when buy orders paused", async () => {
        const seed = 9003;
        const pda = getTrustExpressPda(buyer.publicKey, seed);

        await program.methods
          .createExpressBuyOrder(
            new anchor.BN(seed),
            new anchor.BN(1000 * 10 ** 9),
            new anchor.BN(100),
            "NGN",
            "Payment instructions",
            "flw_cred_test"
          )
          .accountsPartial({
            buyer: buyer.publicKey,
            mint,
            trustExpress: pda,
            globalState: globalStatePda,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          })
          .signers([buyer])
          .rpc();

        await program.methods
          .pauseBuyOrders(true)
          .accountsPartial({
            authority: authority.publicKey,
            globalState: globalStatePda,
            systemProgram: SystemProgram.programId,
          })
          .signers([authority])
          .rpc();

        // Cancel should still succeed
        await program.methods
          .cancelOrReduceBuyOrder(new anchor.BN(0))
          .accountsPartial({
            buyer: buyer.publicKey,
            trustExpress: pda,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([buyer])
          .rpc();

        await program.methods
          .pauseBuyOrders(false)
          .accountsPartial({
            authority: authority.publicKey,
            globalState: globalStatePda,
            systemProgram: SystemProgram.programId,
          })
          .signers([authority])
          .rpc();
      });
    });

    // ── Sell Order Pause ─────────────────────────────────────────────────────

    describe("Sell Order Pause", () => {
      it("Pauses sell order creation globally", async () => {
        await program.methods
          .pauseSellOrders(true)
          .accountsPartial({
            authority: authority.publicKey,
            globalState: globalStatePda,
            systemProgram: SystemProgram.programId,
          })
          .signers([authority])
          .rpc();

        const gs = await program.account.globalState.fetch(globalStatePda);
        assert.equal(gs.sellOrdersPaused, true);

        const seed = 9101;
        const pda = getTrustExpressPda(seller.publicKey, seed);
        const sellerAta = await getOrCreateAssociatedTokenAccount(
          connection, seller, mint, seller.publicKey
        );
        await mintTo(connection, authority, mint, sellerAta.address, authority, 1000 * 10 ** 9);
        const trustExpressAta = deriveAta(mint, pda);

        try {
          await program.methods
            .createExpressSell(
              new anchor.BN(seed),
              new anchor.BN(1000 * 10 ** 9),
              new anchor.BN(100),
              "NGN",
              "Payment instructions",
              "flw_cred_test"
            )
            .accountsPartial({
              seller: seller.publicKey,
              mint,
              sellerAta: sellerAta.address,
              trustExpress: pda,
              trustExpressAta,
              globalState: globalStatePda,
              systemProgram: SystemProgram.programId,
              tokenProgram: TOKEN_PROGRAM_ID,
              associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            })
            .signers([seller])
            .rpc();
          assert.fail("Should have failed — sell order creation paused");
        } catch (error) {
          assert.include((error as Error).toString(), "SellOrdersPaused");
        }

        await program.methods
          .pauseSellOrders(false)
          .accountsPartial({
            authority: authority.publicKey,
            globalState: globalStatePda,
            systemProgram: SystemProgram.programId,
          })
          .signers([authority])
          .rpc();
      });

      it("Prevents reservations on sell orders when paused", async () => {
        const seed = 9102;
        const pda = getTrustExpressPda(seller.publicKey, seed);
        const sellerAta = await getOrCreateAssociatedTokenAccount(
          connection, seller, mint, seller.publicKey
        );
        await mintTo(connection, authority, mint, sellerAta.address, authority, 1000 * 10 ** 9);
        const trustExpressAta = deriveAta(mint, pda);

        // Create while unpaused
        await program.methods
          .createExpressSell(
            new anchor.BN(seed),
            new anchor.BN(1000 * 10 ** 9),
            new anchor.BN(100),
            "NGN",
            "Payment instructions",
            "flw_cred_test"
          )
          .accountsPartial({
            seller: seller.publicKey,
            mint,
            sellerAta: sellerAta.address,
            trustExpress: pda,
            trustExpressAta,
            globalState: globalStatePda,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          })
          .signers([seller])
          .rpc();

        // Pause
        await program.methods
          .pauseSellOrders(true)
          .accountsPartial({
            authority: authority.publicKey,
            globalState: globalStatePda,
            systemProgram: SystemProgram.programId,
          })
          .signers([authority])
          .rpc();

        try {
          await program.methods
            .instantSellReserve(
              new anchor.BN(100 * 10 ** 9),
              0,
              null,
              "PAUSE-TEST-REF"
            )
            .accountsPartial({
              trustExpress: pda,
              maker: seller.publicKey,
              buyer: taker.publicKey,
              globalState: globalStatePda,
              systemProgram: SystemProgram.programId,
            })
            .signers([taker])
            .rpc();
          assert.fail("Should have failed — sell order reservations paused");
        } catch (error) {
          assert.include((error as Error).toString(), "SellOrdersPaused");
        }

        await program.methods
          .pauseSellOrders(false)
          .accountsPartial({
            authority: authority.publicKey,
            globalState: globalStatePda,
            systemProgram: SystemProgram.programId,
          })
          .signers([authority])
          .rpc();
      });

      it("Still allows withdrawals when sell orders paused", async () => {
        const seed = 9103;
        const pda = getTrustExpressPda(seller.publicKey, seed);
        const sellerAta = await getOrCreateAssociatedTokenAccount(
          connection, seller, mint, seller.publicKey
        );
        await mintTo(connection, authority, mint, sellerAta.address, authority, 1000 * 10 ** 9);
        const trustExpressAta = deriveAta(mint, pda);

        await program.methods
          .createExpressSell(
            new anchor.BN(seed),
            new anchor.BN(1000 * 10 ** 9),
            new anchor.BN(100),
            "NGN",
            "Payment instructions",
            "flw_cred_test"
          )
          .accountsPartial({
            seller: seller.publicKey,
            mint,
            sellerAta: sellerAta.address,
            trustExpress: pda,
            trustExpressAta,
            globalState: globalStatePda,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          })
          .signers([seller])
          .rpc();

        await program.methods
          .pauseSellOrders(true)
          .accountsPartial({
            authority: authority.publicKey,
            globalState: globalStatePda,
            systemProgram: SystemProgram.programId,
          })
          .signers([authority])
          .rpc();

        // Withdrawal should succeed even while paused
        await program.methods
          .expressWithdraw(new anchor.BN(100 * 10 ** 9))
          .accountsPartial({
            maker: seller.publicKey,
            mint,
            trustExpress: pda,
            trustExpressAta,
            makerAta: sellerAta.address,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          })
          .signers([seller])
          .rpc();

        await program.methods
          .pauseSellOrders(false)
          .accountsPartial({
            authority: authority.publicKey,
            globalState: globalStatePda,
            systemProgram: SystemProgram.programId,
          })
          .signers([authority])
          .rpc();
      });
    });

    it("Can pause buy and sell orders independently", async () => {
      // Pause only buy orders
      await program.methods
        .pauseBuyOrders(true)
        .accountsPartial({
          authority: authority.publicKey,
          globalState: globalStatePda,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc();

      let gs = await program.account.globalState.fetch(globalStatePda);
      assert.equal(gs.buyOrdersPaused, true);
      assert.equal(gs.sellOrdersPaused, false, "Sell orders must still be active");

      // Flip: unpause buy, pause sell
      await program.methods
        .pauseBuyOrders(false)
        .accountsPartial({
          authority: authority.publicKey,
          globalState: globalStatePda,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc();

      await program.methods
        .pauseSellOrders(true)
        .accountsPartial({
          authority: authority.publicKey,
          globalState: globalStatePda,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc();

      gs = await program.account.globalState.fetch(globalStatePda);
      assert.equal(gs.buyOrdersPaused, false, "Buy orders must be unpaused");
      assert.equal(gs.sellOrdersPaused, true);

      // Restore
      await program.methods
        .pauseSellOrders(false)
        .accountsPartial({
          authority: authority.publicKey,
          globalState: globalStatePda,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc();
    });
  });

  // ── Partial-fill close-fix ──────────────────────────────────────────────────
  // Re-tests the core bug from a high-level perspective: a buy order that is
  // partially filled must stay open; only the final fill may close it.

  describe("Buy Order Partial-Fill Close Fix (smoke)", () => {
    const TOTAL   = 1_000_000_000; // 1 token (9 decimals)
    const PARTIAL = 400_000_000;   // 0.4 tokens
    const PRICE   = 100;

    it("escrow stays open after partial fill, closes only on final fill", async () => {
      // ── Setup: register validators if needed ────────────────────────────────
      // (already done in Initialization describe above — safe to re-call)

      // ── Create buy order ────────────────────────────────────────────────────
      const seed = 9500;
      const tePda = getTrustExpressPda(buyer.publicKey, seed);
      const teAta = deriveAta(mint, tePda);

      await program.methods
        .createExpressBuyOrder(
          new anchor.BN(seed),
          new anchor.BN(TOTAL),
          new anchor.BN(PRICE),
          "NGN",
          "pay via FLW",
          "FLW-SMOKE-TEST"
        )
        .accountsPartial({
          buyer: buyer.publicKey,
          mint,
          trustExpress: tePda,
          globalState: globalStatePda,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([buyer])
        .rpc();

      // ── Taker setup ─────────────────────────────────────────────────────────
      const takerAta = await getOrCreateAssociatedTokenAccount(
        connection, taker, mint, taker.publicKey
      );
      await mintTo(connection, authority, mint, takerAta.address, authority, TOTAL * 2);

      const buyerAta = await getOrCreateAssociatedTokenAccount(
        connection, buyer, mint, buyer.publicKey
      );
      const feeDestAta = await getOrCreateAssociatedTokenAccount(
        connection, authority, mint, authority.publicKey
      );

      // ── Helper: reserve + vote 3-of-5 ───────────────────────────────────────
      async function fillAmount(amount: number, refLabel: string) {
        await program.methods
          .instantReserve(
            new anchor.BN(amount),
            new anchor.BN(amount * PRICE),
            "NGN",
            null
          )
          .accountsPartial({
            trustExpress: tePda,
            maker: buyer.publicKey,
            taker: taker.publicKey,
            mint,
            takerAta: takerAta.address,
            trustExpressAta: teAta,
            globalState: globalStatePda,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([taker])
          .rpc();

        // Capture auto-generated payout_reference
        const te = await program.account.trustExpress.fetch(tePda);
        const res = te.reservedAmounts.find(
          (r: any) => r.taker.equals(taker.publicKey) && r.status === 0
        );
        if (!res) throw new Error("No pending reservation found for taker");
        const ref = res.payoutReference as string;
        const votePda = validatorVotePda(tePda, ref, program.programId);

        for (let i = 0; i < 3; i++) {
          await program.methods
            .submitBuyVote(
              referenceHashBytes(ref),
              ref,
              taker.publicKey,
              new anchor.BN(amount),
              new anchor.BN(amount * PRICE),
              "NGN",
              true,
              `evidence_${i}`
            )
            .accountsPartial({
              validator: validators[i].publicKey,
              globalState: globalStatePda,
              validatorVote: votePda,
              trustExpress: tePda,
              maker: buyer.publicKey,
              mint,
              trustExpressAta: teAta,
              feeDestinationAta: feeDestAta.address,
              takerAta: takerAta.address,
              makerAta: buyerAta.address,
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

      // ── Partial fill 1 ──────────────────────────────────────────────────────
      await fillAmount(PARTIAL, "fill1");

      let te = await program.account.trustExpress.fetch(tePda).catch(() => null);
      assert.ok(te !== null, "Escrow must NOT close after partial fill #1");
      assert.equal(
        te.amount.toNumber(),
        TOTAL - PARTIAL,
        "Remaining capacity should be TOTAL - PARTIAL after fill #1"
      );

      // ── Partial fill 2 (fills the remaining capacity exactly) ───────────────
      const remaining = TOTAL - PARTIAL;
      await fillAmount(remaining, "fill2");

      te = await program.account.trustExpress.fetch(tePda).catch(() => null);
      assert.isNull(te, "Escrow MUST close after final fill (amount reaches 0)");
    });
  });
});