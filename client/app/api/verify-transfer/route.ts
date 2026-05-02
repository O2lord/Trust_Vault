// app/api/verify-transfer/route.ts
//
// UPDATED: Added OPay processor dispatch.
// Changes from original:
//   1. Import getOpayCredentialsForBuyOrder
//   2. getLpSecretKey returns { secretKey, processor } instead of string
//   3. Dispatch to OPay getTransferStatus or Flutterwave checkTransferStatus
//      based on processor — 3-line if/else
//
// All existing Flutterwave logic is UNTOUCHED.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import { decrypt } from '../../../../discord-bot/lib/flutterwave-credentials-bot';
import { getOpayCredentialsForBuyOrder } from '../../../../discord-bot/lib/opay-credentials-bot';
import { getPaystackCredentialsForBuyOrder } from '../../../../discord-bot/lib/paystack-credentials-bot';
import OpayService from '../../../../discord-bot/services/opayServices';
import PaystackService from '../../../../discord-bot/services/paystackService';
import { authenticateValidator } from '@/lib/validator-auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface TransferStatusResponse {
  verified: boolean;
  status?: string;
  transferId?: number;
  amount?: number;
  currency?: string;
  reference?: string;
  completedAt?: string;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Credential lookup — now returns { secretKey, processor }
// MINIMAL CHANGE: just added processor to the return value
// ─────────────────────────────────────────────────────────────────────────────

