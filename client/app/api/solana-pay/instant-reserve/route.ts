// app/api/solana-pay/instant-reserve/route.ts
import { NextRequest, NextResponse } from 'next/server';
import {
  PublicKey,
  Transaction,
  SystemProgram,
  TransactionInstruction,
  Connection,
  clusterApiUrl,
} from '@solana/web3.js';
import {
  createTransferInstruction,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { createClient } from '@supabase/supabase-js';

// ─── Config ───────────────────────────────────────────────────────────────────

const PROGRAM_ID = new PublicKey(process.env.TRUST_EXPRESS_PROGRAM_ID!);

// Prefer server-side RPC_URL — NEXT_PUBLIC_ vars may be undefined in API routes
const connection = new Connection(
  process.env.RPC_URL || process.env.NEXT_PUBLIC_RPC_URL || clusterApiUrl('devnet'),
  'confirmed'
);

// ─── Global state PDA ────────────────────────────────────────────────────────
// Seeds: ["global-state"]

const [GLOBAL_STATE_PDA] = PublicKey.findProgramAddressSync(
  [Buffer.from('global-state')],
  PROGRAM_ID
);

// ─── instant_reserve discriminator ───────────────────────────────────────────
// sha256("global:instant_reserve")[0..8] = [49,131,230,138,27,60,108,209]

const INSTANT_RESERVE_DISCRIMINATOR = Buffer.from([49, 131, 230, 138, 27, 60, 108, 209]);

// ─── Token program IDs ────────────────────────────────────────────────────────

const TOKEN_PROGRAM_CLASSIC       = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const TOKEN_PROGRAM_2022          = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

// ─── Helpers ──────────────────────────────────────────────────────────────────

// TrustExpress struct layout — derived directly from the IDL, not guessed.
// Anchor prepends an 8-byte discriminator, then Borsh-packs fields in IDL order
// with NO inter-field padding.
//
// Field              Type          Bytes   Offset range
// ─────────────────────────────────────────────────────
// discriminator      [u8;8]            8     0 ..   8
// seed               u64               8     8 ..  16
// maker              pubkey           32    16 ..  48
// mint               pubkey           32    48 ..  80
// currency           [u8;3]   ← 3!    3    80 ..  83   (NOT 4 — confirmed from IDL)
// escrow_type        u8                1    83 ..  84
// fee_percentage     u16      ← u16!  2    84 ..  86   (NOT f32 — confirmed from IDL)
// fee_destination    pubkey           32    86 .. 118
// reserved_fee       u64               8   118 .. 126
// amount             u64               8   126 .. 134
// price_per_token    u64               8   134 .. 142
// payment_instructions String    variable   142: u32LE length prefix, 146+: bytes
// reserved_amounts   Vec<ReservedAmount>    after payment_instructions bytes
// flutterwave_credential_id Option<String>  after reserved_amounts
// bump               u8                1   last byte
//
// HISTORY: earlier versions had currency as [u8;4] and fee_percentage as f32.
// Both were wrong: currency is 3 bytes and fee_percentage is u16 per the IDL.
// This shifted amount/price_per_token/string-prefix by 3 bytes each time,
// causing parseTrustExpressAccount to read garbage and overflow the buffer.

interface TrustExpressAccountData {
  maker:           PublicKey;
  mint:            PublicKey;
  amount:          bigint;   // raw u64 — remaining escrow liquidity
  pricePerToken:   bigint;   // raw u64
  reservedCount:   number;   // length of reservedAmounts vec
}

function parseTrustExpressAccount(data: Buffer): TrustExpressAccountData {
  const maker         = new PublicKey(data.slice(16, 48));
  const mint          = new PublicKey(data.slice(48, 80));
  const amount        = data.readBigUInt64LE(126);
  const pricePerToken = data.readBigUInt64LE(134);

  // payment_instructions: Borsh String = u32LE byte-length prefix + UTF-8 bytes
  const paymentInstructionsLen = data.readUInt32LE(142);
  const reservedAmountsOffset  = 146 + paymentInstructionsLen;

  // Guard: detect any future layout drift before it produces a silent wrong read
  if (reservedAmountsOffset + 4 > data.length) {
    throw new Error(
      `parseTrustExpressAccount: reservedAmounts offset ${reservedAmountsOffset} is outside ` +
      `buffer (len=${data.length}). payment_instructions length read as ${paymentInstructionsLen} ` +
      `at offset 142 — IDL struct layout mismatch.`
    );
  }

  const reservedCount = data.readUInt32LE(reservedAmountsOffset);

  return { maker, mint, amount, pricePerToken, reservedCount };
}

// ATA seeds = [owner, token_program, mint] — token_program must match mint's owner
function deriveATA(owner: PublicKey, mintPk: PublicKey, tokenProgram: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), tokenProgram.toBuffer(), mintPk.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  )[0];
}

