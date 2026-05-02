// app/api/payment-status/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  const payoutReference     = request.nextUrl.searchParams.get('payout_reference');
  const trustExpressAddress = request.nextUrl.searchParams.get('trust_express_address');

  // ── Mode 1: direct lookup by payout_reference ─────────────────────────────
  if (payoutReference) {
    // Check buy_order_payouts first
    const { data, error } = await supabase
      .from('buy_order_payouts')
      .select('status')
      .eq('payout_reference', payoutReference)
      .single();

    if (!error && data) {
      return NextResponse.json({ status: data.status });
    }

    // Fall back to payment_links — validators write "failed" here
    const { data: plData, error: plError } = await supabase
      .from('payment_links')
      .select('status')
      .eq('payout_reference', payoutReference)
      .single();

    if (plError || !plData) {
      return NextResponse.json({ status: 'not_found' });
    }

    return NextResponse.json({ status: plData.status });
  }

  // ── Mode 2: lookup by trust_express_address to resolve payout_reference ───
  if (trustExpressAddress) {
    // Check buy_order_payouts first
    const { data, error } = await supabase
      .from('buy_order_payouts')
      .select('payout_reference, status')
      .eq('trust_express_pda', trustExpressAddress)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      return NextResponse.json({
        status: data.status,
        payoutReference: data.payout_reference,
      });
    }

    // Fall back to payment_links (column confirmed: trust_express_address)
    const { data: plData, error: plError } = await supabase
      .from('payment_links')
      .select('payout_reference, status')
      .eq('trust_express_address', trustExpressAddress)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (plError || !plData) {
      return NextResponse.json({ status: 'not_found', payoutReference: null });
    }

    return NextResponse.json({
      status: plData.status,
      payoutReference: plData.payout_reference,
    });
  }

  return NextResponse.json(
    { error: 'Provide payout_reference OR trust_express_address' },
    { status: 400 }
  );
}