async function getLpCredentials(
  trustExpressPda: string
): Promise<{ secretKey: string; processor: string } | null> {
  const { data: link, error: linkError } = await supabase
    .from('buy_order_credentials')
    .select('credential_id, wallet_address')
    .eq('trust_express_pda', trustExpressPda)
    .maybeSingle();

  if (linkError || !link) {
    console.warn(`⚠️ No buy_order_credentials row for PDA: ${trustExpressPda}`);
    return null;
  }

  const { data: cred, error: credError } = await supabase
    .from('buyer_flutterwave_credentials')
    .select('encrypted_secret_key, encryption_iv, encryption_auth_tag, is_active, processor')
    .eq('id', link.credential_id)
    .eq('wallet_address', link.wallet_address)
    .single();

  if (credError || !cred || !cred.is_active) return null;

  return {
    secretKey: decrypt(cred.encrypted_secret_key, cred.encryption_iv, cred.encryption_auth_tag),
    processor: cred.processor ?? 'flutterwave',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Flutterwave transfer status — UNCHANGED from original
// ─────────────────────────────────────────────────────────────────────────────

async function checkFlutterwaveTransferStatus(
  reference: string,
  secretKey: string
): Promise<TransferStatusResponse> {
  try {
    // `reference` here is now the numeric Flutterwave transfer ID (e.g. "12345")
    // stored as flw_transfer_reference after the flutterwaveService.ts fix.
    // We detect whether it's a numeric ID or a legacy payout-ref string
    // so this stays backwards-compatible during any rollout.
    const isNumericId = /^\d+$/.test(reference);

    let transferData: any;

    if (isNumericId) {
      // ✅ New path: lookup by Flutterwave transfer ID — O(1), exact match
      console.log(`🔍 [FLW] GET /transfers/${reference} (by numeric ID)`);
      const response = await axios.get(
        `https://api.flutterwave.com/v3/transfers/${reference}`,
        { headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json' }, timeout: 10000 }
      );
      console.log(`🔍 [FLW] Response status: ${response.status}`);
      console.log(`🔍 [FLW] Response body:`, JSON.stringify(response.data, null, 2));

      if (response.data.status !== 'success') {
        console.error(`❌ [FLW] API returned non-success: ${response.data.message}`);
        return { verified: false, status: 'api_error', error: response.data.message };
      }
      transferData = response.data.data;
    } else {
      // Legacy path: lookup by payout reference string
      console.log(`🔍 [FLW] GET /transfers?reference=${reference} (by payout ref — legacy)`);
      const response = await axios.get(
        `https://api.flutterwave.com/v3/transfers?reference=${encodeURIComponent(reference)}`,
        { headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json' }, timeout: 10000 }
      );
      console.log(`🔍 [FLW] Response status: ${response.status}`);
      console.log(`🔍 [FLW] Response body:`, JSON.stringify(response.data, null, 2));

      if (response.data.status !== 'success') {
        console.error(`❌ [FLW] API returned non-success: ${response.data.message}`);
        return { verified: false, status: 'api_error', error: response.data.message };
      }

      const transfers: any[] = response.data.data || [];
      console.log(`🔍 [FLW] Transfers found in list: ${transfers.length}`);
      transfers.forEach((t: any) => {
        console.log(`   → id: ${t.id}, reference: ${t.reference}, status: ${t.status}`);
      });

      transferData = transfers.find(
        (t: any) => t.reference === reference || t.narration?.includes(reference)
      );

      if (!transferData) {
        console.warn(`⚠️ [FLW] No transfer matched reference: ${reference}`);
        return { verified: false, status: 'not_found' };
      }
    }

    console.log(`🔍 [FLW] Matched transfer — id: ${transferData.id}, status: ${transferData.status}, amount: ${transferData.amount} ${transferData.currency}`);

    const isSuccessful = transferData.status === 'SUCCESSFUL' || transferData.status === 'PENDING';

    if (!isSuccessful) {
      console.warn(`⚠️ [FLW] Transfer status is not successful/pending: ${transferData.status}`);
    }

    return {
      verified: isSuccessful,
      status: transferData.status,
      transferId: transferData.id,
      amount: transferData.amount,
      currency: transferData.currency,
      reference: transferData.reference,
      completedAt: transferData.complete_message ? transferData.created_at : undefined,
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error(`❌ [FLW] Axios error — status: ${error.response?.status}`);
      console.error(`❌ [FLW] Response body:`, JSON.stringify(error.response?.data, null, 2));
      return { verified: false, status: 'api_error', error: error.response?.data?.message ?? error.message };
    }
    console.error(`❌ [FLW] Unknown error:`, error);
    return { verified: false, status: 'unknown_error', error: String(error) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// OPay transfer status — NEW
// ─────────────────────────────────────────────────────────────────────────────

async function checkOpayTransferStatus(
  reference: string,
  trustExpressPda: string
): Promise<TransferStatusResponse> {
  try {
    const opayCredInfo = await getOpayCredentialsForBuyOrder(trustExpressPda);
    if (!opayCredInfo) {
      return { verified: false, error: 'No OPay credentials found for this buy order' };
    }

    const service = OpayService.createInstance(opayCredInfo.credentials);
    const result = await service.getTransferStatus(reference);

    return {
      verified: result.verified,
      status: result.status,
      amount: result.amount,
      currency: result.currency,
      reference: result.reference,
      error: result.error,
    };
  } catch (err) {
    return { verified: false, status: 'api_error', error: String(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Paystack transfer status — NEW
// ─────────────────────────────────────────────────────────────────────────────

async function checkPaystackTransferStatus(
  reference: string,
  trustExpressPda: string
): Promise<TransferStatusResponse> {
  try {
    const credInfo = await getPaystackCredentialsForBuyOrder(trustExpressPda);
    if (!credInfo) return { verified: false, error: 'No Paystack credentials found for this buy order' };
    const service = PaystackService.createInstance(credInfo.credentials);
    const result = await service.getTransferStatus(reference);
    return {
      verified: result.verified,
      status: result.status,
      amount: result.amount,
      currency: result.currency,
      reference: result.reference,
      error: result.error,
    };
  } catch (err) {
    return { verified: false, status: 'api_error', error: String(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/verify-transfer
// CHANGE: 3-line processor dispatch — everything else identical
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // ── 1. Authenticate ───────────────────────────────────────────────────────
    const apiKey = request.headers.get('x-validator-key');
    const botVersion = request.headers.get('x-bot-version');
    const auth = await authenticateValidator(apiKey, botVersion);

    if (!auth.valid) {
      return NextResponse.json(
        { verified: false, error: auth.error ?? 'Unauthorized' },
        { status: 401 }
      );
    }

    // ── 2. Parse params ───────────────────────────────────────────────────────
    const { searchParams } = new URL(request.url);
    const payoutReference = searchParams.get('payout_reference');
    const trustExpressPda = searchParams.get('trust_express_pda');

    if (!payoutReference || !trustExpressPda) {
      return NextResponse.json(
        { verified: false, error: 'Missing required params: payout_reference, trust_express_pda' },
        { status: 400 }
      );
    }

    console.log(`🔍 Validator ${auth.validatorPubkey?.slice(0, 8)} checking transfer: ${payoutReference}`);

    // ── 3. Get credentials + processor ───────────────────────────────────────
    const credInfo = await getLpCredentials(trustExpressPda);
    if (!credInfo) {
      return NextResponse.json(
        { verified: false, error: 'No credentials found for this buy order' },
        { status: 404 }
      );
    }

    // ── 4. Dispatch to correct processor ─────────────────────────────────────
    const { data: payoutRow } = await supabase
      .from('buy_order_payouts')
      .select('flw_transfer_reference, status')
      .eq('payout_reference', payoutReference)
      .maybeSingle();

    console.log(`🔍 DB payout row — flw_transfer_reference: ${payoutRow?.flw_transfer_reference}, status: ${payoutRow?.status}`);

    const referenceToCheck = payoutRow?.flw_transfer_reference ?? payoutReference;
    console.log(`🔍 Will query processor with reference: "${referenceToCheck}" (processor: ${credInfo.processor})`);

    let result: TransferStatusResponse;

    if (credInfo.processor === 'opay') {
      result = await checkOpayTransferStatus(referenceToCheck, trustExpressPda);
    } else if (credInfo.processor === 'paystack') {
      result = await checkPaystackTransferStatus(referenceToCheck, trustExpressPda);
    } else {
      result = await checkFlutterwaveTransferStatus(referenceToCheck, credInfo.secretKey);
    }

    console.log(`${result.verified ? '✅' : '❌'} [${credInfo.processor}] Transfer ${payoutReference}: status=${result.status}`);

    // ── 5. Audit log ──────────────────────────────────────────────────────────
    await supabase.from('validator_verifications').insert({
      validator_pubkey: auth.validatorPubkey,
      payout_reference: payoutReference,
      trust_express_pda: trustExpressPda,
      order_type: 'buy',
      verified: result.verified,
      amount: result.amount ?? null,
      currency: result.currency ?? null,
      created_at: new Date().toISOString(),
    }).then(({ error }) => {
      if (error) console.warn('⚠️ Failed to log validator verification:', error.message);
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error('❌ verify-transfer error:', error);
    return NextResponse.json(
      { verified: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { status: 200 });
}