// app/api/notifications/payment-request/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface NotificationBody {
  type: 'fiat_request_created' | 'fiat_request_completed' | 'fiat_request_rejected' | 'fiat_request_cancelled' |
        'token_request_created' | 'token_request_completed' | 'token_request_rejected' | 'token_request_cancelled';
  requestId: string;
  recipientWallet: string;
  senderWallet: string;
  amount?: number;
  currency?: string;
  tokenAmount?: number;
  tokenMint?: string;
  note?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body: NotificationBody = await req.json();

    // Get user's notification preferences
    const { data: userPrefs } = await supabase
      .from('user_subscriptions')
      .select('*')
      .eq('wallet_address', body.recipientWallet)
      .single();

    const notifications: Promise<unknown>[] = [];

    // In-app notification
    const inAppNotification = supabase.from('notifications').insert({
      user_wallet: body.recipientWallet,
      type: 'payment_request',
      title: getNotificationTitle(body.type),
      message: getNotificationMessage(body),
      data: { requestId: body.requestId },
      read: false,
    });
    
    notifications.push(Promise.resolve(inAppNotification));

    // Discord notification
    if (userPrefs?.discord_channel_id) {
      notifications.push(
        sendDiscordNotification(userPrefs.discord_channel_id, body)
      );
    }

    // Email notification
    if (userPrefs?.email) {
      notifications.push(
        sendEmailNotification(userPrefs.email, body)
      );
    }

    await Promise.allSettled(notifications);

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error sending notification:', error);
    return NextResponse.json(
      { error: 'Failed to send notification' },
      { status: 500 }
    );
  }
}

function getNotificationTitle(type: string): string {
  switch (type) {
    case 'fiat_request_created':
      return 'New Fiat Payment Request';
    case 'fiat_request_completed':
      return 'Fiat Payment Request Completed';
    case 'fiat_request_rejected':
      return 'Fiat Payment Request Rejected';
    case 'fiat_request_cancelled':
      return 'Fiat Payment Request Cancelled';
    case 'token_request_created':
      return 'New Token Payment Request';
    case 'token_request_completed':
      return 'Token Payment Request Completed';
    case 'token_request_rejected':
      return 'Token Payment Request Rejected';
    case 'token_request_cancelled':
      return 'Token Payment Request Cancelled';
    default:
      return 'Payment Request Update';
  }
}

function getNotificationMessage(body: NotificationBody): string {
  const truncatedWallet = `${body.senderWallet.slice(0, 4)}...${body.senderWallet.slice(-4)}`;
  
  switch (body.type) {
    case 'fiat_request_created':
      return `${truncatedWallet} is requesting ${body.amount} ${body.currency}${body.note ? `: "${body.note}"` : ''}`;
    case 'fiat_request_completed':
      return `Your request for ${body.amount} ${body.currency} has been fulfilled by ${truncatedWallet}`;
    case 'fiat_request_rejected':
      return `${truncatedWallet} rejected your request for ${body.amount} ${body.currency}`;
    case 'fiat_request_cancelled':
      return `${truncatedWallet} cancelled their request for ${body.amount} ${body.currency}`;
    case 'token_request_created':
      return `${truncatedWallet} is requesting ${body.tokenAmount} tokens${body.note ? `: "${body.note}"` : ''}`;
    case 'token_request_completed':
      return `Your token request for ${body.tokenAmount} has been fulfilled by ${truncatedWallet}`;
    case 'token_request_rejected':
      return `${truncatedWallet} rejected your token request for ${body.tokenAmount}`;
    case 'token_request_cancelled':
      return `${truncatedWallet} cancelled their token request for ${body.tokenAmount}`;
    default:
      return 'Payment request update';
  }
}

async function sendDiscordNotification(channelId: string, body: NotificationBody): Promise<void> {
  // Implement Discord webhook logic
  // Similar to your existing notification system
 
}

async function sendEmailNotification(email: string, body: NotificationBody): Promise<void> {
  // Implement email sending logic
 
}