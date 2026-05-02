import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state'); // This contains the wallet address

    if (!code || !state) {
      const redirectUrl = new URL('/notification-setup', request.url);
      redirectUrl.searchParams.set('discord_error', 'missing_params');
      return NextResponse.redirect(redirectUrl);
    }

    // Exchange code for access token
    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID!,
        client_secret: process.env.DISCORD_CLIENT_SECRET!,
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.DISCORD_REDIRECT_URI!,
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error('Failed to exchange code for token');
    }

    const tokenData = await tokenResponse.json();

    // Get user info from Discord
    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    if (!userResponse.ok) {
      throw new Error('Failed to fetch user info');
    }

    const discordUser = await userResponse.json();

    // Store user in database with ALL notifications enabled by default
    const { data, error } = await supabaseAdmin
      .from('user_subscriptions')
      .upsert({
        discord_user_id: discordUser.id,
        wallet_address: state, // wallet address from state
        discord_user: discordUser,
        notification_preferences: {
          trust_vault_created: true,
          trust_vault_closed: true,        
          payment_confirmed: true,
          payment_sent: true,
          reservation_cancelled: true,
          withdrawal_event: true,
          tokens_reserved: true,
          dispute_created: true,
          dispute_resolved: true,
          buy_order_created: true,
          buy_order_reserved: true,
          buy_order_cancelled: true,
          buy_order_reduced: true,
          buyer_payment_sent: true,
          price_updated: true,
          seller_confirms_payment: true,
          //TRUST EXPRESS
          express_buy_order_created: true,
          instant_payment_reserved: true,
          express_buy_order_cancelled: true,
          express_buy_order_reduced: true,
          instant_payment_payout_result: true,
          express_price_updated: true,
        },
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'discord_user_id'
      })
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      const redirectUrl = new URL('/notification-setup', request.url);
      redirectUrl.searchParams.set('discord_error', 'database_error');
      return NextResponse.redirect(redirectUrl);
    }

    // Create session and redirect back to notification page with success
    const redirectUrl = new URL('/notification-setup', request.url);

    // Try to send welcome message (non-blocking)
    try {
     
      
      const welcomeResponse = await fetch(new URL('/api/bot/user/notifications/send-welcome', request.url).toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ discordUserId: discordUser.id }),
      });

      if (welcomeResponse.ok) {
        const welcomeResult = await welcomeResponse.json();
       
        
        if (!welcomeResult.dmSent) {
          console.error('❌ Welcome DM was not sent');
          redirectUrl.searchParams.set('welcome_dm_failed', 'true');
        }
      } else {
        console.error('❌ Welcome message failed with status:', welcomeResponse.status);
        redirectUrl.searchParams.set('welcome_dm_failed', 'true');
      }
    } catch (welcomeError) {
      console.error('❌ Error initiating welcome message send:', welcomeError);
      // Don't fail the entire registration process if welcome message fails
    }

    redirectUrl.searchParams.set('discord_success', 'connected');
    
    const response = NextResponse.redirect(redirectUrl);
    response.cookies.set('discord_user_id', discordUser.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    return response;
  } catch (error) {
    console.error('Discord OAuth callback error:', error);
    const redirectUrl = new URL('/notification-setup', request.url);
    redirectUrl.searchParams.set('discord_error', 'oauth_failed');
    return NextResponse.redirect(redirectUrl);
  }
}