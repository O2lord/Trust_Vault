// app/api/payment-processors/paystack/seller-credentials/status/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { decrypt } from '../../../../../../../discord-bot/lib/flutterwave-credentials-bot';
import PaystackService from '../../../../../../../discord-bot/services/paystackService';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const credentialId = searchParams.get('credentialId');
    const walletAddress = searchParams.get('walletAddress');

    if (!credentialId || !walletAddress) {
      return NextResponse.json({ error: 'Missing credentialId or walletAddress' }, { status: 400 });
    }

    const { data: cred, error } = await supabaseAdmin
      .from('seller_flutterwave_accounts')
      .select('encrypted_secret_key, encryption_iv, encryption_auth_tag, is_active')
      .eq('id', credentialId)
      .eq('wallet_address', walletAddress)
      .eq('processor', 'paystack')
      .single();

    if (error || !cred) return NextResponse.json({ error: 'Credential not found' }, { status: 404 });

    const secretKey = decrypt(cred.encrypted_secret_key, cred.encryption_iv, cred.encryption_auth_tag);
    const result = await PaystackService.validateCredentials({ secretKey });

    // Update last_verified timestamp
    await supabaseAdmin
      .from('seller_flutterwave_accounts')
      .update({ last_verified: new Date().toISOString() })
      .eq('id', credentialId);

    return NextResponse.json({
      valid: result.valid,
      balance: result.balance,
      currency: result.currency,
      error: result.error,
    });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}