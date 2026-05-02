// app/api/payment-processors/paystack/seller-credentials/delete/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { verifySignature, validateMessageTimestamp } from '@/lib/solana-auth';

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const credentialId = searchParams.get('credentialId');
    const walletAddress = searchParams.get('walletAddress');
    const signature = searchParams.get('signature');
    const message = searchParams.get('message');

    if (!credentialId || !walletAddress || !signature || !message) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    if (!validateMessageTimestamp(message)) {
      return NextResponse.json({ error: 'Message timestamp is too old or invalid' }, { status: 400 });
    }
    const isValid = await verifySignature(walletAddress, signature, message);
    if (!isValid) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });

    // Block if linked to active sell orders
    const { data: linked } = await supabaseAdmin
      .from('sell_order_credentials')
      .select('trust_express_pda')
      .eq('credential_id', credentialId)
      .limit(1);

    if (linked && linked.length > 0) {
      return NextResponse.json({ error: 'Cannot delete: credential is linked to active sell orders' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('seller_flutterwave_accounts')
      .delete()
      .eq('id', credentialId)
      .eq('wallet_address', walletAddress)
      .eq('processor', 'paystack');

    if (error) return NextResponse.json({ error: 'Failed to delete credential' }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}