// tests/trust-vault-errors_test.ts
//
// Covers every pause-related error path:
//   • BuyOrdersPaused on create
//   • BuyOrdersPaused on instant_reserve
//   • SellOrdersPaused on create
//   • SellOrdersPaused on instant_sell_reserve
//   • Pause does NOT block exits (cancel / withdraw)
//
// Also covers the partial-fill close-fix: a buy order that is partially
// settled via submitBuyVote must remain open until trust_express.amount == 0.

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
  createAssociatedTokenAccount,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { assert } from "chai";
import * as fs from "fs";
import { keccak256 } from "js-sha3";

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

describe("Trust Vault - Pause Error Tests", () => {
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

  // 5 validators used in the close-fix test
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
    buyer  = Keypair.generate();
    seller = Keypair.generate();
    taker  = Keypair.generate();

    await airdrop(authority.publicKey);
    await airdrop(buyer.publicKey);
    await airdrop(seller.publicKey);
    await airdrop(taker.publicKey);
    for (const v of validators) await airdrop(v.publicKey);

    mint = await createMint(connection, authority, authority.publicKey, null, 9);

    globalStatePda = getGlobalStatePda();

    await program.methods
      .initializeGlobalState()
      .accountsPartial({
        authority: authority.publicKey,
        globalState: globalStatePda,
        mint,
      })
      .rpc();

    // Register validators (idempotent — catch duplicate errors)
    for (const v of validators) {
      try {
        await program.methods
          .registerValidator(v.publicKey)
          .accountsPartial({ authority: authority.publicKey, globalState: globalStatePda })
          .rpc();
      } catch { /* already registered */ }
    }
  });

  // ── Buy Order Pause Errors ──────────────────────────────────────────────────

  describe("Buy Order Pause Errors", () => {
    it("Prevents creating buy order when buy orders are paused", async () => {
      await program.methods
        .pauseBuyOrders(true)
        .accountsPartial({
          authority: authority.publicKey,
          globalState: globalStatePda,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc();

      const seed = 8001;
      const pda = getTrustExpressPda(buyer.publicKey, seed);

      try {
        await program.methods
          .createExpressBuyOrder(
            new anchor.BN(seed),
            new anchor.BN(1000 * 10 ** 9),
            new anchor.BN(100),
            "USD",
            "Payment instructions for paused test",
            "flw_paused_test"
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
        assert.fail("Should have rejected buy order creation when paused");
      } catch (error) {
        assert.include((error as Error).toString(), "BuyOrdersPaused");
      }

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

    it("Prevents reservation on buy order when buy orders are paused", async () => {
      const seed = 8002;
      const pda = getTrustExpressPda(buyer.publicKey, seed);

      // Create while unpaused
      await program.methods
        .createExpressBuyOrder(
          new anchor.BN(seed),
          new anchor.BN(1000 * 10 ** 9),
          new anchor.BN(100),
          "USD",
          "Payment instructions",
          "flw_test"
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

      const takerAta = await getOrCreateAssociatedTokenAccount(
        connection, taker, mint, taker.publicKey
      );
      await mintTo(connection, authority, mint, takerAta.address, authority, 500 * 10 ** 9);
      const trustExpressAta = deriveAta(mint, pda);

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
            "USD",
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
        assert.fail("Should have rejected reservation when buy orders paused");
      } catch (error) {
        assert.include((error as Error).toString(), "BuyOrdersPaused");
      }

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

  // ── Sell Order Pause Errors ─────────────────────────────────────────────────

  describe("Sell Order Pause Errors", () => {
    it("Prevents creating sell order when sell orders are paused", async () => {
      await program.methods
        .pauseSellOrders(true)
        .accountsPartial({
          authority: authority.publicKey,
          globalState: globalStatePda,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc();

      const seed = 8101;
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
            "USD",
            "Payment instructions for paused test",
            "flw_paused_test"
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
        assert.fail("Should have rejected sell order creation when paused");
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

    it("Prevents reservation on sell order when sell orders are paused", async () => {
      const seed = 8102;
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
          "USD",
          "Payment instructions",
          "flw_test"
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
        assert.fail("Should have rejected reservation when sell orders paused");
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
  });

  // ── Pause Does Not Block Exits ──────────────────────────────────────────────

  describe("Pause Does Not Block Exits", () => {
    it("Allows cancellation even when buy orders paused", async () => {
      const seed = 8201;
      const pda = getTrustExpressPda(buyer.publicKey, seed);

      await program.methods
        .createExpressBuyOrder(
          new anchor.BN(seed),
          new anchor.BN(1000 * 10 ** 9),
          new anchor.BN(100),
          "USD",
          "Payment instructions",
          "flw_test"
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

      // Cancel must succeed while paused
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

    it("Allows withdrawal even when sell orders paused", async () => {
      const seed = 8202;
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
          "USD",
          "Payment instructions",
          "flw_test"
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

      // Withdrawal must succeed while paused
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

  // ── Partial-fill close-fix (error-suite perspective) ───────────────────────
  // Verifies that the old bug (premature close on partial fill) is gone.

  describe("Buy Order Partial-Fill Does Not Trigger Premature Close", () => {
    const TOTAL   = 2_000_000_000; // 2 tokens
    const FILL_1  = 800_000_000;   // 0.8 tokens — partial
    const FILL_2  = 1_200_000_000; // remaining 1.2 tokens — final
    const PRICE   = 100;

    let tePda: PublicKey;
    let teAta: PublicKey;
    let takerAtaAddr: PublicKey;
    let buyerAtaAddr: PublicKey;
    let feeDestAtaAddr: PublicKey;

    before(async () => {
      const seed = 8300;
      tePda = getTrustExpressPda(buyer.publicKey, seed);
      teAta = deriveAta(mint, tePda);

      // Create the buy order
      await program.methods
        .createExpressBuyOrder(
          new anchor.BN(seed),
          new anchor.BN(TOTAL),
          new anchor.BN(PRICE),
          "NGN",
          "pay via FLW",
          "FLW-ERR-PARTIAL"
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

      // Fund taker
      const takerAtaAcc = await getOrCreateAssociatedTokenAccount(
        connection, taker, mint, taker.publicKey
      );
      takerAtaAddr = takerAtaAcc.address;
      await mintTo(connection, authority, mint, takerAtaAddr, authority, TOTAL * 2);

      // Create buyer + fee ATAs
      const buyerAtaAcc = await getOrCreateAssociatedTokenAccount(
        connection, buyer, mint, buyer.publicKey
      );
      buyerAtaAddr = buyerAtaAcc.address;

      const feeAcc = await getOrCreateAssociatedTokenAccount(
        connection, authority, mint, authority.publicKey
      );
      feeDestAtaAddr = feeAcc.address;
    });

    /** Reserve amount from taker and settle with 3 approve votes. Returns pda. */
    async function settle(amount: number): Promise<void> {
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
          takerAta: takerAtaAddr,
          trustExpressAta: teAta,
          globalState: globalStatePda,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([taker])
        .rpc();

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
            `ev${i}`
          )
          .accountsPartial({
            validator: validators[i].publicKey,
            globalState: globalStatePda,
            validatorVote: votePda,
            trustExpress: tePda,
            maker: buyer.publicKey,
            mint,
            trustExpressAta: teAta,
            feeDestinationAta: feeDestAtaAddr,
            takerAta: takerAtaAddr,
            makerAta: buyerAtaAddr,
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

    it("account stays open after first partial settlement", async () => {
      await settle(FILL_1);

      const te = await program.account.trustExpress.fetch(tePda).catch(() => null);
      assert.ok(
        te !== null,
        "BUG REGRESSION: escrow closed prematurely after partial fill"
      );
      assert.equal(
        te.amount.toNumber(),
        TOTAL - FILL_1,
        "Remaining capacity must equal TOTAL - FILL_1"
      );
    });

    it("account closes only after the final settlement", async () => {
      await settle(FILL_2);

      const te = await program.account.trustExpress.fetch(tePda).catch(() => null);
      assert.isNull(
        te,
        "Escrow must be closed after the final fill where amount reaches 0"
      );
    });
  });
});