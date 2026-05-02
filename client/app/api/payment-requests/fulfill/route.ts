// app/api/payment-requests/fulfill/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface FulfillRequestBody {
  requestId: string;
  payerWallet: string;
  signature: string;
  message: string;
}

export async function POST(req: NextRequest) {
  try {
    const body: FulfillRequestBody = await req.json();

    if (!body.requestId || !body.payerWallet) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Verify signature
    try {
      const messageBytes = new TextEncoder().encode(body.message);
      const signatureBytes = bs58.decode(body.signature);
      const publicKey = new PublicKey(body.payerWallet);
      
      // In production, verify the signature here
    } catch (error) {
      console.error('Signature verification error:', error);
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 400 }
      );
    }

    // Get the payment request
    const { data: request, error: fetchError } = await supabase
      .from('payment_requests')
      .select('*')
      .eq('id', body.requestId)
      .single();

    if (fetchError || !request) {
      return NextResponse.json(
        { error: 'Request not found' },
        { status: 404 }
      );
    }

    // Verify the payer wallet matches
    if (request.payer_wallet !== body.payerWallet) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    // Check if request is still pending
    if (request.status !== 'pending') {
      return NextResponse.json(
        { error: 'Request already being processed or completed', request },
        { status: 409 }
      );
    }

    // Check if expired
    if (new Date(request.expires_at) < new Date()) {
      await supabase
        .from('payment_requests')
        .update({ status: 'expired' })
        .eq('id', body.requestId);

      return NextResponse.json(
        { error: 'Request has expired' },
        { status: 410 }
      );
    }

    // Return the request data for processing
    // Don't update status here - it will be updated to 'completed' or 'rejected' later
    return NextResponse.json({
      success: true,
      request: request,
    });

  } catch (error) {
    console.error('Error fulfilling payment request:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}