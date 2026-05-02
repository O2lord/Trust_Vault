// app/api/payment-processors/route.ts
//
// Returns the payment processor for a given trust_express_pda.
// The frontend calls this when building the payout-details form so it knows
// which bank list and account-verification APIs to use.
//
// GET /api/payment-processor?trust_express_pda=<PDA>
// → { processor: 'flutterwave' | 'paystack' | 'opay' }

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const pda = searchParams.get('trust_express_pda');

  if (!pda) {
    return NextResponse.json({ error: 'trust_express_pda is required' }, { status: 400 });
  }

  try {
    // Step 1: resolve credential_id from buy_order_credentials
    const { data: link, error: linkError } = await supabase
      .from('buy_order_credentials')
      .select('credential_id, wallet_address')
      .eq('trust_express_pda', pda)
      .maybeSingle();

    if (linkError) {
      console.error('[EscrowProcessor] link lookup error:', linkError);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    if (!link) {
      // No credential linked — fall back to flutterwave (legacy orders)
      return NextResponse.json({ processor: 'flutterwave', fallback: true });
    }

    // Step 2: fetch processor field from buyer_flutterwave_credentials
    const { data: cred, error: credError } = await supabase
      .from('buyer_flutterwave_credentials')
      .select('processor')
      .eq('id', link.credential_id)
      .eq('wallet_address', link.wallet_address)
      .maybeSingle();

    if (credError) {
      console.error('[EscrowProcessor] credential lookup error:', credError);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    const processor = (cred?.processor as string | null) ?? 'flutterwave';

    console.log(`✅ [EscrowProcessor] PDA ${pda.slice(0, 8)}… → processor: ${processor}`);

    return NextResponse.json({ processor });
  } catch (err) {
    console.error('[EscrowProcessor] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}