import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';

export async function POST(request: NextRequest) {
  try {
    const { discordUserId } = await request.json();

    if (!discordUserId) {
      return NextResponse.json(
        { error: 'Discord user ID is required' },
        { status: 400 }
      );
    }

   

    // Get user subscription to get Discord user info
    const { data: subscriptions, error } = await supabaseAdmin
      .from('user_subscriptions')
      .select('*')
      .eq('discord_user_id', discordUserId);

    if (error || !subscriptions || subscriptions.length === 0) {
      console.error('❌ User subscription not found:', error);
      return NextResponse.json(
        { error: 'User subscription not found' },
        { status: 404 }
      );
    }
    const subscription = subscriptions[0];

    // Create welcome message embed
    const welcomeEmbed = {
      title: "🎉 Welcome to Trust Vault Notifications!",
      description: "Your Discord account has been successfully connected to Trust Vault. You'll now receive real-time notifications for all your transactions.",
      color: 0x00ff00, 
      fields: [
        {
          name: "✅ What's Connected",
          value: `**Wallet:** \`${subscription.wallet_address.substring(0, 8)}...${subscription.wallet_address.substring(-8)}\`\n**Discord:** ${subscription.discord_user.username}`,
          inline: false
        },
        {
          name: "🔔 Notifications Enabled",
          value: "You'll receive notifications for:\n• Trust Vault creation\n• Token reservations\n• Payment confirmations\n• Disputes and resolutions\n• And more!",
          inline: false
        },
        {
          name: "⚙️ Manage Settings",
          value: "Visit the notification settings page to customize which events you want to be notified about.",
          inline: false
        },
        {
          name: "❓ Need Help?",
          value: "If you have any questions or need support, please contact our team.",
          inline: false
        }
      ],
      timestamp: new Date().toISOString(),
      footer: {
        text: "Trust Vault Notification System"
      }
    };

    // Try to send DM using Discord REST API
    const discordResponse = await fetch(`https://discord.com/api/v10/users/@me/channels`, {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${process.env.DISCORD_BOT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipient_id: discordUserId
      })
    });

    if (!discordResponse.ok) {
      const errorData = await discordResponse.json();
      console.error('❌ Failed to create DM channel:', errorData);
      
      // Log the attempt but don't fail the registration
      await supabaseAdmin.from('notification_logs').insert({
        user_subscription_id: subscription.id,
        event_type: 'welcome_message',
        notification_sent: false,
        error_message: `Failed to create DM channel: ${errorData.message || 'Unknown error'}`
      });

      return NextResponse.json({
        success: true,
        message: 'Registration successful, but welcome message could not be sent. User may have DMs disabled.',
        dmSent: false
      });
    }

    const dmChannel = await discordResponse.json();

    // Send the welcome message
    const messageResponse = await fetch(`https://discord.com/api/v10/channels/${dmChannel.id}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${process.env.DISCORD_BOT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        embeds: [welcomeEmbed]
      })
    });

    if (messageResponse.ok) {
     
      
      // Log successful notification
      await supabaseAdmin.from('notification_logs').insert({
        user_subscription_id: subscription.id,
        event_type: 'welcome_message',
        notification_sent: true
      });

      return NextResponse.json({
        success: true,
        message: 'Welcome message sent successfully',
        dmSent: true
      });
    } else {
      const errorData = await messageResponse.json();
      console.error('❌ Failed to send welcome message:', errorData);
      
      // Log failed notification
      await supabaseAdmin.from('notification_logs').insert({
        user_subscription_id: subscription.id,
        event_type: 'welcome_message',
        notification_sent: false,
        error_message: `Failed to send message: ${errorData.message || 'Unknown error'}`
      });

      return NextResponse.json({
        success: true,
        message: 'Registration successful, but welcome message could not be sent. User may have DMs disabled.',
        dmSent: false
      });
    }

  } catch (error) {
    console.error('❌ Error in send-welcome route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}