// ─── Borsh serialization for instant_reserve ─────────────────────────────────
//
// Args (IDL order):
//   amount:         u64
//   fiat_amount:    u64
//   currency:       String
//   payout_details: Option<String>

function buildInstructionData(
  tokenAmountRaw: bigint,
  fiatAmountRaw: bigint,
  currency: string,
  payoutDetails: string | null,
): Buffer {
  const amountBuf = Buffer.alloc(8);
  amountBuf.writeBigUInt64LE(tokenAmountRaw);

  const fiatBuf = Buffer.alloc(8);
  fiatBuf.writeBigUInt64LE(fiatAmountRaw);

  // currency: String — borsh u32LE len + bytes
  const currencyBytes = Buffer.from(currency, 'utf8');
  const currencyLenBuf = Buffer.alloc(4);
  currencyLenBuf.writeUInt32LE(currencyBytes.length);
  const currencyBuf = Buffer.concat([currencyLenBuf, currencyBytes]);

  // payout_details: Option<String>
  let payoutDetailsBuf: Buffer;
  if (payoutDetails) {
    const strBytes = Buffer.from(payoutDetails, 'utf8');
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32LE(strBytes.length);
    payoutDetailsBuf = Buffer.concat([Buffer.from([1]), lenBuf, strBytes]);
  } else {
    payoutDetailsBuf = Buffer.from([0]);
  }

  return Buffer.concat([
    INSTANT_RESERVE_DISCRIMINATOR,
    amountBuf,
    fiatBuf,
    currencyBuf,
    payoutDetailsBuf,
  ]);
}

// ─── CORS ─────────────────────────────────────────────────────────────────────

function withCors(res: NextResponse): NextResponse {
  res.headers.set('Access-Control-Allow-Origin', '*');
  res.headers.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Encoding, Accept-Encoding');
  // Required by strict Solana Pay wallets (Backpack, Solflare)
  res.headers.set('Content-Type', 'application/json');
  // Bypass ngrok's HTML interstitial — without this, Backpack gets HTML
  // instead of JSON and throws "Network request failed"
  res.headers.set('ngrok-skip-browser-warning', 'true');
  return res;
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, Content-Encoding, Accept-Encoding',
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true',
    },
  });
}

