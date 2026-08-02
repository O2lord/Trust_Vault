// app/api/initiate-buy-payout/route.ts
//
// Called ONLY by the elected executor validator to initiate an outbound
// bank transfer (fiat → taker's bank) on behalf of the LP buyer.
//
// Supported processors: flutterwave | paystack | opay | korapay

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import { decrypt } from '../../../../discord-bot/lib/flutterwave-credentials-bot';
import { getOpayCredentialsForBuyOrder } from '../../../../discord-bot/lib/opay-credentials-bot';
import { getPaystackCredentialsForBuyOrder } from '../../../../discord-bot/lib/paystack-credentials-bot';
import { getKorapayCredentialsForBuyOrder } from '../../../../discord-bot/lib/korapay-credentials-bot';
import FlutterwaveService from '../../../../discord-bot/services/flutterwaveService';
import OpayService from '../../../../discord-bot/services/opayServices';
import PaystackService from '../../../../discord-bot/services/paystackService';
import KorapayService from '../../../../discord-bot/services/korapayService';
import { authenticateValidator } from '@/lib/validator-auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface InitiatePayoutRequest {
  payout_reference: string;
  trust_express_pda: string;
  taker: string;
  fiat_amount: number;
  currency: string;
  payout_details: string | {
    account_number: string;
    bank_code?: string;
    account_bank?: string;
    beneficiary_name?: string;
    account_name?: string;
    type?: string;
    narration?: string;
  };
  token_amount?: string;
  maker?: string;
  mint_address?: string;
}

