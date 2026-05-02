// app/api/payment-processors/opay/buyer-credentials/toggle/route.ts
//
// Activates or deactivates an OPay buyer credential.
// Requires wallet signature — same auth pattern as store.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { verifySignature, validateMessageTimestamp } from '@/lib/solana-auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { credentialId, walletAddress, isActive, signature, message } = body;

    if (!credentialId || !walletAddress || isActive === undefined || !signature || !message) {
      return NextResponse.json(
        { error: 'Missing required fields: credentialId, walletAddress, isActive, signature, message' },
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

    // Confirm ownership and processor before toggling
    const { data: credential } = await supabaseAdmin
      .from('buyer_flutterwave_credentials')
      .select('id')
      .eq('id', credentialId)
      .eq('wallet_address', walletAddress)
      .eq('processor', 'opay')
      .single();

    if (!credential) {
      return NextResponse.json(
        { error: 'Credential not found or does not belong to this wallet' },
        { status: 404 }
      );
    }

    const { error } = await supabaseAdmin
      .from('buyer_flutterwave_credentials')
      .update({
        is_active: isActive,
        last_verified: new Date().toISOString(),
      })
      .eq('id', credentialId)
      .eq('wallet_address', walletAddress);

    if (error) {
      console.error('[OPay] DB error toggling buyer credential:', error);
      return NextResponse.json({ error: 'Failed to update credential' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      credentialId,
      isActive,
      message: `Credential ${isActive ? 'activated' : 'deactivated'} successfully`,
    });
  } catch (error) {
    console.error('[OPay] Error toggling buyer credential:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}