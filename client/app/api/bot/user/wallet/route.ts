import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';

export async function GET(request: NextRequest) {
  try {
    const discordUserId = request.cookies.get('discord_user_id')?.value;

    if (!discordUserId) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Get all wallet addresses for this user
    const { data, error } = await supabaseAdmin
      .from('user_subscriptions')
      .select('wallet_address')
      .eq('discord_user_id', discordUserId);

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch wallets' },
        { status: 500 }
      );
    }

    const wallets = data?.map(item => item.wallet_address) || [];

    return NextResponse.json({ wallets });
  } catch (error) {
    console.error('Wallets fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch wallets' },
      { status: 500 }
    );
  }
}