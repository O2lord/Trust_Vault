// app/api/payment-processors/opay/buyer-credentials/delete/route.ts
//
// Permanently deletes an OPay buyer credential.
// Mirrors: app/api/flutterwave/buyer-credentials/delete/route.ts
// Guards against deletion when the credential is linked to buy orders.

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
      return NextResponse.json(
        { error: 'Missing required parameters: credentialId, walletAddress, signature, message' },
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

    // Block deletion if this credential is linked to any buy orders
    const { data: buyOrders } = await supabaseAdmin
      .from('buy_order_credentials')
      .select('trust_express_pda')
      .eq('credential_id', credentialId)
      .limit(1);

    if (buyOrders && buyOrders.length > 0) {
      return NextResponse.json(
        {
          error: 'Cannot delete a credential that is linked to active buy orders. Deactivate it instead.',
          buyOrderCount: buyOrders.length,
        },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from('buyer_flutterwave_credentials')
      .delete()
      .eq('id', credentialId)
      .eq('wallet_address', walletAddress)
      .eq('processor', 'opay');

    if (error) {
      console.error('[OPay] DB error deleting buyer credential:', error);
      return NextResponse.json({ error: 'Failed to delete credential' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'OPay buyer credential deleted successfully',
    });
  } catch (error) {
    console.error('[OPay] Error deleting buyer credential:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}