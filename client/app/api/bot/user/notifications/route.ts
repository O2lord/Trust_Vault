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

    const { data, error } = await supabaseAdmin
      .from('user_subscriptions')
      .select('notification_preferences')
      .eq('discord_user_id', discordUserId)
      .single();

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch preferences' },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Notification preferences fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch preferences' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const discordUserId = request.cookies.get('discord_user_id')?.value;

    if (!discordUserId) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { notification_preferences } = body;

    const { data, error } = await supabaseAdmin
      .from('user_subscriptions')
      .update({
        notification_preferences,
        updated_at: new Date().toISOString(),
      })
      .eq('discord_user_id', discordUserId)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: 'Failed to update preferences' },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Notification preferences update error:', error);
    return NextResponse.json(
      { error: 'Failed to update preferences' },
      { status: 500 }
    );
  }
}