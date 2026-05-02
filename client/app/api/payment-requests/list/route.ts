// app/api/payment-requests/list/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface PaymentRequest {
  id: string;
  requester_wallet: string;
  payer_wallet: string;
  amount: number;
  token: string;
  description?: string;
  status: 'pending' | 'completed' | 'expired' | 'cancelled';
  created_at: string;
  expires_at: string;
  paid_at?: string;
  transaction_signature?: string;
}

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const walletAddress = searchParams.get('wallet');
    const type = searchParams.get('type') || 'incoming'; // 'incoming' or 'outgoing'

    if (!walletAddress) {
      return NextResponse.json(
        { error: 'Wallet address required' },
        { status: 400 }
      );
    }

    let query = supabase.from('payment_requests').select('*');

    if (type === 'incoming') {
      query = query.eq('payer_wallet', walletAddress);
    } else {
      query = query.eq('requester_wallet', walletAddress);
    }

    query = query.order('created_at', { ascending: false });

    const { data: requests, error } = await query;

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch requests' },
        { status: 500 }
      );
    }

    // Auto-expire old requests
    const now = new Date();
    const typedRequests = requests as PaymentRequest[];
    
    const expiredRequests = typedRequests.filter(
      (req) => req.status === 'pending' && new Date(req.expires_at) < now
    );

    if (expiredRequests.length > 0) {
      await supabase
        .from('payment_requests')
        .update({ status: 'expired' })
        .in('id', expiredRequests.map((r) => r.id));
    }

    return NextResponse.json({
      success: true,
      requests: typedRequests.map((req) => ({
        ...req,
        isExpired: req.status === 'pending' && new Date(req.expires_at) < now,
      })),
    });

  } catch (error) {
    console.error('Error fetching payment requests:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}