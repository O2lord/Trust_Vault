// app/api/verify-payment/route.ts
//
// UPDATED: Added OPay processor dispatch.
// The only change from the original is:
//   1. Import getOpayCredentialsForSellOrder
//   2. getSecretKeyForSellOrder renamed to getCredentialsForSellOrder (returns {secretKey, processor})
//   3. verifyPaymentWithKey dispatches to OPay or Flutterwave based on processor
//
// All existing Flutterwave logic is UNTOUCHED.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import { decrypt } from '../../../../discord-bot/lib/flutterwave-credentials-bot';
import { getOpayCredentialsForSellOrder } from '../../../../discord-bot/lib/opay-credentials-bot';
import { getPaystackCredentialsForSellOrder } from '../../../../discord-bot/lib/paystack-credentials-bot';
import OpayService from '../../../../discord-bot/services/opayServices';
import PaystackService from '../../../../discord-bot/services/paystackService';
import { authenticateValidator } from '@/lib/validator-auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// This route is auth-gated and per-validator/per-payment — never cache it.
export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────────
// Helper — attach no-store headers to every JSON response this route returns
// ─────────────────────────────────────────────────────────────────────────────

function noStoreJson(body: unknown, init?: { status?: number }): NextResponse {
  const response = NextResponse.json(body, init);
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  return response;
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface VerifyPaymentResponse {
  verified: boolean;
  amount?: number;
  currency?: string;
  status?: string;
  transactionId?: number;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Credential lookup — returns { secretKey, processor } for both order types
// MINIMAL CHANGE: now also returns processor so we know which API to call
// ─────────────────────────────────────────────────────────────────────────────

async function getCredentialsForBuyOrder(
  trustExpressPda: string
): Promise<{ secretKey: string; processor: string } | null> {
  const { data: link, error: linkError } = await supabase
    .from('buy_order_credentials')
    .select('credential_id, wallet_address')
    .eq('trust_express_pda', trustExpressPda)
    .maybeSingle();

  if (linkError || !link) return null;

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

async function getCredentialsForSellOrder(
  trustExpressPda: string
): Promise<{ secretKey: string; processor: string } | null> {
  const { data: link, error: linkError } = await supabase
    .from('sell_order_credentials')
    .select(`
      credential_id,
      wallet_address,
      seller_flutterwave_accounts (
        encrypted_secret_key,
        encryption_iv,
        encryption_auth_tag,
        is_active,
        processor
      )
    `)
    .eq('trust_express_pda', trustExpressPda)
    .maybeSingle();

  if (linkError || !link) return null;

  const credData = Array.isArray(link.seller_flutterwave_accounts)
    ? link.seller_flutterwave_accounts[0]
    : link.seller_flutterwave_accounts;

  if (!credData || !credData.is_active) return null;

  return {
    secretKey: decrypt(credData.encrypted_secret_key, credData.encryption_iv, credData.encryption_auth_tag),
    processor: (credData as any).processor ?? 'flutterwave',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Flutterwave verification — UNCHANGED from original
// ─────────────────────────────────────────────────────────────────────────────

async function verifyFlutterwavePayment(
  reference: string,
  secretKey: string
): Promise<VerifyPaymentResponse> {
  try {
    const response = await axios.get(
      `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json' }, timeout: 10000 }
    );
    if (response.data.status === 'success' && response.data.data?.status === 'successful') {
      return {
        verified: true,
        amount: response.data.data.amount,
        currency: response.data.data.currency,
        status: response.data.data.status,
        transactionId: response.data.data.id,
      };
    }
    return { verified: false, status: response.data.data?.status ?? 'unknown' };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      return { verified: false, status: 'api_error', error: error.response?.data?.message ?? error.message };
    }
    return { verified: false, status: 'unknown_error', error: String(error) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// OPay verification — NEW
// ─────────────────────────────────────────────────────────────────────────────

async function verifyOpayPayment(
  reference: string,
  trustExpressPda: string,
  orderType: 'buy' | 'sell'
): Promise<VerifyPaymentResponse> {
  try {
    const opayCredInfo = orderType === 'sell'
      ? await getOpayCredentialsForSellOrder(trustExpressPda)
      : null; // buy orders use verifyTransfer, not verifyPayment

    if (!opayCredInfo) {
      return { verified: false, error: 'No OPay credentials found for this order' };
    }

    const result = await OpayService.verifyPayment(reference, opayCredInfo.credentials);
    return {
      verified: result.verified,
      amount: result.amount,
      currency: result.currency,
      status: result.status,
    };
  } catch (err) {
    return { verified: false, status: 'api_error', error: String(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Paystack verification — NEW
// ─────────────────────────────────────────────────────────────────────────────

async function verifyPaystackPayment(
  reference: string,
  trustExpressPda: string,
  orderType: 'buy' | 'sell'
): Promise<VerifyPaymentResponse> {
  try {
    const credInfo = orderType === 'sell'
      ? await getPaystackCredentialsForSellOrder(trustExpressPda)
      : null;
    if (!credInfo) return { verified: false, error: 'No Paystack credentials found for this order' };
    const result = await PaystackService.verifyPayment(reference, credInfo.credentials);
    return {
      verified: result.verified,
      amount: result.amount,
      currency: result.currency,
      status: result.status,
      transactionId: result.transactionId,
    };
  } catch (err) {
    return { verified: false, status: 'api_error', error: String(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/verify-payment
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // ── 1. Authenticate ───────────────────────────────────────────────────────
    const apiKey = request.headers.get('x-validator-key');
    const botVersion = request.headers.get('x-bot-version');
    const auth = await authenticateValidator(apiKey, botVersion);

    if (!auth.valid) {
      return noStoreJson(
        { verified: false, error: auth.error ?? 'Unauthorized' },
        { status: 401 }
      );
    }

    // ── 2. Parse params ───────────────────────────────────────────────────────
    const { searchParams } = new URL(request.url);
    const payoutReference = searchParams.get('payout_reference');
    const trustExpressPda = searchParams.get('trust_express_pda');
    const orderType = searchParams.get('order_type') as 'buy' | 'sell' | null;

    if (!payoutReference || !trustExpressPda || !orderType) {
      return noStoreJson(
        { verified: false, error: 'Missing required params: payout_reference, trust_express_pda, order_type' },
        { status: 400 }
      );
    }

    console.log(`🔍 Validator ${auth.validatorPubkey?.slice(0, 8)} verifying ${orderType} payment: ${payoutReference}`);

    // ── 3. Get credentials + processor ───────────────────────────────────────
    const credInfo = orderType === 'buy'
      ? await getCredentialsForBuyOrder(trustExpressPda)
      : await getCredentialsForSellOrder(trustExpressPda);

    if (!credInfo) {
      return noStoreJson(
        { verified: false, error: `No credentials found for this ${orderType} order` },
        { status: 404 }
      );
    }

    // ── 4. Dispatch to correct processor ─────────────────────────────────────
    // THIS IS THE ONLY NEW LOGIC — a simple if/else on processor
    let result: VerifyPaymentResponse;

    if (credInfo.processor === 'opay') {
      result = await verifyOpayPayment(payoutReference, trustExpressPda, orderType);
    } else if (credInfo.processor === 'paystack') {
      result = await verifyPaystackPayment(payoutReference, trustExpressPda, orderType);
    } else {
      // Default: Flutterwave (all existing rows)
      result = await verifyFlutterwavePayment(payoutReference, credInfo.secretKey);
    }

    console.log(`${result.verified ? '✅' : '❌'} [${credInfo.processor}] Payment ${payoutReference}: verified=${result.verified}`);

    // ── 5. Audit log ──────────────────────────────────────────────────────────
    await supabase.from('validator_verifications').insert({
      validator_pubkey: auth.validatorPubkey,
      payout_reference: payoutReference,
      trust_express_pda: trustExpressPda,
      order_type: orderType,
      verified: result.verified,
      amount: result.amount ?? null,
      currency: result.currency ?? null,
      created_at: new Date().toISOString(),
    }).then(({ error }) => {
      if (error) console.warn('⚠️ Failed to log validator verification:', error.message);
    });

    return noStoreJson(result, { status: 200 });
  } catch (error) {
    console.error('❌ verify-payment error:', error);
    return noStoreJson(
      { verified: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return noStoreJson({}, { status: 200 });
}