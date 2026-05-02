import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// Verify Flutterwave webhook signature
function verifyWebhookSignature(payload: string, signature: string): boolean {
  const secretHash = process.env.FLUTTERWAVE_SECRET_HASH;
  if (!secretHash) {
    console.error('FLUTTERWAVE_SECRET_HASH not configured');
    return false;
  }

  const hash = crypto
    .createHmac('sha256', secretHash)
    .update(payload)
    .digest('hex');

  return hash === signature;
}

export async function POST(request: NextRequest) {
  try {
    const signature = request.headers.get('verif-hash');
    const rawBody = await request.text();
    
    // Verify webhook signature
    if (!signature || !verifyWebhookSignature(rawBody, signature)) {
      console.error('Invalid webhook signature');
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      );
    }

    const webhookData = JSON.parse(rawBody);
    

    // Only process successful charge completions
    if (webhookData.event === 'charge.completed' && webhookData.data.status === 'successful') {
      const { tx_ref, amount, currency, customer } = webhookData.data;

      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      // Update payment link status
      const { data: paymentLink, error: fetchError } = await supabase
        .from('payment_links')
        .select('*')
        .eq('payout_reference', tx_ref)
        .single();

      if (fetchError || !paymentLink) {
        console.error('Payment link not found:', tx_ref);
        return NextResponse.json({ status: 'ignored' }, { status: 200 });
      }

      // Update status to completed
      await supabase
        .from('payment_links')
        .update({ 
          status: 'completed',
          updated_at: new Date().toISOString()
        })
        .eq('payout_reference', tx_ref);

      // Store webhook event for processing by bot
      await supabase
        .from('webhook_events')
        .insert({
          event_type: 'payment_completed',
          payout_reference: tx_ref,
          trust_express_address: paymentLink.trust_express_address,
          taker_address: paymentLink.buyer_address,
          maker_address: paymentLink.seller_address,
          amount: amount,
          currency: currency,
          transaction_signature: paymentLink.transaction_signature,  
          payload: webhookData,
          processed: false,
          created_at: new Date().toISOString(),
        });

      

      // Return success to Flutterwave
      return NextResponse.json({ status: 'success' }, { status: 200 });
    }

    return NextResponse.json({ status: 'ignored' }, { status: 200 });

  } catch (error) {
    console.error('Webhook processing error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}