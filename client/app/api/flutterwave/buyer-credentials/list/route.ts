// api/flutterwave/buyer-credentials/list/route.ts
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

    // Fetch credentials (without the actual secret keys)
    // Filter to flutterwave only — OPay credentials are fetched by their own endpoint
    const { data, error } = await supabaseAdmin
      .from('buyer_flutterwave_credentials')
      .select('id, label, created_at, is_active, last_verified')
      .eq('wallet_address', walletAddress)
      .or('processor.eq.flutterwave,processor.is.null')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch credentials' },
        { status: 500 }
      );
    }

    // Deduplicate by id in case of any duplicates in the DB result
    const seen = new Set<string>();
    const unique = (data || []).filter((c) => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });

    return NextResponse.json({
      credentials: unique,
    });
  } catch (error) {
    console.error('Error listing buyer credentials:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}