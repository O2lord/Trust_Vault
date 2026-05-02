import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authenticateValidator } from '@/lib/validator-auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const apiKey = request.headers.get('x-validator-key');
    const botVersion = request.headers.get('x-bot-version');
    const auth = await authenticateValidator(apiKey, botVersion);

    if (!auth.valid) {
      return NextResponse.json({ error: auth.error ?? 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json() as {
      payout_reference?: string;
      trust_express_pda?: string;
    };
    const { payout_reference, trust_express_pda } = body;

    if (!payout_reference || !trust_express_pda) {
      return NextResponse.json(
        { error: 'Missing payout_reference or trust_express_pda' },
        { status: 400 }
      );
    }

    // Check validator is online with a fresh heartbeat
    const { data: validatorStatus } = await supabase
      .from('validators')
      .select('is_online, last_heartbeat')
      .eq('wallet_pubkey', auth.validatorPubkey)
      .single();

    const twoMinutesAgo = new Date(Date.now() - 120_000).toISOString();

    if (
      !validatorStatus?.is_online ||
      !validatorStatus?.last_heartbeat ||
      validatorStatus.last_heartbeat < twoMinutesAgo
    ) {
      return NextResponse.json(
        { error: 'Validator is marked offline. Resume heartbeat before participating.' },
        { status: 403 }
      );
    }

    // Race INSERT — only one validator wins
    const { error: insertError } = await supabase
      .from('buy_order_payouts')
      .insert({
        payout_reference,
        trust_express_pda,
        executor_pubkey: auth.validatorPubkey,
        flw_transfer_reference: null,
        status: 'pending',
        created_at: new Date().toISOString(),
      });

    if (!insertError) {
      console.log(`🎯 Executor elected: ${auth.validatorPubkey?.slice(0, 8)} for ${payout_reference}`);
      return NextResponse.json({ role: 'executor' });
    }
    if (insertError.code === '23505') {
      return NextResponse.json({ role: 'verifier' });
    }

    console.error('❌ elect-executor DB error:', insertError);
    return NextResponse.json({ error: 'Election failed due to a database error' }, { status: 500 });

  } catch (error) {
    console.error('❌ elect-executor error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { status: 200 });
}