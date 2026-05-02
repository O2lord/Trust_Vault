// app/api/payment-processors/korapay/seller-credentials/list/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const walletAddress = searchParams.get('walletAddress');
  if (!walletAddress) return NextResponse.json({ error: 'Missing wallet address' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('seller_flutterwave_accounts')
    .select('id, label, created_at, is_active, last_verified, processor, processor_account_id')
    .eq('wallet_address', walletAddress)
    .eq('processor', 'korapay')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: 'Failed to fetch credentials' }, { status: 500 });
  return NextResponse.json({ credentials: data ?? [] });
}