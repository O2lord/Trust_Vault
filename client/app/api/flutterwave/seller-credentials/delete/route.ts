// api/flutterwave/seller-credentials/delete/route.ts
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
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // Validate message timestamp
    if (!validateMessageTimestamp(message)) {
      return NextResponse.json(
        { error: 'Message timestamp is too old or invalid' },
        { status: 400 }
      );
    }

    // Verify the signature
    const isValid = await verifySignature(walletAddress, signature, message);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      );
    }

    // Check if credential is being used by any sell orders
    const { data: sellOrders } = await supabaseAdmin
      .from('sell_order_credentials')
      .select('trust_express_pda')
      .eq('credential_id', credentialId)
      .limit(1);

    if (sellOrders && sellOrders.length > 0) {
      return NextResponse.json(
        { 
          error: 'Cannot delete credential that is being used by active sell orders',
          sellOrderCount: sellOrders.length 
        },
        { status: 400 }
      );
    }

    // Delete the credential
    const { error } = await supabaseAdmin
      .from('seller_flutterwave_accounts')
      .delete()
      .eq('id', credentialId)
      .eq('wallet_address', walletAddress);

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: 'Failed to delete credential' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Seller credential deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting seller credential:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}