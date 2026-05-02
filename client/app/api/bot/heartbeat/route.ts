import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authenticateValidator } from '@/lib/validator-auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  const apiKey = request.headers.get('x-validator-key');
  const botVersion = request.headers.get('x-bot-version');
  const auth = await authenticateValidator(apiKey, botVersion);

  if (!auth.valid) {
    return NextResponse.json({ error: auth.error ?? 'Unauthorized' }, { status: 401 });
  }

  await supabase
    .from('validators')
    .update({
      last_heartbeat: new Date().toISOString(),
      is_online: true,
    })
    .eq('wallet_pubkey', auth.validatorPubkey);

  return NextResponse.json({ ok: true });
}

export async function OPTIONS() {
  return NextResponse.json({}, { status: 200 });
}