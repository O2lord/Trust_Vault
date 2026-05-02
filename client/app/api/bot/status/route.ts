import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';

export async function GET(request: NextRequest) {
  try {
    // Get bot status from database
    const { data, error } = await supabaseAdmin
      .from('bot_status')
      .select('*')
      .eq('bot_id', 'trust_vault_bot')
      .single();

    if (error || !data) {
      return NextResponse.json({
        online: false,
        last_seen: new Date().toISOString(),
        events_processed: 0,
        notifications_sent: 0,
      });
    }

    // Check if bot is considered online (last seen within 5 minutes)
    const lastSeen = new Date(data.last_seen);
    const now = new Date();
    const isOnline = (now.getTime() - lastSeen.getTime()) < 5 * 60 * 1000;

    return NextResponse.json({
      online: isOnline,
      last_seen: data.last_seen,
      events_processed: data.events_processed || 0,
      notifications_sent: data.notifications_sent || 0,
    });
  } catch (error) {
    console.error('Bot status fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch bot status' },
      { status: 500 }
    );
  }
}