// app/api/payment-requests/cancel/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface CancelRequestBody {
  requestId: string;
}

export async function POST(req: NextRequest) {
  try {
    const body: CancelRequestBody = await req.json();

    if (!body.requestId) {
      return NextResponse.json(
        { error: 'Missing request ID' },
        { status: 400 }
      );
    }

    // First, fetch the current request to check its status
    const { data: currentRequest, error: fetchError } = await supabase
      .from('payment_requests')
      .select('*')
      .eq('id', body.requestId)
      .single();

    if (fetchError || !currentRequest) {
      console.error('Error fetching request:', fetchError);
      return NextResponse.json(
        { error: 'Request not found' },
        { status: 404 }
      );
    }

    // Only allow cancellation of pending requests
    if (currentRequest.status !== 'pending') {
      return NextResponse.json(
        { error: 'Can only cancel pending requests' },
        { status: 400 }
      );
    }

    // Update the request status to cancelled
    const { data, error } = await supabase
      .from('payment_requests')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', body.requestId)
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: 'Failed to cancel request' },
        { status: 500 }
      );
    }

    // Send notification to the payer
    try {
      await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/notifications/payment-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: currentRequest.request_type === 'fiat' 
            ? 'fiat_request_cancelled' 
            : 'token_request_cancelled',
          requestId: body.requestId,
          recipientWallet: currentRequest.payer_wallet,
          senderWallet: currentRequest.requester_wallet,
          amount: currentRequest.fiat_amount || currentRequest.token_amount,
          currency: currentRequest.currency,
          tokenMint: currentRequest.token_mint,
        }),
      });
    } catch (notifError) {
      console.error('Failed to send notification:', notifError);
      // Don't fail the request if notification fails
    }

    return NextResponse.json({
      success: true,
      request: data,
      message: 'Request cancelled successfully',
    });

  } catch (error) {
    console.error('Error cancelling request:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}