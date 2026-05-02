// tests/trust-vault-integration_test.ts
//
// Covers:
//   • Multiple concurrent reservations on a sell order
//   • Confirm payments independently (approve + reject path)
//   • Partial withdrawals with proportional fee recalculation
//   • Complete buy-order lifecycle from creation to auto-close
//   • Fee distribution across multiple transactions
//   • Partial-fill close fix: buy order stays open after partial settlement

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { TrustVault } from "../target/types/trust_vault";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  LAMPORTS_PER_SOL,
  Transaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
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
    const keypairPath =
      "/Users/o2lord/keypairs/solana-hackathon/TVogEsLNMyh3sVSPSnzYsCQjLM9nPRzMA9XNpx34Fpy.json";
    const keypairData = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
    return Keypair.fromSecretKey(new Uint8Array(keypairData));
  } catch {
    console.warn("Could not load authority keypair, using deterministic seed");
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

describe("Trust Vault - Integration Tests", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.TrustVault as Program<TrustVault>;
  const connection = provider.connection;

  let authority: Keypair;
  let seller: Keypair;
  let buyer1: Keypair;
  let buyer2: Keypair;
  let botAuthority: Keypair;
  let mint: PublicKey;
  let globalStatePda: PublicKey;

  // 5 validators used in the partial-fill close-fix test
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
    authority    = loadAuthorityKeypair();
    seller       = Keypair.generate();
    buyer1       = Keypair.generate();
    buyer2       = Keypair.generate();
    botAuthority = Keypair.generate();

    await airdrop(authority.publicKey);
    await airdrop(seller.publicKey);
    await airdrop(buyer1.publicKey);
    await airdrop(buyer2.publicKey);
    await airdrop(botAuthority.publicKey);
    for (const v of validators) await airdrop(v.publicKey);

    mint = await createMint(connection, authority, authority.publicKey, null, 9);

    globalStatePda = getGlobalStatePda();

    await program.methods
      .initializeGlobalState()
      .accountsPartial({
        authority: authority.publicKey,
        globalState: globalStatePda,
        mint,
        systemProgram: SystemProgram.programId,
      })
      .signers([authority])
      .rpc();

    const gs = await program.account.globalState.fetch(globalStatePda);
    assert.equal(
      gs.authority.toString(),
      authority.publicKey.toString(),
      "Authority mismatch — global state not properly initialized"
    );

    // Register validators (idempotent)
    for (const v of validators) {
      try {
        await program.methods
          .registerValidator(v.publicKey)
          .accountsPartial({ authority: authority.publicKey, globalState: globalStatePda })
          .rpc();
      } catch { /* already registered */ }
    }
  });

  // ── Multiple Concurrent Reservations ───────────────────────────────────────

  describe("Multiple Concurrent Reservations", () => {
    const sellOrderSeed = 500;
    let sellOrderPda: PublicKey;

    it("Handles multiple buyers reserving from same sell order", async () => {
      sellOrderPda = getTrustExpressPda(seller.publicKey, sellOrderSeed);

      const sellerAta = await getOrCreateAssociatedTokenAccount(
        connection, seller, mint, seller.publicKey
      );
      await mintTo(connection, authority, mint, sellerAta.address, authority, 5000 * 10 ** 9);

      const trustExpressAta = deriveAta(mint, sellOrderPda);

      await program.methods
        .createExpressSell(
          new anchor.BN(sellOrderSeed),
          new anchor.BN(5000 * 10 ** 9),
          new anchor.BN(100),
          "USD",
          "Bank transfer to account XYZ",
          "flw_multi_test"
        )
        .accountsPartial({
          seller: seller.publicKey,
          mint,
          sellerAta: sellerAta.address,
          trustExpress: sellOrderPda,
          trustExpressAta,
          globalState: globalStatePda,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([seller])
        .rpc();

      await program.methods
        .instantSellReserve(new anchor.BN(1000 * 10 ** 9), 0, "buyer1-details", "BUYER1-REF")
        .accountsPartial({
          trustExpress: sellOrderPda,
          maker: seller.publicKey,
          buyer: buyer1.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([buyer1])
        .rpc();

      await program.methods
        .instantSellReserve(new anchor.BN(800 * 10 ** 9), 1, "buyer2-details", "BUYER2-REF")
        .accountsPartial({
          trustExpress: sellOrderPda,
          maker: seller.publicKey,
          buyer: buyer2.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([buyer2])
        .rpc();

      const sellOrder = await program.account.trustExpress.fetch(sellOrderPda);
      assert.equal(sellOrder.reservedAmounts.length, 2);

      const b1Res = sellOrder.reservedAmounts.find(
        (r) => r.taker.toString() === buyer1.publicKey.toString()
      );
      const b2Res = sellOrder.reservedAmounts.find(
        (r) => r.taker.toString() === buyer2.publicKey.toString()
      );
      assert.isDefined(b1Res);
      assert.isDefined(b2Res);
      assert.equal(b1Res!.amount.toString(), (1000 * 10 ** 9).toString());
      assert.equal(b2Res!.amount.toString(), (800 * 10 ** 9).toString());
    });

    it("Confirms payments for multiple buyers independently", async () => {
      const buyer1Ata = await getOrCreateAssociatedTokenAccount(
        connection, buyer1, mint, buyer1.publicKey
      );
      const buyer2Ata = await getOrCreateAssociatedTokenAccount(
        connection, buyer2, mint, buyer2.publicKey
      );
      const feeDestinationAta = await getOrCreateAssociatedTokenAccount(
        connection, authority, mint, authority.publicKey
      );
      const trustExpressAta = deriveAta(mint, sellOrderPda);

      const sellerAtaForClose1 = await getOrCreateAssociatedTokenAccount(
        connection, seller, mint, seller.publicKey
      );

      // Confirm buyer1 — approve
      const confirmBuyer1Ix = await program.methods
        .confirmSellPayment(buyer1.publicKey, "BUYER1-REF", true, "Payment received from buyer1")
        .accountsPartial({
          trustExpress: sellOrderPda,
          botAuthority: botAuthority.publicKey,
          maker: seller.publicKey,
          mint,
          trustExpressAta,
          feeDestinationAta: feeDestinationAta.address,
          takerAta: buyer1Ata.address,
          makerAta: sellerAtaForClose1.address,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction();

      confirmBuyer1Ix.keys?.forEach((key) => {
        if (
          key.pubkey.equals(feeDestinationAta.address) ||
          key.pubkey.equals(buyer1Ata.address) ||
          key.pubkey.equals(sellerAtaForClose1.address) ||
          key.pubkey.equals(sellOrderPda)
        ) {
          key.isWritable = true;
        }
      });

      await provider.sendAndConfirm!(new Transaction().add(confirmBuyer1Ix), [botAuthority]);

      const buyer1Account = await getAccount(connection, buyer1Ata.address);
      assert.equal(buyer1Account.amount.toString(), (1000 * 10 ** 9).toString());

      // Confirm buyer2 — reject
      const sellerAtaForClose2 = await getOrCreateAssociatedTokenAccount(
        connection, seller, mint, seller.publicKey
      );
      const confirmBuyer2Ix = await program.methods
        .confirmSellPayment(buyer2.publicKey, "BUYER2-REF", false, "Payment failed for buyer2")
        .accountsPartial({
          trustExpress: sellOrderPda,
          botAuthority: botAuthority.publicKey,
          maker: seller.publicKey,
          mint,
          trustExpressAta,
          feeDestinationAta: feeDestinationAta.address,
          takerAta: buyer2Ata.address,
          makerAta: sellerAtaForClose2.address,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction();

      confirmBuyer2Ix.keys?.forEach((key) => {
        if (
          key.pubkey.equals(feeDestinationAta.address) ||
          key.pubkey.equals(buyer2Ata.address) ||
          key.pubkey.equals(sellerAtaForClose2.address) ||
          key.pubkey.equals(sellOrderPda)
        ) {
          key.isWritable = true;
        }
      });

      await provider.sendAndConfirm!(new Transaction().add(confirmBuyer2Ix), [botAuthority]);

      const buyer2Account = await getAccount(connection, buyer2Ata.address);
      assert.equal(buyer2Account.amount.toString(), "0");

      const sellOrder = await program.account.trustExpress.fetch(sellOrderPda);
      const b2Res = sellOrder.reservedAmounts.find(
        (r) => r.taker.toString() === buyer2.publicKey.toString()
      );
      assert.isUndefined(b2Res, "buyer2 reservation should be removed after rejection");
    });
  });

  // ── Partial Withdrawals with Fee Calculations ───────────────────────────────

  describe("Partial Withdrawals with Fee Calculations", () => {
    it("Correctly calculates proportional fees on partial withdrawals", async () => {
      const seed = 600;
      const pda  = getTrustExpressPda(seller.publicKey, seed);
      const ata  = deriveAta(mint, pda);

      const sellerAta = await getOrCreateAssociatedTokenAccount(
        connection, seller, mint, seller.publicKey
      );
      await mintTo(connection, authority, mint, sellerAta.address, authority, 10000 * 10 ** 9);

      await program.methods
        .createExpressSell(
          new anchor.BN(seed),
          new anchor.BN(10000 * 10 ** 9),
          new anchor.BN(100),
          "USD",
          "Payment instructions",
          "flw_partial_test"
        )
        .accountsPartial({
          seller: seller.publicKey,
          mint,
          sellerAta: sellerAta.address,
          trustExpress: pda,
          trustExpressAta: ata,
          globalState: globalStatePda,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([seller])
        .rpc();

      await program.methods
        .instantSellReserve(new anchor.BN(5000 * 10 ** 9), 0, null, "PARTIAL-TEST-1")
        .accountsPartial({
          trustExpress: pda,
          maker: seller.publicKey,
          buyer: buyer1.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([buyer1])
        .rpc();

      const buyer1Ata      = await getOrCreateAssociatedTokenAccount(connection, buyer1, mint, buyer1.publicKey);
      const feeDestAta     = await getOrCreateAssociatedTokenAccount(connection, authority, mint, authority.publicKey);

      const confirmPartialIx = await program.methods
        .confirmSellPayment(buyer1.publicKey, "PARTIAL-TEST-1", true, "Payment confirmed")
        .accountsPartial({
          trustExpress: pda,
          botAuthority: botAuthority.publicKey,
          maker: seller.publicKey,
          mint,
          trustExpressAta: ata,
          feeDestinationAta: feeDestAta.address,
          takerAta: buyer1Ata.address,
          makerAta: sellerAta.address,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction();

      confirmPartialIx.keys?.forEach((key) => {
        if (
          key.pubkey.equals(feeDestAta.address) ||
          key.pubkey.equals(buyer1Ata.address) ||
          key.pubkey.equals(sellerAta.address) ||
          key.pubkey.equals(pda)
        ) {
          key.isWritable = true;
        }
      });

      await provider.sendAndConfirm!(new Transaction().add(confirmPartialIx), [botAuthority]);

      const orderBefore        = await program.account.trustExpress.fetch(pda);
      const reservedFeeBefore  = orderBefore.reservedFee;
      const availableBefore    = orderBefore.amount;
      const halfAvailable      = availableBefore.divn(2);

      await program.methods
        .expressWithdraw(halfAvailable)
        .accountsPartial({
          maker: seller.publicKey,
          mint,
          makerAta: sellerAta.address,
          trustExpress: pda,
          trustExpressAta: ata,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([seller])
        .rpc();

      const orderAfter = await program.account.trustExpress.fetch(pda);
      const expectedReservedFeeAfter = reservedFeeBefore.toNumber() / 2;

      assert.approximately(
        orderAfter.reservedFee.toNumber(),
        expectedReservedFeeAfter,
        10 ** 3,
        "reservedFee should have dropped by half after withdrawing half of available"
      );
    });
  });

  // ── Complete Order Lifecycle ────────────────────────────────────────────────

  describe("Complete Order Lifecycle", () => {
    it("Executes full buy order flow from creation to completion", async () => {
      const seed  = 700;
      const pda   = getTrustExpressPda(buyer1.publicKey, seed);
      const AMOUNT = 2000 * 10 ** 9;

      // 1. Create buy order
      await program.methods
        .createExpressBuyOrder(
          new anchor.BN(seed),
          new anchor.BN(AMOUNT),
          new anchor.BN(150),
          "EUR",
          "SEPA transfer to IBAN XYZ",
          "flw_lifecycle_test"
        )
        .accountsPartial({
          buyer: buyer1.publicKey,
          mint,
          trustExpress: pda,
          globalState: globalStatePda,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([buyer1])
        .rpc();

      // 2. Mint tokens to seller for fulfillment
      const sellerAta = await getOrCreateAssociatedTokenAccount(
        connection, seller, mint, seller.publicKey
      );
      await mintTo(connection, authority, mint, sellerAta.address, authority, AMOUNT);

      // 3. Seller reserves on buy order
      const trustExpressAta = deriveAta(mint, pda);

      await program.methods
        .instantReserve(
          new anchor.BN(AMOUNT),
          new anchor.BN(AMOUNT * 150),
          "EUR",
          "seller-payout-details"
        )
        .accountsPartial({
          trustExpress: pda,
          maker: buyer1.publicKey,
          taker: seller.publicKey,
          mint,
          takerAta: sellerAta.address,
          trustExpressAta,
          globalState: globalStatePda,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([seller])
        .rpc();

      // 4. Confirm payout to seller
      const buyOrder    = await program.account.trustExpress.fetch(pda);
      const reservation = buyOrder.reservedAmounts[0];

      const buyerAta = await getOrCreateAssociatedTokenAccount(
        connection, buyer1, mint, buyer1.publicKey
      );
      const feeDestinationAta = await getOrCreateAssociatedTokenAccount(
        connection, authority, mint, authority.publicKey
      );

      const buyer1BalanceBefore = BigInt(
        (await getAccount(connection, buyerAta.address)).amount
      );

      const ix = await program.methods
        .confirmPayout(
          seller.publicKey,
          reservation.amount,
          reservation.fiatAmount,
          "EUR",
          reservation.payoutReference ?? "",
          true,
          "Payout completed successfully"
        )
        .accountsPartial({
          trustExpress: pda,
          botAuthority: botAuthority.publicKey,
          maker: buyer1.publicKey,
          mint,
          trustExpressAta,
          feeDestinationAta: feeDestinationAta.address,
          takerAta: PublicKey.default,
          makerAta: buyerAta.address,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction();

      const PROGRAM_ACCOUNTS = new Set([
        TOKEN_PROGRAM_ID.toString(),
        SystemProgram.programId.toString(),
        ASSOCIATED_TOKEN_PROGRAM_ID.toString(),
      ]);
      ix.keys?.forEach((key) => {
        if (!PROGRAM_ACCOUNTS.has(key.pubkey.toString())) key.isWritable = true;
      });

      await provider.sendAndConfirm!(new Transaction().add(ix), [botAuthority]);

      // 5. Verify tokens received
      const buyer1BalanceAfter  = BigInt((await getAccount(connection, buyerAta.address)).amount);
      const actualReceived      = Number(buyer1BalanceAfter - buyer1BalanceBefore);
      const expectedReceived    = AMOUNT * 0.9995; // 5 bps fee

      assert.approximately(actualReceived, expectedReceived, 10 ** 7);

      // 6. Account must be auto-closed (amount was fully consumed)
      try {
        await program.account.trustExpress.fetch(pda);
        assert.fail("Account should have been auto-closed by confirmPayout");
      } catch (error) {
        assert.include((error as Error).toString(), "Account does not exist");
      }
    });
  });

  // ── Fee Distribution Verification ──────────────────────────────────────────

  describe("Fee Distribution Verification", () => {
    it("Correctly distributes fees across multiple transactions", async () => {
      const seed = 800;
      const pda  = getTrustExpressPda(seller.publicKey, seed);
      const ata  = deriveAta(mint, pda);

      const sellerAta = await getOrCreateAssociatedTokenAccount(
        connection, seller, mint, seller.publicKey
      );
      await mintTo(connection, authority, mint, sellerAta.address, authority, 20000 * 10 ** 9);

      await program.methods
        .createExpressSell(
          new anchor.BN(seed),
          new anchor.BN(20000 * 10 ** 9),
          new anchor.BN(100),
          "USD",
          "Payment instructions",
          "flw_fee_test"
        )
        .accountsPartial({
          seller: seller.publicKey,
          mint,
          sellerAta: sellerAta.address,
          trustExpress: pda,
          trustExpressAta: ata,
          globalState: globalStatePda,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([seller])
        .rpc();

      const feeDestAta = await getOrCreateAssociatedTokenAccount(
        connection, authority, mint, authority.publicKey
      );
      const feeBalanceBefore = (await getAccount(connection, feeDestAta.address)).amount;

      const numTx    = 3;
      const amountPer = 5000 * 10 ** 9;

      for (let i = 0; i < numTx; i++) {
        await program.methods
          .instantSellReserve(new anchor.BN(amountPer), 0, null, `FEE-TEST-${i}`)
          .accountsPartial({
            trustExpress: pda,
            maker: seller.publicKey,
            buyer: buyer1.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([buyer1])
          .rpc();

        const buyer1Ata = await getOrCreateAssociatedTokenAccount(
          connection, buyer1, mint, buyer1.publicKey
        );

        const confirmIx = await program.methods
          .confirmSellPayment(buyer1.publicKey, `FEE-TEST-${i}`, true, `Payment ${i} confirmed`)
          .accountsPartial({
            trustExpress: pda,
            botAuthority: botAuthority.publicKey,
            maker: seller.publicKey,
            mint,
            trustExpressAta: ata,
            feeDestinationAta: feeDestAta.address,
            takerAta: buyer1Ata.address,
            makerAta: sellerAta.address,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .instruction();

        confirmIx.keys?.forEach((key) => {
          if (
            key.pubkey.equals(feeDestAta.address) ||
            key.pubkey.equals(buyer1Ata.address) ||
            key.pubkey.equals(sellerAta.address) ||
            key.pubkey.equals(pda)
          ) {
            key.isWritable = true;
          }
        });

        await provider.sendAndConfirm!(new Transaction().add(confirmIx), [botAuthority]);
      }

      const feeBalanceAfter = (await getAccount(connection, feeDestAta.address)).amount;
      const expectedFees    = numTx * amountPer * 0.0005; // 5 bps per transaction

      assert.approximately(
        Number(feeBalanceAfter - feeBalanceBefore),
        expectedFees,
        10 ** 7
      );
    });
  });

  // ── Partial-Fill Close Fix (integration perspective) ───────────────────────
  //
  // Tests the scenario exactly matching what was observed in production:
  //   • LP creates a buy order for N tokens
  //   • Taker1 fills M < N tokens and the vote succeeds
  //   • ⚠ OLD BUG: account closes here because ATA empties to 0
  //   • ✅ FIX: account stays open; only closes when amount == 0
  //   • Taker2 fills the remaining N-M tokens
  //   • Account closes correctly after this final fill

  describe("Partial-Fill Close Fix (integration)", () => {
    const LP_SEED    = 900;
    const TOTAL      = 3_000_000_000; // 3 tokens (9 decimals)
    const FILL_1     = 1_000_000_000; // taker fills 1 token
    const FILL_2     = 2_000_000_000; // taker fills remaining 2 tokens
    const PRICE      = 100;

    let tePda: PublicKey;
    let teAta: PublicKey;
    let lpAta: PublicKey;
    let sellerAtaAddr: PublicKey;
    let feeAtaAddr: PublicKey;

    before(async () => {
      tePda = getTrustExpressPda(buyer1.publicKey, LP_SEED);
      teAta = deriveAta(mint, tePda);

      // Create buy order
      await program.methods
        .createExpressBuyOrder(
          new anchor.BN(LP_SEED),
          new anchor.BN(TOTAL),
          new anchor.BN(PRICE),
          "NGN",
          "pay via FLW — integration partial fill test",
          "FLW-INT-PARTIAL"
        )
        .accountsPartial({
          buyer: buyer1.publicKey,
          mint,
          trustExpress: tePda,
          globalState: globalStatePda,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([buyer1])
        .rpc();

      // Fund seller (taker) and create required ATAs
      const sellerAta = await getOrCreateAssociatedTokenAccount(
        connection, seller, mint, seller.publicKey
      );
      sellerAtaAddr = sellerAta.address;
      await mintTo(connection, authority, mint, sellerAtaAddr, authority, TOTAL * 2);

      const lpAtaAcc = await getOrCreateAssociatedTokenAccount(
        connection, buyer1, mint, buyer1.publicKey
      );
      lpAta = lpAtaAcc.address;

      const feeAcc = await getOrCreateAssociatedTokenAccount(
        connection, authority, mint, authority.publicKey
      );
      feeAtaAddr = feeAcc.address;
    });

    /** Reserve `amount` from seller and settle with 3 approve votes via submitBuyVote. */
    async function fillAndSettle(amount: number): Promise<void> {
      await program.methods
        .instantReserve(
          new anchor.BN(amount),
          new anchor.BN(amount * PRICE),
          "NGN",
          null
        )
        .accountsPartial({
          trustExpress: tePda,
          maker: buyer1.publicKey,
          taker: seller.publicKey,
          mint,
          takerAta: sellerAtaAddr,
          trustExpressAta: teAta,
          globalState: globalStatePda,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([seller])
        .rpc();

      const te  = await program.account.trustExpress.fetch(tePda);
      const res = te.reservedAmounts.find(
        (r: any) => r.taker.equals(seller.publicKey) && r.status === 0
      );
      if (!res) throw new Error("No pending reservation found for taker");
      const ref     = res.payoutReference as string;
      const votePda = validatorVotePda(tePda, ref, program.programId);

      for (let i = 0; i < 3; i++) {
        await program.methods
          .submitBuyVote(
            referenceHashBytes(ref),
            ref,
            seller.publicKey,
            new anchor.BN(amount),
            new anchor.BN(amount * PRICE),
            "NGN",
            true,
            `int_evidence_${i}`
          )
          .accountsPartial({
            validator: validators[i].publicKey,
            globalState: globalStatePda,
            validatorVote: votePda,
            trustExpress: tePda,
            maker: buyer1.publicKey,
            mint,
            trustExpressAta: teAta,
            feeDestinationAta: feeAtaAddr,
            takerAta: sellerAtaAddr,
            makerAta: lpAta,
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

    it("escrow survives the first partial fill (BUG REGRESSION CHECK)", async () => {
      const lpBalBefore = BigInt((await getAccount(connection, lpAta)).amount);

      await fillAndSettle(FILL_1);

      // ── The critical assertion ──────────────────────────────────────────────
      const te = await program.account.trustExpress.fetch(tePda).catch(() => null);
      assert.ok(
        te !== null,
        "REGRESSION: premature close — escrow must NOT close after partial fill"
      );
      assert.equal(
        te.amount.toNumber(),
        TOTAL - FILL_1,
        "Remaining capacity must be TOTAL - FILL_1 after first partial fill"
      );

      // LP should have received tokens from first fill
      const lpBalAfter = BigInt((await getAccount(connection, lpAta)).amount);
      assert.ok(lpBalAfter > lpBalBefore, "LP should have received tokens after fill 1");

      console.log(
        `  ✅  Fill 1 settled. Remaining capacity: ${te.amount.toNumber()}. Escrow alive.`
      );
    });

    it("escrow closes correctly after the final fill (amount reaches 0)", async () => {
      await fillAndSettle(FILL_2);

      const te = await program.account.trustExpress.fetch(tePda).catch(() => null);
      assert.isNull(
        te,
        "Escrow must be closed after final fill brings trust_express.amount to 0"
      );

      console.log("  ✅  Fill 2 settled. Escrow closed correctly.");
    });
  });
});