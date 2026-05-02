import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { decrypt } from '../../../../../discord-bot/lib/flutterwave-credentials-bot';
import { authenticateValidator } from '@/lib/validator-auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getSecretKeyForSellOrder(trustExpressPda: string): Promise<string | null> {
  const { data: link, error: linkError } = await supabase
    .from('sell_order_credentials')
    .select(`
      credential_id,
      wallet_address,
      seller_flutterwave_accounts (
        encrypted_secret_key,
        encryption_iv,
        encryption_auth_tag,
        is_active
      )
    `)
    .eq('trust_express_pda', trustExpressPda)
    .maybeSingle();

  if (linkError || !link) return null;

  const credData = Array.isArray(link.seller_flutterwave_accounts)
    ? link.seller_flutterwave_accounts[0]
    : link.seller_flutterwave_accounts;

  if (!credData || !credData.is_active) return null;
  return decrypt(credData.encrypted_secret_key, credData.encryption_iv, credData.encryption_auth_tag);
}

async function fetchFlutterwaveTransaction(txRef: string, secretKey: string): Promise<any | null> {
  try {
    const response = await axios.get(
      `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(txRef)}`,
      { headers: { Authorization: `Bearer ${secretKey}` }, timeout: 10000 }
    );
    if (response.data.status === 'success' && response.data.data?.status === 'successful') {
      return response.data.data;
    }
    return null;
  } catch { return null; }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const apiKey = request.headers.get('x-validator-key');
    const botVersion = request.headers.get('x-bot-version');
    const auth = await authenticateValidator(apiKey, botVersion);

    if (!auth.valid) {
      return NextResponse.json({ error: auth.error ?? 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json() as {
      payout_reference: string;
      trust_express_pda: string;
      taker: string;
      maker: string;
      token_amount: string;
      fiat_amount: string;
      currency: string;
      transaction_signature: string;
      mint_address: string;
    };

    const {
      payout_reference, trust_express_pda, taker, maker,
      token_amount, fiat_amount, currency, transaction_signature, mint_address,
    } = body;

    if (!payout_reference || !trust_express_pda || !taker || !transaction_signature) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { data: existing } = await supabase
      .from('receipts')
      .select('id')
      .eq('payout_reference', payout_reference)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ success: true, receipt_id: existing.id, idempotent: true });
    }

    const secretKey = await getSecretKeyForSellOrder(trust_express_pda);
    let flwRef = payout_reference;
    let paymentType = 'flutterwave_payment';

    if (secretKey) {
      const flwTx = await fetchFlutterwaveTransaction(payout_reference, secretKey);
      if (flwTx) {
        flwRef = flwTx.flw_ref ?? payout_reference;
        paymentType = flwTx.payment_type ?? 'flutterwave_payment';
      }
    }

    const tokenAmountBigInt = BigInt(token_amount ?? '0');
    const feeAmountBigInt = (tokenAmountBigInt * BigInt(5)) / BigInt(10000);
    const receiptId = uuidv4();

    const { error: insertError } = await supabase.from('receipts').insert({
      id: receiptId,
      payout_reference,
      transaction_signature,
      trust_express_address: trust_express_pda,
      taker_address: taker,
      maker_address: maker ?? null,
      token_amount: token_amount ?? null,
      fiat_amount: fiat_amount ?? null,
      currency,
      fee_amount: feeAmountBigInt.toString(),
      payout_method: paymentType,
      payout_details: { flw_ref: flwRef, payment_type: paymentType },
      flw_reference: flwRef,
      status: 'success',
      mint_address: mint_address ?? null,
      created_at: new Date().toISOString(),
    });

    if (insertError) {
      if (insertError.code === '23505') {
        return NextResponse.json({ success: true, idempotent: true });
      }
      return NextResponse.json({ success: false, error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, receipt_id: receiptId });

  } catch (error) {
    console.error('❌ generate-sell-receipt error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { status: 200 });
}