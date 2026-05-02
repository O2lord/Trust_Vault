// app/api/payment-processors/opay/seller-credentials/link/route.ts
//
// Links a sell order PDA → OPay seller credential.
// Upserts into the existing sell_order_credentials table (no new table needed).
// Requires wallet signature for auth.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { verifySignature, validateMessageTimestamp } from '@/lib/solana-auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { trustExpressPda, credentialId, walletAddress, signature, message } = body;

    if (!trustExpressPda || !credentialId || !walletAddress || !signature || !message) {
      return NextResponse.json(
        { error: 'Missing required fields: trustExpressPda, credentialId, walletAddress, signature, message' },
        { status: 400 }
      );
    }

    if (!validateMessageTimestamp(message)) {
      return NextResponse.json(
        { error: 'Message timestamp is too old or invalid' },
        { status: 400 }
      );
    }

    const isValid = await verifySignature(walletAddress, signature, message);
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // Verify the credential belongs to this wallet, is OPay, and is active
    const { data: credential } = await supabaseAdmin
      .from('seller_flutterwave_accounts')
      .select('id')
      .eq('id', credentialId)
      .eq('wallet_address', walletAddress)
      .eq('processor', 'opay')
      .eq('is_active', true)
      .single();

    if (!credential) {
      return NextResponse.json(
        { error: 'Invalid or inactive OPay seller credential' },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('sell_order_credentials')
      .upsert(
        {
          trust_express_pda: trustExpressPda,
          credential_id: credentialId,
          wallet_address: walletAddress,
          created_at: new Date().toISOString(),
        },
        { onConflict: 'trust_express_pda' }
      )
      .select()
      .single();

    if (error) {
      console.error('[OPay] DB error linking seller credential:', error);
      return NextResponse.json({ error: 'Failed to link credential' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[OPay] Error linking seller credential:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}