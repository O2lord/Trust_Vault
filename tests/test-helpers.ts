import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  PublicKey,
  Keypair,
  Connection,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
  TokenAccountNotFoundError,
} from "@solana/spl-token";

/**
 * Test utilities for Trust Vault program
 */

export class TestHelpers {
  connection: Connection;
  program: Program;

  constructor(connection: Connection, program: Program) {
    this.connection = connection;
    this.program = program;
  }

  /**
   * Airdrops SOL to an account
   */
  async airdrop(
    publicKey: PublicKey,
    amount: number = 2 * LAMPORTS_PER_SOL
  ): Promise<void> {
    const signature = await this.connection.requestAirdrop(publicKey, amount);
    await this.connection.confirmTransaction(signature);
  }

  /**
   * Creates multiple funded keypairs
   */
  async createFundedKeypairs(count: number): Promise<Keypair[]> {
    const keypairs: Keypair[] = [];
    for (let i = 0; i < count; i++) {
      const keypair = Keypair.generate();
      await this.airdrop(keypair.publicKey);
      keypairs.push(keypair);
    }
    return keypairs;
  }

  /**
   * Derives trust express PDA
   */
  getTrustExpressPda(maker: PublicKey, seed: number): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("trust-express"),
        maker.toBuffer(),
        new anchor.BN(seed).toArrayLike(Buffer, "le", 8),
      ],
      this.program.programId
    );
    return pda;
  }

  /**
   * Derives global state PDA
   */
  getGlobalStatePda(): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("global-state")],
      this.program.programId
    );
    return pda;
  }

  /**
   * Creates a mint and returns the public key
   */
  async createTestMint(
    payer: Keypair,
    mintAuthority: PublicKey,
    decimals: number = 9
  ): Promise<PublicKey> {
    return await createMint(
      this.connection,
      payer,
      mintAuthority,
      null,
      decimals
    );
  }

  /**
   * Mints tokens to an account
   */
  async mintTokensTo(
    mint: PublicKey,
    destination: PublicKey,
    authority: Keypair,
    amount: number
  ): Promise<void> {
    await mintTo(this.connection, authority, mint, destination, authority, amount);
  }

  /**
   * Gets or creates ATA and mints tokens to it
   */
  async setupTokenAccount(
    mint: PublicKey,
    owner: PublicKey,
    payer: Keypair,
    mintAuthority: Keypair,
    amount: number
  ): Promise<PublicKey> {
    const ata = await getOrCreateAssociatedTokenAccount(
      this.connection,
      payer,
      mint,
      owner
    );

    if (amount > 0) {
      await this.mintTokensTo(mint, ata.address, mintAuthority, amount);
    }

    return ata.address;
  }

  /**
   * Gets token account balance
   */
  async getTokenBalance(tokenAccount: PublicKey): Promise<bigint> {
    try {
      const account = await getAccount(this.connection, tokenAccount);
      return account.amount;
    } catch (error) {
      if (error instanceof TokenAccountNotFoundError) {
        return BigInt(0);
      }
      throw error;
    }
  }

  /**
   * Calculates expected fee
   */
  calculateFee(amount: number, feePercentage: number): number {
    return Math.floor((amount * feePercentage) / 10000);
  }

  /**
   * Generates a random payout reference
   */
  generatePayoutReference(prefix: string = "TEST"): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `${prefix}-${timestamp}-${random}`;
  }
}

/**
 * Mock data generators
 */
export class MockDataGenerator {
  /**
   * Generates random payment instructions
   */
  static generatePaymentInstructions(): string {
    const banks = ["Bank of America", "Chase", "Wells Fargo", "Citibank"];
    const bank = banks[Math.floor(Math.random() * banks.length)];
    const accountNumber = Math.floor(Math.random() * 1000000000);
    return `Transfer to ${bank}, Account: ${accountNumber}`;
  }

  /**
   * Generates random flutterwave credential ID
   */
  static generateFlutterwaveCredentialId(): string {
    return `flw_cred_${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Generates random currency code
   */
  static generateCurrencyCode(): string {
    const currencies = ["USD", "EUR", "GBP", "NGN", "KES", "GHS"];
    return currencies[Math.floor(Math.random() * currencies.length)];
  }

  /**
   * Generates random amount within range
   */
  static generateAmount(min: number, max: number, decimals: number = 9): number {
    const base = Math.floor(Math.random() * (max - min + 1)) + min;
    return base * 10 ** decimals;
  }
}