// ─── GET — Solana Pay action metadata ─────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const trustExpressAddress = searchParams.get('trustExpressAddress');
    const tokenAmount  = searchParams.get('tokenAmount');
    const fiatAmount   = searchParams.get('fiatAmount');
    const currency     = searchParams.get('currency');
    const account      = searchParams.get('account');

    if (account && trustExpressAddress) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      const { data: receipt } = await supabase
        .from('receipts')
        .select('*')
        .eq('trust_express_address', trustExpressAddress)
        .eq('taker_address', account)
        .eq('status', 'success')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (receipt) {
        return withCors(NextResponse.json({
          label: 'TrustExpress - Payment Complete ✓',
          icon: `${process.env.NEXT_PUBLIC_APP_URL}/logo.png`,
          title: 'Payment Successful!',
          description: `Your payout is being processed.`,
          links: {
            actions: [
              { label: 'View Receipt', href: `${process.env.NEXT_PUBLIC_APP_URL}/receipts/${receipt.id}` }
            ]
          }
        }));
      }

      return withCors(NextResponse.json({
        label: 'TrustExpress - Processing',
        icon: `${process.env.NEXT_PUBLIC_APP_URL}/logo.png`,
        title: 'Payment Processing',
        description: 'Your payment is being confirmed. Receipt will be ready shortly.',
        links: {
          actions: [
            {
              label: 'Check Receipt Status',
              href: `${process.env.NEXT_PUBLIC_APP_URL}/receipts/pending?trustExpress=${trustExpressAddress}&taker=${account}`,
            }
          ]
        }
      }));
    }

    // ── Capacity check on GET ─────────────────────────────────────────────
    // The Solana Pay spec requires wallets to GET the action URL first and show
    // the merchant's label/title/description to the customer before POSTing.
    // If we return a non-200 here the wallet surfaces our message and never
    // builds a transaction — which is exactly the right UX when the LP is stale.
    // This avoids the customer approving a transaction that will fail on-chain.
    //
    // We only do this when the standard payment params are present (i.e. this
    // is not the post-payment status-check GET that includes `account`).
    if (trustExpressAddress && fiatAmount && currency) {
      try {
        const lpInfo = await connection.getAccountInfo(new PublicKey(trustExpressAddress));
        if (lpInfo && lpInfo.owner.equals(PROGRAM_ID)) {
          const { amount: lpAmount, pricePerToken, reservedCount } =
            parseTrustExpressAccount(lpInfo.data);

          const MAX_RESERVATION_SLOTS = 10;

          // Derive required token amount using the same integer arithmetic as POST
          // so the two checks are always consistent with each other.
          const fiatAmountNum = parseFloat(fiatAmount);
          if (!isNaN(fiatAmountNum) && fiatAmountNum > 0) {
            // Read decimals from the mint for an accurate comparison
            let decimals = 6;
            try {
              const { mint } = parseTrustExpressAccount(lpInfo.data);
              const mintInfo = await connection.getAccountInfo(mint);
              if (mintInfo) decimals = mintInfo.data[44];
            } catch { /* fall back to default 6 */ }

            const fiatAmountRaw  = BigInt(Math.round(fiatAmountNum));
            const scalar         = BigInt(10) ** BigInt(decimals);
            const tokenAmountRaw = (fiatAmountRaw * scalar + pricePerToken - BigInt(1)) / pricePerToken;

            if (reservedCount >= MAX_RESERVATION_SLOTS) {
              console.warn(`[instant-reserve GET] LP ${trustExpressAddress} full (${reservedCount} slots)`);
              return withCors(NextResponse.json(
                { error: 'This payment link has expired — the provider is fully booked. Please ask the merchant for a new QR code.' },
                { status: 400 }
              ));
            }
            if (lpAmount < tokenAmountRaw) {
              console.warn(`[instant-reserve GET] LP ${trustExpressAddress} insufficient: available=${lpAmount} required=${tokenAmountRaw}`);
              return withCors(NextResponse.json(
                { error: 'This payment link has expired — the provider no longer has sufficient funds. Please ask the merchant for a new QR code.' },
                { status: 400 }
              ));
            }
          }
        }
      } catch (capacityErr) {
        // Non-fatal: if the RPC call fails, allow the GET to proceed and let
        // the POST catch any actual capacity problem. Better to show the QR
        // than to block on an RPC timeout.
        console.warn('[instant-reserve GET] Capacity pre-check failed (non-fatal):', capacityErr);
      }
    }

    return withCors(NextResponse.json({
      label: 'TrustExpress Instant Payment',
      icon: `${process.env.NEXT_PUBLIC_APP_URL}/logo.png`,
      title: `Pay ${currency} ${fiatAmount}`,
      description: `Send ${tokenAmount} USDC — receive ${currency} ${fiatAmount} instantly to your bank`,
    }));

  } catch (error) {
    console.error('GET error:', error);
    return withCors(NextResponse.json({ error: 'Internal server error' }, { status: 500 }));
  }
}

