// app/api/actions/reserve/[pubkey]/route.ts
//
// Solana Actions (Blinks) endpoint for Trust Vault pool reservations.
//
// GET  → returns action metadata with input fields
// POST → builds + returns an unsigned transaction the user's wallet signs
//
// SELL pool (escrowType=0, user buys crypto):
//   - Amount only. Bot generates payment link after on-chain tx.
//   - POST response includes links.next with /pay/[reference] URL in description.
//   - User taps the URL → /pay page → PaymentLinkDisplay polls Supabase.
//
// BUY pool (escrowType=1, user sells crypto):
//   - Amount + bank details in one step.
//   - Bot reads payoutDetails from on-chain event and initiates fiat transfer.

import { NextRequest, NextResponse } from "next/server";
import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  SystemProgram,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { AnchorProvider, BN, Program } from "@coral-xyz/anchor";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import { TrustVault } from "@/relics/trust_express/trust_express";
import idl from "@/relics/trust_express/trust_express.json";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const EXPRESS_SELL = 0;

const PROGRAM_ID = new PublicKey(
  process.env.TRUST_EXPRESS_PROGRAM_ID ??
    "6gHrdm5AtG8TFvMknv5ZBEt1CHpKwBEToVbEaGBL8r7M"
);

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ??
  "https://alene-offscreen-unprevalently.ngrok-free.dev";

// ─────────────────────────────────────────────────────────────────────────────
// CORS headers
// ─────────────────────────────────────────────────────────────────────────────

const BLINKS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, x-action-version, x-blockchain-ids",
  "X-Action-Version": "2.1.3",
  "X-Blockchain-Ids": "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
};

// ─────────────────────────────────────────────────────────────────────────────
// Anchor setup
// ─────────────────────────────────────────────────────────────────────────────

function makeProgram() {
  const connection = new Connection(process.env.RPC_URL!, {
    commitment: "confirmed",
  });
  const dummyWallet = new NodeWallet(Keypair.generate());
  const provider = new AnchorProvider(connection, dummyWallet, {
    commitment: "confirmed",
    skipPreflight: false,
  });
  const program = new Program<TrustVault>(idl as TrustVault, provider);
  return { program, connection };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function parseCurrency(currency: number[]): string {
  try {
    return String.fromCharCode(...currency).trim();
  } catch {
    return "NGN";
  }
}

async function isToken2022(
  connection: Connection,
  mint: PublicKey
): Promise<boolean> {
  const info = await connection.getAccountInfo(mint);
  return info?.owner.equals(TOKEN_2022_PROGRAM_ID) ?? false;
}

async function getMintDecimals(
  connection: Connection,
  mint: PublicKey
): Promise<number> {
  try {
    const info = await connection.getParsedAccountInfo(mint);
    return (
      ((info.value?.data as any)?.parsed?.info?.decimals as number) ?? 9
    );
  } catch {
    return 9;
  }
}

async function ataExists(
  connection: Connection,
  ata: PublicKey
): Promise<boolean> {
  const info = await connection.getAccountInfo(ata);
  return info !== null;
}

function blinksJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: BLINKS_HEADERS });
}

// ─────────────────────────────────────────────────────────────────────────────
// CORS preflight
// ─────────────────────────────────────────────────────────────────────────────

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: BLINKS_HEADERS });
}

