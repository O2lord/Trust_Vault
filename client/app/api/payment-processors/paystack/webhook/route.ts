// app/api/payment-processors/paystack/webhook/route.ts
//
// Receives Paystack payment success callbacks for sell orders.
// Verifies HMAC-SHA512 signature using PAYSTACK_WEBHOOK_SECRET.
// Updates payment_links to 'completed' on charge.success.
// Stores raw event in paystack_webhook_events for audit.
// Add PAYSTACK_WEBHOOK_SECRET to your .env — copy from Paystack dashboard
// Settings → API Keys & Webhooks → Webhook URL + secret hash.

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function verifyPaystackSignature(payload: string, signature: string): boolean {
  const secret = process.env.PAYSTACK_WEBHOOK_SECRET;
  if (!secret) {
    console.warn('⚠️ PAYSTACK_WEBHOOK_SECRET not set — skipping verification (set this in production)');
    return true;
  }
  const hash = crypto.createHmac('sha512', secret).update(payload).digest('hex');
  return hash === signature;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get('x-paystack-signature') ?? '';

    if (!verifyPaystackSignature(rawBody, signature)) {
      console.warn('❌ [Paystack webhook] Invalid signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    let event: {
      event: string;
      data: { reference: string; status: string; amount: number; currency: string };
    };

    try {
      event = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const { event: eventType, data } = event;
    console.log(`📨 [Paystack webhook] ${eventType} | ref: ${data.reference}`);

    // Store raw event
    await supabase.from('paystack_webhook_events').insert({
      reference: data.reference,
      event_type: eventType,
      status: data.status,
      amount: data.amount,
      currency: data.currency,
      raw_payload: event,
      received_at: new Date().toISOString(),
      processed: false,
    });

    // charge.success → sell order payment confirmed
    if (eventType === 'charge.success' && data.status === 'success') {
      const { error: linkError } = await supabase
        .from('payment_links')
        .update({ status: 'completed' })
        .eq('payout_reference', data.reference);

      if (linkError) {
        console.error('⚠️ [Paystack webhook] Failed to update payment_links:', linkError.message);
      } else {
        console.log(`✅ [Paystack webhook] payment_links updated: ${data.reference}`);
      }

      await supabase
        .from('paystack_webhook_events')
        .update({ processed: true })
        .eq('reference', data.reference)
        .eq('event_type', eventType);
    }

    // transfer events → buy order payout status
    if (['transfer.success', 'transfer.failed', 'transfer.reversed'].includes(eventType)) {
      const newStatus = eventType === 'transfer.success' ? 'completed' : 'failed';
      console.log(`📋 [Paystack webhook] Transfer ${eventType}: ${data.reference} → ${newStatus}`);

      await supabase
        .from('buy_order_payouts')
        .update({ status: newStatus })
        .eq('payout_reference', data.reference);

      await supabase
        .from('paystack_webhook_events')
        .update({ processed: true })
        .eq('reference', data.reference)
        .eq('event_type', eventType);
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error('❌ [Paystack webhook] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}