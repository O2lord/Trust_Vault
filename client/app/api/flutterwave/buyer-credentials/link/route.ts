// api/flutterwave/buyer-credentials/link/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { verifySignature, validateMessageTimestamp } from '@/lib/solana-auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { trustExpressPda, credentialId, walletAddress, signature, message } = body;

    console.log('🔗 Linking buyer credential to order:', {
      trustExpressPda,
      credentialId,
      walletAddress,
      hasSignature: !!signature,
      hasMessage: !!message,
    });

    // Validate required fields
    if (!trustExpressPda || !credentialId || !walletAddress) {
      console.error('❌ Missing required fields:', { trustExpressPda, credentialId, walletAddress });
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // ✅ ADD AUTHENTICATION: Verify signature and message timestamp
    if (!signature || !message) {
      console.error('❌ Missing signature or message for authentication');
      return NextResponse.json(
        { error: 'Missing authentication credentials' },
        { status: 401 }
      );
    }

    // Validate message timestamp (prevent replay attacks)
    if (!validateMessageTimestamp(message)) {
      console.error('❌ Message timestamp is too old or invalid');
      return NextResponse.json(
        { error: 'Message timestamp is too old or invalid' },
        { status: 400 }
      );
    }

    // Verify the signature
    const isValid = await verifySignature(walletAddress, signature, message);
    if (!isValid) {
      console.error('❌ Invalid signature for wallet:', walletAddress);
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      );
    }

    console.log('✅ Authentication successful');

    // Verify the credential belongs to this wallet and is active
    const { data: credential, error: credError } = await supabaseAdmin
      .from('buyer_flutterwave_credentials')
      .select('id, is_active')
      .eq('id', credentialId)
      .eq('wallet_address', walletAddress)
      .single();

    if (credError || !credential) {
      console.error('❌ Credential not found:', credError);
      return NextResponse.json(
        { error: 'Credential not found for this wallet' },
        { status: 404 }
      );
    }

    if (!credential.is_active) {
      console.error('❌ Credential is inactive:', credentialId);
      return NextResponse.json(
        { error: 'Cannot link inactive credential' },
        { status: 400 }
      );
    }

    console.log('✅ Credential validated:', credential);

    // Insert or update the link in buy_order_credentials table
    const { data, error } = await supabaseAdmin
      .from('buy_order_credentials')
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
      console.error('❌ Database error during upsert:', error);
      return NextResponse.json(
        { error: 'Failed to link credential', details: error.message },
        { status: 500 }
      );
    }

    console.log('✅ Successfully linked credential to buy order:', data);

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('❌ Error linking buyer credential:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}