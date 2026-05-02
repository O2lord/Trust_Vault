import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const walletAddress = searchParams.get('walletAddress');

    if (!walletAddress) {
      return NextResponse.json(
        { error: 'Wallet address required' },
        { status: 400 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data, error } = await supabase
      .from('seller_flutterwave_accounts')
      .select('id, is_active')
      .eq('wallet_address', walletAddress)
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      console.error('Error checking credentials:', error);
      return NextResponse.json(
        { hasCredentials: false },
        { status: 200 }
      );
    }

    return NextResponse.json({
      hasCredentials: !!data,
      credentialId: data?.id || null,
    });

  } catch (error) {
    console.error('Error in check endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}