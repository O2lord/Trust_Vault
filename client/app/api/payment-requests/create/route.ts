// app/api/payment-requests/create/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface CreateTokenRequestBody {
  payerWallet: string;
  tokenMint: string;
  tokenAmount: number;
  note?: string;
  requesterWallet: string;
  signature: string;
  message: string;
  requestType: 'token';
}

interface CreateRequestBody {
  requestType: 'token' | 'fiat';
  payerWallet: string;
  fiatAmount?: number;
  currency?: string;
  tokenMint?: string;
  tokenAmount?: number;
  payoutDetails?: {
    type: 'bank_transfer' | 'mobile_money' | 'flutterwave_wallet';
    account_number: string;
    bank_code?: string;
    beneficiary_name: string;
    phone_number?: string;
    network?: string;
  };
  note?: string;
  requesterWallet: string;
  signature: string;
  message: string;
}

interface PaymentRequestInsert {
  requester_wallet: string;
  payer_wallet: string;
  request_type: 'token' | 'fiat';
  note: string | null;
  status: 'pending';
  fiat_amount?: number;
  currency?: string;
  payout_details?: {
    type: 'bank_transfer' | 'mobile_money' | 'flutterwave_wallet';
    account_number: string;
    bank_code?: string;
    beneficiary_name: string;
    phone_number?: string;
    network?: string;
  };
  token_mint?: string;
  token_amount?: number;
}

interface NotificationData {
  type: 'fiat_request_created' | 'token_request_created';
  requestId: string;
  recipientWallet: string;
  senderWallet: string;
  note?: string;
  amount?: number;
  currency?: string;
  tokenAmount?: number;
  tokenMint?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body: CreateRequestBody = await req.json();
    
    

    // Validate common required fields
    if (!body.payerWallet || !body.requesterWallet || !body.signature || !body.requestType) {
      console.error('❌ Missing required fields:', {
        payerWallet: !!body.payerWallet,
        requesterWallet: !!body.requesterWallet,
        signature: !!body.signature,
        requestType: !!body.requestType,
      });
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate based on request type
    if (body.requestType === 'fiat') {
      if (!body.fiatAmount || !body.currency || !body.payoutDetails) {
        console.error('❌ Missing fiat fields:', {
          fiatAmount: !!body.fiatAmount,
          currency: !!body.currency,
          payoutDetails: !!body.payoutDetails,
        });
        return NextResponse.json(
          { error: 'Missing required fields for fiat request' },
          { status: 400 }
        );
      }

      // Validate amount
      if (body.fiatAmount <= 0 || body.fiatAmount > 10000000) {
        console.error('❌ Invalid fiat amount:', body.fiatAmount);
        return NextResponse.json(
          { error: 'Invalid amount. Must be between 0 and 10,000,000' },
          { status: 400 }
        );
      }

      // Validate currency
      const validCurrencies = ['NGN', 'USD', 'KES', 'GHS', 'ZAR', 'UGX', 'TZS'];
      if (!validCurrencies.includes(body.currency)) {
        console.error('❌ Invalid currency:', body.currency);
        return NextResponse.json(
          { error: 'Invalid currency' },
          { status: 400 }
        );
      }
    } else if (body.requestType === 'token') {
      
      
      if (!body.tokenMint || !body.tokenAmount) {
        console.error('❌ Missing token fields:', {
          tokenMint: !!body.tokenMint,
          tokenAmount: !!body.tokenAmount,
          tokenAmountValue: body.tokenAmount,
        });
        return NextResponse.json(
          { error: 'Missing required fields for token request' },
          { status: 400 }
        );
      }

      // Validate token amount
      if (body.tokenAmount <= 0) {
        console.error('❌ Invalid token amount:', body.tokenAmount);
        return NextResponse.json(
          { error: 'Invalid token amount' },
          { status: 400 }
        );
      }

      // Validate token mint address
      try {
        new PublicKey(body.tokenMint);
        
      } catch (e) {
        console.error('❌ Invalid token mint:', body.tokenMint, e);
        return NextResponse.json(
          { error: 'Invalid token mint address' },
          { status: 400 }
        );
      }
    }

    // Verify signature
    
    
    
    
    
    const isValid = verifySignature(
      body.message,
      body.signature,
      body.requesterWallet
    );

    if (!isValid) {
      console.error('❌ Signature verification failed');
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      );
    }
    
    

    // Validate wallet addresses
    try {
      new PublicKey(body.payerWallet);
      new PublicKey(body.requesterWallet);
      
    } catch (e) {
      console.error('❌ Invalid wallet addresses:', e);
      return NextResponse.json(
        { error: 'Invalid wallet address' },
        { status: 400 }
      );
    }

    // Check for existing active request
    
    const { data: existingRequest } = await supabase
      .from('payment_requests')
      .select('id')
      .eq('requester_wallet', body.requesterWallet)
      .eq('payer_wallet', body.payerWallet)
      .eq('status', 'pending')
      .single();

    if (existingRequest) {
      console.error('❌ Existing pending request found');
      return NextResponse.json(
        { error: 'You already have a pending request to this user' },
        { status: 409 }
      );
    }

    // Create the request
    const insertData: PaymentRequestInsert = {
      requester_wallet: body.requesterWallet,
      payer_wallet: body.payerWallet,
      request_type: body.requestType,
      note: body.note || null,
      status: 'pending',
    };

    if (body.requestType === 'fiat') {
      insertData.fiat_amount = body.fiatAmount;
      insertData.currency = body.currency;
      insertData.payout_details = body.payoutDetails;
    } else if (body.requestType === 'token') {
      insertData.token_mint = body.tokenMint;
      insertData.token_amount = body.tokenAmount;
    }

    

    const { data: request, error } = await supabase
      .from('payment_requests')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('❌ Database error:', error);
      return NextResponse.json(
        { error: 'Failed to create request', details: error.message },
        { status: 500 }
      );
    }

    

    // Send notification to payer
    try {
      const notificationData: NotificationData = {
        type: body.requestType === 'fiat' ? 'fiat_request_created' : 'token_request_created',
        requestId: request.id,
        recipientWallet: body.payerWallet,
        senderWallet: body.requesterWallet,
        note: body.note,
      };

      if (body.requestType === 'fiat') {
        notificationData.amount = body.fiatAmount;
        notificationData.currency = body.currency;
      } else {
        notificationData.tokenAmount = body.tokenAmount;
        notificationData.tokenMint = body.tokenMint;
      }

      await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/notifications/payment-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(notificationData),
      });
      
      
    } catch (notifError) {
      console.error('⚠️ Failed to send notification:', notifError);
      // Don't fail the request if notification fails
    }

    return NextResponse.json({
      success: true,
      request,
    });

  } catch (error) {
    console.error('❌ Error creating payment request:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}


function verifySignature(message: string, signature: string, publicKeyStr: string): boolean {
  try {
    const publicKey = new PublicKey(publicKeyStr);
    const signatureBytes = bs58.decode(signature);
    const messageBytes = new TextEncoder().encode(message);
    
    return nacl.sign.detached.verify(
      messageBytes,
      signatureBytes,
      publicKey.toBytes()
    );
  } catch {
    return false;
  }
}