// app/api/payment-processors/opay/buyer-credentials/list/route.ts
//
// Lists all OPay buyer credentials for a wallet.
// Mirrors: app/api/flutterwave/buyer-credentials/list/route.ts
// Filters by processor = 'opay' so Flutterwave rows are never returned.

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

    const { data, error } = await supabaseAdmin
      .from('buyer_flutterwave_credentials')
      .select('id, label, created_at, is_active, last_verified, processor, processor_account_id')
      .eq('wallet_address', walletAddress)
      .eq('processor', 'opay')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[OPay] DB error listing buyer credentials:', error);
      return NextResponse.json(
        { error: 'Failed to fetch credentials' },
        { status: 500 }
      );
    }

    return NextResponse.json({ credentials: data ?? [] });
  } catch (error) {
    console.error('[OPay] Error listing buyer credentials:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}