// ─────────────────────────────────────────────────────────────────────────────
// GET — action metadata
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ pubkey: string }> }
) {
  const { pubkey } = await params;

  let trustExpressPubkey: PublicKey;
  try {
    trustExpressPubkey = new PublicKey(pubkey);
  } catch {
    return blinksJson({ message: "Invalid pool address" }, 400);
  }

  try {
    const { program, connection } = makeProgram();

    const account = await program.account.trustExpress.fetch(
      trustExpressPubkey
    );

    const currency = parseCurrency(account.currency as number[]);
    const isSellPool = (account.escrowType as number) === EXPRESS_SELL;
    const decimals = await getMintDecimals(connection, account.mint as PublicKey);
    const availableAmount = (account.amount as BN).toNumber() / 10 ** decimals;
    const price = (account.pricePerToken as BN).toNumber();
    const slotsUsed = (account.reservedAmounts as unknown[]).length;
    const isFull = slotsUsed >= 10 || availableAmount <= 0;

    const metadata = {
      type: "action",
      icon: `${APP_URL}/android-chrome-512x512.png`,
      title: isSellPool
        ? `Buy Crypto · ${availableAmount.toFixed(4)} available`
        : `Sell Crypto · ${availableAmount.toFixed(4)} available`,
      description: isSellPool
        ? `Rate: ${price.toLocaleString()} ${currency}/token. Pay fiat, receive crypto via Trust Vault escrow. A payment link will be generated instantly after you reserve.`
        : `Rate: ${price.toLocaleString()} ${currency}/token. Your tokens lock in escrow on-chain, the LP sends fiat directly to your bank account.`,
      label: isFull ? "Pool Full" : "Reserve Now",
      disabled: isFull,
      ...(isFull && {
        error: { message: "This pool is fully reserved or has no remaining liquidity." },
      }),
      links: {
        actions: isFull
          ? []
          : isSellPool
          ? [
              // SELL pool — amount only, bot generates payment link
              {
                type: "transaction",
                label: "Reserve Now",
                href: `${APP_URL}/api/actions/reserve/${pubkey}?amount={amount}`,
                parameters: [
                  {
                    name: "amount",
                    label: `Amount in tokens (max ${availableAmount.toFixed(4)})`,
                    required: true,
                    type: "number",
                    min: 0.000001,
                    max: availableAmount,
                  },
                ],
              },
            ]
          : [
              // BUY pool — amount + bank details in one step
              {
                type: "transaction",
                label: "Reserve Now",
                href: `${APP_URL}/api/actions/reserve/${pubkey}?amount={amount}&accountNumber={accountNumber}&bankCode={bankCode}&accountName={accountName}`,
                parameters: [
                  {
                    name: "amount",
                    label: `Amount in tokens (max ${availableAmount.toFixed(4)})`,
                    required: true,
                    type: "number",
                    min: 0.000001,
                    max: availableAmount,
                  },
                  {
                    name: "accountNumber",
                    label: "Account Number (10 digits)",
                    required: true,
                    type: "text",
                    pattern: "^[0-9]{10}$",
                    patternDescription: "Must be exactly 10 digits",
                  },
                  {
                    name: "bankCode",
                    label: "Bank Code (e.g. 058 GTBank · 011 First Bank · 033 UBA · 044 Access)",
                    required: true,
                    type: "text",
                    pattern: "^[0-9]{3,6}$",
                    patternDescription: "3–6 digit bank code",
                  },
                  {
                    name: "accountName",
                    label: "Account Name (as registered with your bank)",
                    required: true,
                    type: "text",
                  },
                ],
              },
            ],
      },
    };

    return blinksJson(metadata);
  } catch (err) {
    console.error("[blinks/reserve] GET error:", err);
    return blinksJson({ message: "Pool not found or has been closed." }, 404);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST — build unsigned transaction
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ pubkey: string }> }
) {
  const { pubkey } = await params;

  // ── 1. Parse user wallet from body ──
  let userWallet: PublicKey;
  try {
    const body = await req.json();
    userWallet = new PublicKey(body.account);
  } catch {
    return blinksJson(
      { message: "Invalid request body — expected { account: string }" },
      400
    );
  }

  // ── 2. Parse query params ──
  const { searchParams } = new URL(req.url);
  const rawAmount = searchParams.get("amount");
  const accountNumber = searchParams.get("accountNumber");
  const bankCode = searchParams.get("bankCode");
  const accountName = searchParams.get("accountName");

  if (!rawAmount) {
    return blinksJson({ message: "Missing required param: amount" }, 400);
  }

  const parsedAmount = parseFloat(rawAmount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return blinksJson({ message: "Invalid amount" }, 400);
  }

  // ── 3. Validate pool pubkey ──
  let trustExpressPubkey: PublicKey;
  try {
    trustExpressPubkey = new PublicKey(pubkey);
  } catch {
    return blinksJson({ message: "Invalid pool address" }, 400);
  }

  try {
    const { program, connection } = makeProgram();

    // ── 4. Fetch pool account ──
    const account = await program.account.trustExpress.fetch(
      trustExpressPubkey
    );

    const isSellPool = (account.escrowType as number) === EXPRESS_SELL;
    const mint = account.mint as PublicKey;
    const decimals = await getMintDecimals(connection, mint);
    const amountBN = new BN(Math.floor(parsedAmount * 10 ** decimals));
    const currency = parseCurrency(account.currency as number[]);
    const price = (account.pricePerToken as BN).toNumber();

    // Guard: amount
    const availableAmount = (account.amount as BN).toNumber() / 10 ** decimals;
    if (parsedAmount > availableAmount) {
      return blinksJson(
        { message: `Amount exceeds available liquidity (${availableAmount.toFixed(4)})` },
        400
      );
    }

    // Guard: slots
    if ((account.reservedAmounts as unknown[]).length >= 10) {
      return blinksJson({ message: "All reservation slots are full." }, 400);
    }

    // ── 5. Derive global state PDA ──
    const [globalState] = PublicKey.findProgramAddressSync(
      [Buffer.from("global-state")],
      PROGRAM_ID
    );

    // ── 6. Build transaction ──
    let tx: Transaction;
    let payoutReference = "";

    if (isSellPool) {
      // ── SELL pool: user buys crypto ──
      // payoutReference is stored on-chain in InstantSellReservationCreatedEvent.
      // Bot picks it up, generates the payment link, stores it in Supabase.
      // User is redirected to /pay/[payoutReference] which polls Supabase
      // via PaymentLinkDisplay until the link appears.
      payoutReference = `IS-${Date.now()}-${userWallet.toString().slice(0, 8)}`;

      tx = await program.methods
        .instantSellReserve(
          amountBN,
          0,             // payment_mode: 0 = payment link
          null,          // payoutDetails: not needed for sell pools
          payoutReference
        )
        .accountsPartial({
          trustExpress: trustExpressPubkey,
          maker: account.maker as PublicKey,
          buyer: userWallet,
          globalState,
          systemProgram: SystemProgram.programId,
        })
        .transaction();

    } else {
      // ── BUY pool: user sells crypto — tokens → escrow ──
      // Bank details are required. Bot reads payoutDetails from the on-chain
      // event and calls /api/initiate-buy-payout to send fiat.
      if (!accountNumber || !bankCode || !accountName) {
        return blinksJson(
          { message: "Bank details are required: accountNumber, bankCode, accountName." },
          400
        );
      }

      // Exact JSON structure your bot's parsePayoutDetails() expects
      const payoutDetails = JSON.stringify({
        account_number: accountNumber,
        bank_code: bankCode,
        account_name: accountName,
        beneficiary_name: accountName,
        type: "bank_transfer",
      });

      const token2022 = await isToken2022(connection, mint);
      const tokenProgram = token2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;

      const takerAta = getAssociatedTokenAddressSync(
        mint,
        userWallet,
        false,
        tokenProgram
      );

      const trustExpressAta = getAssociatedTokenAddressSync(
        mint,
        trustExpressPubkey,
        true,
        tokenProgram
      );

      const fiatAmountBN = new BN(Math.floor(parsedAmount * price));

      const reserveTx = await program.methods
        .instantReserve(amountBN, fiatAmountBN, currency, payoutDetails)
        .accountsPartial({
          trustExpress: trustExpressPubkey,
          maker: account.maker as PublicKey,
          taker: userWallet,
          mint,
          takerAta,
          trustExpressAta,
          globalState,
          tokenProgram,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .transaction();

      // Prepend createATA if taker's token account doesn't exist yet
      const takerAtaAlreadyExists = await ataExists(connection, takerAta);
      if (!takerAtaAlreadyExists) {
        const createAtaIx = createAssociatedTokenAccountInstruction(
          userWallet,
          takerAta,
          userWallet,
          mint,
          tokenProgram,
          ASSOCIATED_TOKEN_PROGRAM_ID
        );
        tx = new Transaction();
        tx.add(createAtaIx);
        tx.add(...reserveTx.instructions);
      } else {
        tx = reserveTx;
      }
    }

    // ── 7. Set fee payer + recent blockhash ──
    const { blockhash } = await connection.getLatestBlockhash("confirmed");
    tx.feePayer = userWallet;
    tx.recentBlockhash = blockhash;

    // ── 8. Serialize unsigned ──
    const serialized = tx
      .serialize({ requireAllSignatures: false, verifySignatures: false })
      .toString("base64");

    // ── 9. Build response with links.next ──
    if (isSellPool) {
      // Build /pay URL with all props PaymentLinkDisplay needs.
      // PaymentLinkDisplay will poll Supabase for the payment link using payoutReference.
      const fiatTotal = Math.floor(parsedAmount * price);
      const payPageUrl =
        `${APP_URL}/pay/${payoutReference}` +
        `?pda=${trustExpressPubkey.toString()}` +
        `&tokens=${parsedAmount}` +
        `&fiat=${fiatTotal}` +
        `&currency=${currency}`;

      return blinksJson({
        transaction: serialized,
        message: "Reservation locked! Tap the link below to get your payment link.",
        links: {
          next: {
            type: "inline",
            action: {
              type: "completed",
              icon: `${APP_URL}/android-chrome-512x512.png`,
              title: "Reservation Confirmed! 🎉",
              description:
                `Your slot is locked on-chain. Tap the link below to open your payment page — ` +
                `the link appears within seconds after the bot processes your reservation.\n\n` +
                `👉 ${payPageUrl}`,
              label: "Done",
            },
          },
        },
      });
    }

    // BUY pool response
    return blinksJson({
      transaction: serialized,
      message: "Your tokens will move into escrow. The LP will send fiat to your bank account.",
      links: {
        next: {
          type: "inline",
          action: {
            type: "completed",
            icon: `${APP_URL}/android-chrome-512x512.png`,
            title: "Tokens Locked in Escrow! 🎉",
            description:
              `Your tokens are now locked in escrow on-chain. ` +
              `The LP will send ${currency} to your bank account (${accountNumber}) shortly after validators confirm.\n\n` +
              `Track your order: ${APP_URL}/receipts`,
            label: "Done",
          },
        },
      },
    });

  } catch (err) {
    console.error("[blinks/reserve] POST error:", err);
    const msg = err instanceof Error ? err.message : "Failed to build transaction";
    return blinksJson({ message: msg }, 500);
  }
}