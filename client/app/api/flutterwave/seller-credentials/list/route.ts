// api/flutterwave/seller-credentials/list/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const walletAddress = searchParams.get('walletAddress');

    if (!walletAddress) {
      return NextResponse.json(
        { error: 'Missing wallet address' },
        { status: 400 }
      );
    }

    // Explicitly exclude OPay rows — the seller_flutterwave_accounts table is
    // shared between processors. Old Flutterwave rows have processor = NULL,
    // new ones have processor = 'flutterwave'. Either way, never return 'opay'.
    const { data, error } = await supabaseAdmin
      .from('seller_flutterwave_accounts')
      .select('id, label, created_at, is_active, last_verified, flutterwave_subaccount_id')
      .eq('wallet_address', walletAddress)
      .or('processor.is.null,processor.eq.flutterwave')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch credentials' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      credentials: data || [],
    });
  } catch (error) {
    console.error('Error listing seller credentials:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}