// ─── POST — Build and return the transaction ──────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const account: string = body.account;

    if (!account) {
      return withCors(NextResponse.json({ error: 'Missing account in request body' }, { status: 400 }));
    }

    const { searchParams } = new URL(req.url);
    const trustExpressAddress = searchParams.get('trustExpressAddress');
    // tokenAmount is accepted only as a display hint for the GET metadata label.
    // The POST derives its own tokenAmountRaw from on-chain data (see below).
    const tokenAmount         = searchParams.get('tokenAmount');
    const fiatAmount          = searchParams.get('fiatAmount');
    const currency            = searchParams.get('currency');
    const payoutDetailsRaw    = searchParams.get('payoutDetails');
    // reference: optional Solana Pay reference pubkey, included as a non-signer,
    // non-writable account in the instruction so the transaction can be located
    // on-chain by watching for this key (per the Solana Pay reference spec).
    const referenceParam      = searchParams.get('reference');

    // ── Yield split params (optional) ─────────────────────────────────────
    // yieldPercent: 0-90, integer. The % of the payment to split to the merchant's
    //               staging ATA instead of the escrow. e.g. "30" = 30% to yield.
    // merchantWallet: base58 pubkey of the merchant's connected wallet.
    //                 The split USDC lands in their ATA for this mint, which they
    //                 then mint into USX → lock into YieldVault in a separate flow.
    const yieldPercentRaw  = searchParams.get('yieldPercent');
    const merchantWalletRaw = searchParams.get('merchantWallet');
    const yieldPercent = yieldPercentRaw ? Math.min(90, Math.max(0, parseInt(yieldPercentRaw, 10))) : 0;
    const yieldEnabled = yieldPercent > 0 && !!merchantWalletRaw;

    if (!trustExpressAddress || !fiatAmount || !currency) {
      return withCors(NextResponse.json({ error: 'Missing required parameters' }, { status: 400 }));
    }

    // ── Parse pubkeys ─────────────────────────────────────────────────────
    let trustExpressPubkey: PublicKey;
    let buyerPubkey: PublicKey;
    try {
      trustExpressPubkey = new PublicKey(trustExpressAddress);
      buyerPubkey        = new PublicKey(account);
    } catch {
      return withCors(NextResponse.json({ error: 'Invalid public key format' }, { status: 400 }));
    }

    // ── Validate fiat amount (tokenAmount validation is deferred to server-side derivation) ──
    const tokenAmountNum = tokenAmount ? parseFloat(tokenAmount) : 0; // for logging only
    const fiatAmountNum  = parseFloat(fiatAmount);
    if (isNaN(fiatAmountNum) || fiatAmountNum <= 0) {
      return withCors(NextResponse.json({ error: 'Invalid fiat amount' }, { status: 400 }));
    }

    // ── Fetch TrustExpress account ────────────────────────────────────────
    const trustExpressInfo = await connection.getAccountInfo(trustExpressPubkey);
    if (!trustExpressInfo) {
      return withCors(NextResponse.json({ error: 'TrustExpress account not found' }, { status: 404 }));
    }
    if (!trustExpressInfo.owner.equals(PROGRAM_ID)) {
      return withCors(NextResponse.json({
        error: 'Invalid TrustExpress account owner',
        actual: trustExpressInfo.owner.toString(),
        expected: PROGRAM_ID.toString(),
      }, { status: 400 }));
    }

    const { maker, mint, amount: lpAmount, pricePerToken, reservedCount } =
      parseTrustExpressAccount(trustExpressInfo.data);

    // ── Detect token program from mint's owner (classic vs Token-2022) ────
    // The ATA program derives ATAs using [owner, token_program, mint] as seeds.
    // Passing the wrong token_program ID causes IncorrectProgramId on GetAccountDataSize.
    let tokenProgramId = TOKEN_PROGRAM_CLASSIC;
    let decimals = 6; // USDC default
    try {
      const mintInfo = await connection.getAccountInfo(mint);
      if (mintInfo) {
        decimals = mintInfo.data[44];
        if (mintInfo.owner.equals(TOKEN_PROGRAM_2022)) {
          tokenProgramId = TOKEN_PROGRAM_2022;
          console.log('[instant-reserve] Detected Token-2022 mint');
        } else {
          console.log('[instant-reserve] Detected classic SPL token mint');
        }
      }
    } catch {
      console.warn('[instant-reserve] Could not fetch mint info, defaulting to classic token program');
    }

    // ── Derive token amount from on-chain price — integer arithmetic only ─
    //
    // The frontend passes tokenAmount as a float (fiatAmount / pricePerToken),
    // which is subject to IEEE-754 rounding (e.g. 1000/650 ≈ 1.538461538...).
    // Multiplying that float by 10^decimals then flooring can produce a raw
    // amount that is off by 1 ULP, causing on-chain InsufficientAmount errors.
    //
    // Instead: derive tokenAmountRaw entirely in integer arithmetic here where
    // we have the exact on-chain pricePerToken and the real mint decimals.
    //   tokenAmountRaw = ceil(fiatAmountRaw_scaled / pricePerToken)
    //
    // We use ceiling division so the buyer never underpays by a sub-cent rounding
    // error. pricePerToken is stored as a raw u64 integer in the program (it is
    // NOT scaled by decimals — it represents fiat units per whole token).
    //
    // ── Yield split: reduce the fiat portion going to escrow ─────────────
    // When yieldPercent > 0, the customer's total payment is split:
    //   - fiatPortion  (100 - yieldPercent)% → instant_reserve escrow → bank payout
    //   - yieldPortion yieldPercent%          → merchant's staging ATA → YieldVault
    //
    // We reduce fiatAmountNum for the escrow calculation only. The on-chain program
    // sees a smaller fiat amount and reserves proportionally fewer tokens — exactly
    // what it needs to cover the reduced bank payout. The remaining tokens flow
    // directly to the merchant's ATA via a second SPL transfer in the same tx.
    const totalFiatAmountRaw = BigInt(Math.round(fiatAmountNum));
    const scalar             = BigInt(10) ** BigInt(decimals);

    // Integer split: yieldRaw tokens out of the total token count
    // Total tokens the customer must send for the FULL fiat amount
    const totalTokenAmountRaw = (totalFiatAmountRaw * scalar + pricePerToken - BigInt(1)) / pricePerToken;

    // Yield portion in raw token units (floor — we never over-split)
    const yieldTokenAmountRaw = yieldEnabled
      ? (totalTokenAmountRaw * BigInt(yieldPercent)) / BigInt(100)
      : BigInt(0);

    // Escrow portion: the remainder. ceil so escrow always has enough for fiat payout.
    const escrowTokenAmountRaw = totalTokenAmountRaw - yieldTokenAmountRaw;

    // fiatAmountRaw passed to instant_reserve represents only the escrow portion
    // (the reduced fiat the LP needs to cover). We derive it from escrowTokenAmountRaw
    // so the on-chain math stays consistent: fiat = floor(escrowTokens * pricePerToken / scalar)
    const fiatAmountRaw = yieldEnabled
      ? (escrowTokenAmountRaw * pricePerToken) / scalar
      : totalFiatAmountRaw;

    // For instant_reserve instruction — only the escrow token count
    const tokenAmountRaw = escrowTokenAmountRaw;

    console.log(
      `[instant-reserve] totalFiatAmountRaw=${totalFiatAmountRaw} pricePerToken=${pricePerToken} ` +
      `decimals=${decimals} totalTokenAmountRaw=${totalTokenAmountRaw} ` +
      `yieldPercent=${yieldPercent} yieldTokenAmountRaw=${yieldTokenAmountRaw} ` +
      `escrowTokenAmountRaw=${escrowTokenAmountRaw} fiatAmountRaw=${fiatAmountRaw} ` +
      `(frontend hint was ${tokenAmountNum})`
    );

    // ── Re-validate LP capacity ───────────────────────────────────────────
    //
    // Between QR generation (GET) and the customer scanning (POST), another
    // reservation may have consumed this LP's liquidity or filled its slots.
    // Checking here — before building the transaction — lets us return a clean
    // 409 so the frontend can re-search for a live LP rather than letting the
    // wallet receive a signed transaction that will fail on-chain with the
    // opaque InsufficientAmount or ReservationLimitReached errors.
    const MAX_RESERVATION_SLOTS = 10;
    if (reservedCount >= MAX_RESERVATION_SLOTS) {
      console.warn(
        `[instant-reserve] LP ${trustExpressAddress} is full ` +
        `(${reservedCount}/${MAX_RESERVATION_SLOTS} slots)`
      );
      return withCors(NextResponse.json(
        { error: 'LP_CAPACITY_FULL', message: 'This liquidity provider is fully booked. Please try again to get a fresh rate.' },
        { status: 409 }
      ));
    }
    // Check escrow liquidity against only the escrow portion (tokenAmountRaw).
    // The yield portion goes directly to the merchant's ATA, not from the LP.
    if (lpAmount < tokenAmountRaw) {
      console.warn(
        `[instant-reserve] LP ${trustExpressAddress} has insufficient liquidity: ` +
        `available=${lpAmount} required=${tokenAmountRaw} (escrow portion)`
      );
      return withCors(NextResponse.json(
        { error: 'LP_INSUFFICIENT_AMOUNT', message: 'This liquidity provider no longer has enough funds. Please try again to get a fresh rate.' },
        { status: 409 }
      ));
    }

    // ── Build compact payout_details ──────────────────────────────────────
    // Stored as minified JSON with short keys to stay under the 100-char on-chain limit.
    // {"b":"044","a":"0690000040","n":"Me"} = ~40 chars
    // initiate-buy-payout normalises b→bank_code, a→account_number, n→beneficiary_name
    let compactPayoutDetails: string | null = null;
    if (payoutDetailsRaw) {
      try {
        const pd = JSON.parse(payoutDetailsRaw);
        const compact = JSON.stringify({
          b: pd.bank_code        ?? '',
          a: pd.account_number   ?? '',
          n: pd.beneficiary_name ?? '',
        });
        compactPayoutDetails = compact.length <= 100 ? compact : compact.slice(0, 100);
        console.log(`[instant-reserve] payout_details (${compact.length} chars): ${compact}`);
        if (!pd.bank_code) {
          console.warn('[instant-reserve] bank_code is empty — run Supabase backfill: UPDATE merchant_bank_accounts SET bank_code = \'044\' WHERE account_number = \'0690000040\'');
        }
      } catch {
        compactPayoutDetails = payoutDetailsRaw.slice(0, 100);
      }
    }

    const instructionData = buildInstructionData(
      tokenAmountRaw,
      fiatAmountRaw,
      currency,
      compactPayoutDetails,
    );

    // ── Derive ATAs using the detected token program ──────────────────────
    const takerATA        = deriveATA(buyerPubkey,        mint, tokenProgramId);
    const trustExpressATA = deriveATA(trustExpressPubkey, mint, tokenProgramId);

    // ── Accounts — must match InstantReserve struct exactly ───────────────
    //
    // pub struct InstantReserve<'info> {
    //   trust_express:            writable
    //   maker:                    read-only (has_one)
    //   taker:                    writable, signer
    //   mint:                     read-only
    //   taker_ata:                writable
    //   trust_express_ata:        writable
    //   global_state:             read-only
    //   token_program:            read-only   ← must match mint's owner
    //   associated_token_program: read-only
    //   system_program:           read-only
    // }

    const keys = [
      { pubkey: trustExpressPubkey,          isSigner: false, isWritable: true  },
      { pubkey: maker,                       isSigner: false, isWritable: false },
      { pubkey: buyerPubkey,                 isSigner: true,  isWritable: true  },
      { pubkey: mint,                        isSigner: false, isWritable: false },
      { pubkey: takerATA,                    isSigner: false, isWritable: true  },
      { pubkey: trustExpressATA,             isSigner: false, isWritable: true  },
      { pubkey: GLOBAL_STATE_PDA,            isSigner: false, isWritable: false },
      { pubkey: tokenProgramId,              isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId,     isSigner: false, isWritable: false },
      ...(referenceParam ? [{ pubkey: new PublicKey(referenceParam), isSigner: false, isWritable: false }] : []),
    ];

    const reserveInstruction = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys,
      data: instructionData,
    });

    const transaction = new Transaction();

    // ── Yield split: inject token transfer BEFORE instant_reserve ─────────
    //
    // Instruction order matters:
    //   1. [optional] createAssociatedTokenAccountIdempotent — ensure merchant ATA exists
    //   2. [optional] transfer yieldTokenAmountRaw from takerATA → merchantATA
    //   3. instant_reserve — moves escrowTokenAmountRaw from takerATA → trustExpressATA
    //
    // The customer's wallet signs everything. Both token debits come from takerATA
    // in a single atomic transaction — either both succeed or neither does.
    //
    // Note: this uses the SAME mint as the escrow. When Solstice devnet USDC is
    // used for the LP, that same mint flows through both paths. On mainnet this is
    // always EPjFWdd5... (real USDC) so no special handling is needed.
    if (yieldEnabled && yieldTokenAmountRaw > BigInt(0) && merchantWalletRaw) {
      let merchantPubkey: PublicKey;
      try {
        merchantPubkey = new PublicKey(merchantWalletRaw);
      } catch {
        return withCors(NextResponse.json({ error: 'Invalid merchantWallet public key' }, { status: 400 }));
      }

      // Derive the merchant's ATA for the same mint as the escrow
      // getAssociatedTokenAddressSync mirrors deriveATA but uses spl-token's version
      // which is compatible with createAssociatedTokenAccountIdempotentInstruction.
      const merchantATA = getAssociatedTokenAddressSync(
        mint,
        merchantPubkey,
        false,
        tokenProgramId,
      );

      // Idempotent ATA creation — no-ops if the account already exists.
      // Paid by the customer (feePayer = buyerPubkey). Cost: ~0.002 SOL if new.
      const createMerchantATAIx = createAssociatedTokenAccountIdempotentInstruction(
        buyerPubkey,   // payer
        merchantATA,   // ata to create
        merchantPubkey, // owner
        mint,
        tokenProgramId,
      );

      // Transfer yieldTokenAmountRaw from customer's ATA to merchant's ATA
      const yieldTransferIx = createTransferInstruction(
        takerATA,               // source
        merchantATA,            // destination
        buyerPubkey,            // owner/signer
        yieldTokenAmountRaw,    // amount in raw lamports
        [],                     // multisigners (none)
        tokenProgramId,
      );

      transaction.add(createMerchantATAIx);
      transaction.add(yieldTransferIx);

      console.log(
        `[instant-reserve] Yield split: ${yieldTokenAmountRaw} raw tokens → merchant ATA ${merchantATA.toString()} ` +
        `(${yieldPercent}% of total). Escrow gets ${escrowTokenAmountRaw} raw tokens.`
      );
    }

    // Always add the core instant_reserve instruction last
    transaction.add(reserveInstruction);

    const { blockhash } = await connection.getLatestBlockhash('finalized');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = buyerPubkey;

    const serialized = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });

    // Simulate to surface on-chain errors early
    try {
      const sim = await connection.simulateTransaction(transaction, undefined, true);
      if (sim.value.err) {
        console.error('[instant-reserve] Simulation failed:', JSON.stringify(sim.value.err));
        console.error('[instant-reserve] Simulation logs:', sim.value.logs);
      } else {
        console.log('[instant-reserve] Simulation OK — yield split:', yieldEnabled, `(${yieldPercent}%)`);
      }
    } catch (simErr) {
      console.warn('[instant-reserve] Could not simulate:', simErr);
    }

    return withCors(NextResponse.json({
      transaction: serialized.toString('base64'),
      message: yieldEnabled
        ? `Pay ${tokenAmountNum} tokens: ${100 - yieldPercent}% → ${currency} bank payout, ${yieldPercent}% → YieldVault`
        : `Reserve ${tokenAmountNum} tokens for ${fiatAmountNum} ${currency} instant payout`,
    }));

  } catch (error) {
    console.error('POST error:', error);
    return withCors(NextResponse.json({
      error: 'Failed to create transaction',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 }));
  }
}