import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const trustExpressAddress = searchParams.get('trustExpressAddress');
    const takerAddress = searchParams.get('takerAddress');
    const sinceTimestamp = searchParams.get('since');


    if (!trustExpressAddress) {
      return NextResponse.json(
        { error: 'trustExpressAddress is required' },
        { status: 400 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Build base query — always filter by trust_express_address
    let query = supabase
      .from('receipts')
      .select('*')
      .eq('trust_express_address', trustExpressAddress)
      .order('created_at', { ascending: false })
      .limit(1);

    if (takerAddress) {
      query = query.eq('taker_address', takerAddress);
    }

    // Apply timestamp filter if provided.
    // Use gte (>=) not gt (>) to avoid missing receipts created at the exact same millisecond.
    // Also normalise: strip trailing Z and re-add it so Supabase timestamptz comparison works
    // regardless of whether the client sent ISO string with or without milliseconds.
    if (sinceTimestamp) {
      const normalised = new Date(sinceTimestamp).toISOString(); // always has ms + Z
      query = query.gte('created_at', normalised);
    }

    const { data: receipt, error } = await query.maybeSingle();

    if (error) {
      console.error('[Receipt API] Database error:', error);
      return NextResponse.json(
        { error: 'Database error', details: error.message },
        { status: 500 }
      );
    }

    if (!receipt) {
      // No receipt yet — 200 with no id so polling keeps going
      return NextResponse.json({ found: false }, { status: 200 });
    }

    // Receipt found — return the full object so data?.id works in the hook
    console.log('[Receipt API] Found receipt:', receipt.id, 'for', trustExpressAddress);
    return NextResponse.json(receipt, { status: 200 });
  } catch (error) {
    console.error('[Receipt API] Error fetching receipt:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}