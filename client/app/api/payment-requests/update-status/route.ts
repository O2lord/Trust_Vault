// app/api/payment-requests/update-status/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface UpdateStatusBody {
  requestId: string;
  status: 'completed' | 'rejected' | 'cancelled';
  transactionSignature?: string;
}

interface UpdateData {
  status: 'completed' | 'rejected' | 'cancelled';
  completed_at?: string;
  transaction_signature?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body: UpdateStatusBody = await req.json();

    if (!body.requestId || !body.status) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const updateData: UpdateData = {
      status: body.status,
    };

    if (body.status === 'completed') {
      updateData.completed_at = new Date().toISOString();
      if (body.transactionSignature) {
        updateData.transaction_signature = body.transactionSignature;
      }
    }

    const { data, error } = await supabase
      .from('payment_requests')
      .update(updateData)
      .eq('id', body.requestId)
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: 'Failed to update request' },
        { status: 500 }
      );
    }

    // Send notification
    try {
      await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/notifications/payment-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: `fiat_request_${body.status}`,
          requestId: body.requestId,
          recipientWallet: data.requester_wallet,
          senderWallet: data.payer_wallet,
          amount: data.fiat_amount,
          currency: data.currency,
        }),
      });
    } catch (notifError) {
      console.error('Failed to send notification:', notifError);
    }

    return NextResponse.json({
      success: true,
      request: data,
    });

  } catch (error) {
    console.error('Error updating request status:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}