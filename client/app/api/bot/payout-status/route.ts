import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authenticateValidator } from '@/lib/validator-auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const apiKey = request.headers.get('x-validator-key');
    const botVersion = request.headers.get('x-bot-version');
    const auth = await authenticateValidator(apiKey, botVersion);

    if (!auth.valid) {
      return NextResponse.json({ error: auth.error ?? 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const payoutReference = searchParams.get('payout_reference');

    if (!payoutReference) {
      return NextResponse.json({ error: 'Missing payout_reference' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('buy_order_payouts')
      .select('status, flw_transfer_reference, executor_pubkey')
      .eq('payout_reference', payoutReference)
      .single();

    if (error || !data) {
      return NextResponse.json({ status: 'not_found', flw_transfer_reference: null });
    }

    return NextResponse.json({
      status: data.status,
      flw_transfer_reference: data.flw_transfer_reference ?? null,
      executor_pubkey: data.executor_pubkey,
    });

  } catch (error) {
    console.error('❌ payout-status error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { status: 200 });
}