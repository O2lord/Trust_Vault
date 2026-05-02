// app/api/payment-processors/paystack/seller-credentials/toggle/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { verifySignature, validateMessageTimestamp } from '@/lib/solana-auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { credentialId, walletAddress, signature, message } = body;

    if (!credentialId || !walletAddress || !signature || !message) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    if (!validateMessageTimestamp(message)) {
      return NextResponse.json({ error: 'Message timestamp is too old or invalid' }, { status: 400 });
    }
    const isValid = await verifySignature(walletAddress, signature, message);
    if (!isValid) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });

    const { data: existing } = await supabaseAdmin
      .from('seller_flutterwave_accounts')
      .select('is_active')
      .eq('id', credentialId)
      .eq('wallet_address', walletAddress)
      .eq('processor', 'paystack')
      .single();

    if (!existing) return NextResponse.json({ error: 'Credential not found' }, { status: 404 });

    const { data, error } = await supabaseAdmin
      .from('seller_flutterwave_accounts')
      .update({ is_active: !existing.is_active })
      .eq('id', credentialId)
      .eq('wallet_address', walletAddress)
      .select()
      .single();

    if (error) return NextResponse.json({ error: 'Failed to toggle credential' }, { status: 500 });
    return NextResponse.json({ success: true, is_active: data.is_active });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}