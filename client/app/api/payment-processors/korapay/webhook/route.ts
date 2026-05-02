// app/api/payment-processors/korapay/webhook/route.ts
//
// Receives Korapay payment callbacks for sell orders and transfer updates.
// Verifies HMAC-SHA256 signature using KORAPAY_WEBHOOK_SECRET.
// Add KORAPAY_WEBHOOK_SECRET to your .env — copy from Korapay dashboard
// Settings → API Keys → Webhook Secret.

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function verifyKorapaySignature(payload: string, signature: string): boolean {
  const secret = process.env.KORAPAY_WEBHOOK_SECRET;
  if (!secret) {
    console.warn('⚠️ KORAPAY_WEBHOOK_SECRET not set — skipping verification (set this in production)');
    return true;
  }
  const hash = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return hash === signature;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get('x-korapay-signature') ?? '';

    if (!verifyKorapaySignature(rawBody, signature)) {
      console.warn('❌ [Korapay webhook] Invalid signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    let event: {
      event: string;
      data: {
        reference: string;
        status: string;
        amount: number;
        currency: string;
        fee?: number;
      };
    };

    try {
      event = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const { event: eventType, data } = event;
    console.log(`📨 [Korapay webhook] ${eventType} | ref: ${data.reference}`);

    // Store raw event for audit
    await supabase.from('korapay_webhook_events').insert({
      reference:   data.reference,
      event_type:  eventType,
      status:      data.status,
      amount:      data.amount,
      currency:    data.currency,
      raw_payload: event,
      received_at: new Date().toISOString(),
      processed:   false,
    }).throwOnError().catch(() => {
      // Table may not exist yet — log and continue
      console.warn('⚠️ [Korapay webhook] Could not store event (table may not exist)');
    });

    // charge.success → sell order payment confirmed
    if (eventType === 'charge.success' && data.status === 'success') {
      const { error: linkError } = await supabase
        .from('payment_links')
        .update({ status: 'completed' })
        .eq('payout_reference', data.reference);

      if (linkError) {
        console.error('⚠️ [Korapay webhook] Failed to update payment_links:', linkError.message);
      } else {
        console.log(`✅ [Korapay webhook] payment_links updated: ${data.reference}`);
      }
    }

    // transfer events → buy order payout status
    if (['transfer.success', 'transfer.failed'].includes(eventType)) {
      const newStatus = eventType === 'transfer.success' ? 'completed' : 'failed';
      console.log(`📋 [Korapay webhook] Transfer ${eventType}: ${data.reference} → ${newStatus}`);

      await supabase
        .from('buy_order_payouts')
        .update({ status: newStatus })
        .eq('payout_reference', data.reference);
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error('❌ [Korapay webhook] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}