import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { trustExpressPda, credentialId, walletAddress } = body;

    if (!trustExpressPda || !credentialId || !walletAddress) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Verify the credential belongs to this wallet
    const { data: credential } = await supabaseAdmin
      .from('seller_flutterwave_accounts')
      .select('id')
      .eq('id', credentialId)
      .eq('wallet_address', walletAddress)
      .eq('is_active', true)
      .single();

    if (!credential) {
      return NextResponse.json(
        { error: 'Invalid or inactive credential' },
        { status: 400 }
      );
    }

    // Insert or update the link
    const { data, error } = await supabaseAdmin
      .from('sell_order_credentials')
      .upsert({
        trust_express_pda: trustExpressPda,
        credential_id: credentialId,
        wallet_address: walletAddress,
        created_at: new Date().toISOString(),
      }, {
        onConflict: 'trust_express_pda'
      })
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: 'Failed to link credential' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('Error linking seller credential:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}