interface LpCredentials {
  processor: string;
  secretKey?: string;                  // Flutterwave / Korapay
  paystackCredentials?: { secretKey: string };
  korapayCredentials?: { secretKey: string };
  opayCredentials?: { publicKey: string; secretKey: string; merchantId: string };
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetch + decrypt LP buyer credentials
// ─────────────────────────────────────────────────────────────────────────────

async function getLpCredentials(trustExpressPda: string): Promise<LpCredentials | null> {
  const { data: link, error: linkError } = await supabase
    .from('buy_order_credentials')
    .select('credential_id, wallet_address')
    .eq('trust_express_pda', trustExpressPda)
    .maybeSingle();

  if (linkError || !link) {
    console.warn(`⚠️ No buy_order_credentials for PDA: ${trustExpressPda}`);
    return null;
  }

  const { data: cred, error: credError } = await supabase
    .from('buyer_flutterwave_credentials')
    .select(`
      encrypted_secret_key, encryption_iv, encryption_auth_tag,
      encrypted_public_key, encryption_public_key_iv, encryption_public_key_auth_tag,
      processor_account_id, is_active, processor
    `)
    .eq('id', link.credential_id)
    .eq('wallet_address', link.wallet_address)
    .single();

  if (credError || !cred || !cred.is_active) {
    console.warn(`⚠️ No active credentials for credential_id: ${link.credential_id}`);
    return null;
  }

  const processor = (cred.processor ?? 'flutterwave') as string;
  const secretKey = decrypt(cred.encrypted_secret_key, cred.encryption_iv, cred.encryption_auth_tag);

  if (processor === 'korapay') {
    return { processor: 'korapay', korapayCredentials: { secretKey } };
  }

  if (processor === 'paystack') {
    return { processor: 'paystack', paystackCredentials: { secretKey } };
  }

  if (processor === 'opay') {
    if (!cred.encrypted_public_key || !cred.processor_account_id) {
      console.error(`❌ OPay credential missing public_key or merchant_id for PDA: ${trustExpressPda}`);
      return null;
    }
    const publicKey = decrypt(
      cred.encrypted_public_key,
      cred.encryption_public_key_iv!,
      cred.encryption_public_key_auth_tag!
    );
    return { processor: 'opay', opayCredentials: { publicKey, secretKey, merchantId: cred.processor_account_id } };
  }

  // Default: Flutterwave
  return { processor: 'flutterwave', secretKey };
}

// ─────────────────────────────────────────────────────────────────────────────
// Mark payout failed
// ─────────────────────────────────────────────────────────────────────────────

async function markPayoutFailed(payoutReference: string, reason: string): Promise<void> {
  const { error } = await supabase
    .from('buy_order_payouts')
    .update({ status: 'failed_to_initiate' })
    .eq('payout_reference', payoutReference);
  if (error) {
    console.warn(`⚠️ Failed to mark payout as failed_to_initiate: ${error.message}`);
  } else {
    console.log(`📝 Marked ${payoutReference} as failed_to_initiate: ${reason}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Generate receipt
// ─────────────────────────────────────────────────────────────────────────────

async function generateReceipt(
  body: InitiatePayoutRequest,
  transferReference: string,
  executorPubkey: string
): Promise<string | null> {
  try {
    const rawPayoutDetails =
      typeof body.payout_details === 'string'
        ? JSON.parse(body.payout_details)
        : body.payout_details;

    const parsedPayoutDetails = {
      account_number:   rawPayoutDetails.account_number ?? rawPayoutDetails.a ?? '',
      bank_code:        rawPayoutDetails.bank_code       ?? rawPayoutDetails.b ?? '',
      bank_name:        rawPayoutDetails.bank_name         ?? null,
      beneficiary_name: rawPayoutDetails.beneficiary_name ?? rawPayoutDetails.account_name ?? rawPayoutDetails.n ?? '',
      type:             rawPayoutDetails.type ?? 'bank_transfer',
    };

    const tokenAmountBigInt = BigInt(body.token_amount ?? '0');
    const feeAmountBigInt   = (tokenAmountBigInt * BigInt(5)) / BigInt(100);
    const receiptId = uuidv4();

    const { error } = await supabase.from('receipts').insert({
      id:                    receiptId,
      payout_reference:      body.payout_reference,
      transaction_signature: null,
      trust_express_address: body.trust_express_pda,
      taker_address:         body.taker,
      maker_address:         body.maker ?? null,
      token_amount:          body.token_amount ?? null,
      fiat_amount:           String(body.fiat_amount),
      currency:              body.currency,
      fee_amount:            feeAmountBigInt.toString(),
      payout_method:         parsedPayoutDetails.type ?? 'bank_transfer',
      payout_details:        parsedPayoutDetails,
      account_number:        parsedPayoutDetails.account_number   ?? null,
      bank_name:             parsedPayoutDetails.bank_name         ?? null,
      beneficiary_name:      parsedPayoutDetails.beneficiary_name  ?? null,
      flw_reference:         transferReference,
      status:                'pending',
      mint_address:          body.mint_address ?? null,
      created_at:            new Date().toISOString(),
    });

    if (error) {
      console.error(`❌ Receipt insert failed: ${error.message}`);
      return null;
    }

    return receiptId;
  } catch (err) {
    console.error('❌ generateReceipt error:', err instanceof Error ? err.message : err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/initiate-buy-payout
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // ── 1. Authenticate ───────────────────────────────────────────────────────
    const apiKey = request.headers.get('x-validator-key');
    const botVersion = request.headers.get('x-bot-version');
    const auth = await authenticateValidator(apiKey, botVersion);

    if (!auth.valid) {
      return NextResponse.json({ success: false, error: auth.error ?? 'Unauthorized' }, { status: 401 });
    }

    // ── 2. Parse body ─────────────────────────────────────────────────────────
    let body: InitiatePayoutRequest;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
    }

    const { payout_reference, trust_express_pda, taker, fiat_amount, currency, payout_details } = body;

    if (!payout_reference || !trust_express_pda || !taker || !fiat_amount || !currency || !payout_details) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    console.log(
      `💸 Executor ${auth.validatorPubkey?.slice(0, 8)} initiating payout: ` +
      `${payout_reference} (${fiat_amount} ${currency})`
    );

    // ── 3. Idempotency ────────────────────────────────────────────────────────
    const { data: existing } = await supabase
      .from('buy_order_payouts')
      .select('status, flw_transfer_reference')
      .eq('payout_reference', payout_reference)
      .maybeSingle();

    if (existing?.status === 'initiated' && existing.flw_transfer_reference) {
      console.log(`ℹ️ Already initiated: ${payout_reference}`);
      return NextResponse.json({ success: true, flw_reference: existing.flw_transfer_reference, idempotent: true });
    }

    // ── 4. Fetch LP credentials ───────────────────────────────────────────────
    const lpCredentials = await getLpCredentials(trust_express_pda);
    if (!lpCredentials) {
      await markPayoutFailed(payout_reference, 'No payment credentials found');
      return NextResponse.json({ success: false, error: 'No payment credentials found for this buy order' }, { status: 404 });
    }

    // ── 5. Parse payout_details ───────────────────────────────────────────────
    let rawDetails: Record<string, string>;
    try {
      rawDetails = typeof payout_details === 'string' ? JSON.parse(payout_details) : payout_details;
    } catch {
      await markPayoutFailed(payout_reference, 'Invalid payout_details JSON');
      return NextResponse.json({ success: false, error: 'Invalid payout_details format' }, { status: 400 });
    }

    const parsedDetails = {
      account_number:   rawDetails.account_number ?? rawDetails.a ?? '',
      bank_code:        rawDetails.bank_code       ?? rawDetails.b ?? '',
      beneficiary_name: rawDetails.beneficiary_name ?? rawDetails.account_name ?? rawDetails.n ?? '',
      type:             (['bank_transfer', 'mobile_money', 'flutterwave_wallet'].includes(rawDetails.type)
                          ? rawDetails.type : 'bank_transfer') as 'bank_transfer' | 'mobile_money' | 'flutterwave_wallet',
      narration:        rawDetails.narration ?? `Payment ${payout_reference}`,
    };

    if (!parsedDetails.account_number || !parsedDetails.bank_code) {
      const errMsg = `Missing account_number or bank_code in payout_details`;
      await markPayoutFailed(payout_reference, errMsg);
      return NextResponse.json({ success: false, error: errMsg }, { status: 400 });
    }

    console.log(`🔍 [DEBUG] Raw payout_details for ${payout_reference}:`, JSON.stringify(payout_details));
    console.log(`🔍 [DEBUG] Parsed account_number: "${parsedDetails.account_number}", bank_code: "${parsedDetails.bank_code}"`);

    // ── 6. Dispatch to processor ──────────────────────────────────────────────
    let transferReference: string;

    if (lpCredentials.processor === 'korapay') {
      // ── Korapay path ───────────────────────────────────────────────────────
      console.log(`🔄 [Korapay] Initiating transfer: ${payout_reference}`);

      const korapayResult = await KorapayService.initiateTransfer(
        {
          account_number: parsedDetails.account_number,
          bank_code:      parsedDetails.bank_code,
          account_name:   parsedDetails.beneficiary_name,
          narration:      parsedDetails.narration,
        },
        fiat_amount,
        currency,
        payout_reference,
        lpCredentials.korapayCredentials!
      );

      if (!korapayResult.success) {
        const errMsg = korapayResult.error ?? 'Korapay transfer failed';
        console.error(`❌ [Korapay] Transfer failed for ${payout_reference}:`, errMsg);
        await markPayoutFailed(payout_reference, errMsg);
        return NextResponse.json({ success: false, error: errMsg }, { status: 502 });
      }

      transferReference = korapayResult.reference;
      console.log(`✅ [Korapay] Transfer initiated. Reference: ${transferReference}`);

    } else if (lpCredentials.processor === 'paystack') {
      // ── Paystack path ──────────────────────────────────────────────────────
      console.log(`🔄 [Paystack] Initiating transfer: ${payout_reference}`);

      const paystackResult = await PaystackService.initiateTransfer(
        {
          account_number: parsedDetails.account_number,
          bank_code:      parsedDetails.bank_code,
          account_name:   parsedDetails.beneficiary_name,
          narration:      parsedDetails.narration,
        },
        fiat_amount,
        currency,
        payout_reference,
        lpCredentials.paystackCredentials!
      );

      if (!paystackResult.success) {
        const errMsg = paystackResult.error ?? 'Paystack transfer failed';
        console.error(`❌ [Paystack] Transfer failed for ${payout_reference}:`, errMsg);
        await markPayoutFailed(payout_reference, errMsg);
        return NextResponse.json({ success: false, error: errMsg }, { status: 502 });
      }

      transferReference = paystackResult.transferCode ?? paystackResult.reference;
      console.log(`✅ [Paystack] Transfer initiated. TransferCode: ${transferReference}`);

    } else if (lpCredentials.processor === 'opay') {
      // ── OPay path ──────────────────────────────────────────────────────────
      console.log(`🔄 [OPay] Initiating transfer: ${payout_reference}`);

      const opayResult = await OpayService.initiateTransfer(
        {
          account_number: parsedDetails.account_number,
          bank_code:      parsedDetails.bank_code,
          account_name:   parsedDetails.beneficiary_name,
          narration:      parsedDetails.narration,
        },
        fiat_amount,
        currency,
        payout_reference,
        lpCredentials.opayCredentials!
      );

      if (!opayResult.success) {
        const errMsg = opayResult.error ?? 'OPay transfer failed';
        console.error(`❌ [OPay] Transfer failed for ${payout_reference}:`, errMsg);
        await markPayoutFailed(payout_reference, errMsg);
        return NextResponse.json({ success: false, error: errMsg }, { status: 502 });
      }

      transferReference = opayResult.orderNo ?? opayResult.reference;
      console.log(`✅ [OPay] Transfer initiated. OrderNo: ${transferReference}`);

    } else {
      // ── Flutterwave path (default) ─────────────────────────────────────────
      console.log(`🔄 [Flutterwave] Initiating transfer: ${payout_reference}`);

      // In test mode, append _PMCKDU_1 so FLW simulates success after 1 minute
      const isTestMode = lpCredentials.secretKey!.startsWith('FLWSECK_TEST');
      const flwReference = isTestMode
        ? `${payout_reference}_PMCKDU_1`
        : payout_reference;

      if (isTestMode) {
        console.log(`🧪 [Flutterwave] Test mode detected — using reference: ${flwReference}`);
      }

      const result = await FlutterwaveService.initiatePayout(
        parsedDetails,
        fiat_amount,
        currency,
        flwReference,   // ← changed from payout_reference
        lpCredentials.secretKey!
      );

      if (!result.success) {
        const errMsg = result.error ?? 'Flutterwave transfer failed';
        console.error(`❌ Flutterwave transfer failed for ${payout_reference}:`, errMsg);
        await markPayoutFailed(payout_reference, errMsg);
        return NextResponse.json({ success: false, error: errMsg }, { status: 502 });
      }

      if (!result.flw_ref) {
        const errMsg = 'Flutterwave returned success but no flw_ref — transfer may not have been created';
        console.error(`❌ ${errMsg} for ${payout_reference}`);
        await markPayoutFailed(payout_reference, errMsg);
        return NextResponse.json({ success: false, error: errMsg }, { status: 502 });
      }
      transferReference = result.flw_ref;
      console.log(`✅ Transfer initiated. FLW ref: ${transferReference}`);
    }

    // ── 7. Update payout row ──────────────────────────────────────────────────
    await supabase
      .from('buy_order_payouts')
      .update({ flw_transfer_reference: transferReference, status: 'initiated' })
      .eq('payout_reference', payout_reference);

    // ── 8. Generate receipt (fire-and-forget) ─────────────────────────────────
    generateReceipt(body, transferReference, auth.validatorPubkey!).then((receiptId) => {
      if (receiptId) console.log(`📄 Pending receipt created: ${receiptId}`);
      else console.warn('⚠️ Receipt creation failed (non-fatal)');
    });

    return NextResponse.json({ success: true, flw_reference: transferReference });

  } catch (error) {
    console.error('❌ initiate-buy-payout error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}