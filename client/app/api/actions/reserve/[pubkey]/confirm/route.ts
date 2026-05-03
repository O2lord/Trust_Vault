// app/api/actions/reserve/[pubkey]/confirm/route.ts
//
// Step 2 of the BUY pool blink flow (user sells crypto, receives fiat).
//
// This route is only reached for BUY pools (escrowType=1).
// The user already entered their amount in Step 1 (/reserve/[pubkey]).
//
// GET  → returns a new action with bank detail input fields
// POST → not used here — the "Reserve Now" button POSTs directly back to
//         the parent route /api/actions/reserve/[pubkey] with bank params

import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { AnchorProvider, BN, Program } from "@coral-xyz/anchor";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import { TrustVault } from "@/relics/trust_express/trust_express";
import idl from "@/relics/trust_express/trust_express.json";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ??
  "https://alene-offscreen-unprevalently.ngrok-free.dev";

const BLINKS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, x-action-version, x-blockchain-ids",
  "X-Action-Version": "2.1.3",
  "X-Blockchain-Ids": "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
};

function blinksJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: BLINKS_HEADERS });
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
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

function parseCurrency(currency: number[]): string {
  try {
    return String.fromCharCode(...currency).trim();
  } catch {
    return "NGN";
  }
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

// ─────────────────────────────────────────────────────────────────────────────
// CORS preflight
// ─────────────────────────────────────────────────────────────────────────────

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: BLINKS_HEADERS });
}

// ─────────────────────────────────────────────────────────────────────────────
// GET — Step 2: bank detail inputs
//
// Shows 3 fields: account number, bank code, account name.
// The "Reserve Now" button POSTs to the parent route with all params including
// the amount carried over from Step 1.
//
// Your bot's parsePayoutDetails() expects:
//   { account_number, bank_code, account_name, beneficiary_name, type }
// We build that JSON in the parent POST route from these 3 fields.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ pubkey: string }> }
) {
  const { pubkey } = await params;
  const { searchParams } = new URL(req.url);
  const amount = searchParams.get("amount");

  if (!amount) {
    return blinksJson({ message: "Missing amount from previous step" }, 400);
  }

  let trustExpressPubkey: PublicKey;
  try {
    trustExpressPubkey = new PublicKey(pubkey);
  } catch {
    return blinksJson({ message: "Invalid pool address" }, 400);
  }

  try {
    const { program, connection } = makeProgram();
    const account = await program.account.trustExpress.fetch(trustExpressPubkey);

    const currency = parseCurrency(account.currency as number[]);
    const decimals = await getMintDecimals(connection, account.mint as PublicKey);
    const price = (account.pricePerToken as BN).toNumber();
    const parsedAmount = parseFloat(amount);
    const fiatTotal = (parsedAmount * price).toLocaleString();

    // The POST href goes back to the PARENT route (/api/actions/reserve/[pubkey])
    // with amount + bank detail params. That route builds the on-chain tx.
    const postHref =
      `${APP_URL}/api/actions/reserve/${pubkey}` +
      `?amount=${amount}` +
      `&accountNumber={accountNumber}` +
      `&bankCode={bankCode}` +
      `&accountName={accountName}`;

    return blinksJson({
      type: "action",
      icon: `${APP_URL}/android-chrome-512x512.png`,
      title: "Enter Your Bank Details",
      description:
        `Selling ${parsedAmount} tokens · You will receive ~${fiatTotal} ${currency}. ` +
        `Enter your Nigerian bank details below. The LP will send fiat to this account after your tokens are locked in escrow.`,
      label: "Reserve Now",
      links: {
        actions: [
          {
            type: "transaction",
            label: "Reserve Now",
            href: postHref,
            parameters: [
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
                label: "Bank Code (e.g. 058 = GTBank, 011 = First Bank, 033 = UBA)",
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
    });
  } catch (err) {
    console.error("[blinks/reserve/confirm] GET error:", err);
    return blinksJson({ message: "Pool not found or has been closed." }, 404);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST — not used directly
//
// The blink client POSTs to the href in the action above, which points to the
// PARENT route (/api/actions/reserve/[pubkey]). So this POST handler here is
// just a safety fallback redirect.
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ pubkey: string }> }
) {
  const { pubkey } = await params;
  const { searchParams } = new URL(req.url);

  // Forward all query params to the parent route
  const forwardUrl = `${APP_URL}/api/actions/reserve/${pubkey}?${searchParams.toString()}`;

  return NextResponse.redirect(forwardUrl, { status: 307 });
}