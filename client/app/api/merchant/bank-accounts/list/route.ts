// api/merchant/bank-accounts/list/route.ts
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
      .from('merchant_bank_accounts')
      .select('id, label, bank_name, bank_code, account_number, account_name, currency, is_default, created_at')
      .eq('wallet_address', walletAddress)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch bank accounts' },
        { status: 500 }
      );
    }

    return NextResponse.json({ accounts: data || [] });
  } catch (error) {
    console.error('Error listing merchant bank accounts:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}