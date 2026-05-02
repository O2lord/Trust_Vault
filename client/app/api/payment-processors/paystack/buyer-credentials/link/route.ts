// app/api/payment-processors/paystack/buyer-credentials/link/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { verifySignature, validateMessageTimestamp } from '@/lib/solana-auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { trustExpressPda, credentialId, walletAddress, signature, message } = body;

    if (!trustExpressPda || !credentialId || !walletAddress || !signature || !message) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    if (!validateMessageTimestamp(message)) {
      return NextResponse.json({ error: 'Message timestamp is too old or invalid' }, { status: 400 });
    }
    const isValid = await verifySignature(walletAddress, signature, message);
    if (!isValid) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });

    const { data: credential } = await supabaseAdmin
      .from('buyer_flutterwave_credentials')
      .select('id')
      .eq('id', credentialId)
      .eq('wallet_address', walletAddress)
      .eq('processor', 'paystack')
      .eq('is_active', true)
      .single();

    if (!credential) {
      return NextResponse.json({ error: 'Invalid or inactive Paystack credential' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('buy_order_credentials')
      .upsert(
        { trust_express_pda: trustExpressPda, credential_id: credentialId, wallet_address: walletAddress, created_at: new Date().toISOString() },
        { onConflict: 'trust_express_pda' }
      )
      .select()
      .single();

    if (error) return NextResponse.json({ error: 'Failed to link credential' }, { status: 500 });
    return NextResponse.json({ success: true, data });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}