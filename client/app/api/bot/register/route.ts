import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { webhook_url } = body;

    if (!webhook_url) {
      return NextResponse.json(
        { error: 'Webhook URL is required' },
        { status: 400 }
      );
    }

    // Store webhook URL for the bot
    const { data, error } = await supabaseAdmin
      .from('bot_webhooks')
      .upsert({
        id: 'trust_vault_bot',
        webhook_url,
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: 'Failed to register webhook' },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Bot registration error:', error);
    return NextResponse.json(
      { error: 'Failed to register bot' },
      { status: 500 }
    );
  }
}