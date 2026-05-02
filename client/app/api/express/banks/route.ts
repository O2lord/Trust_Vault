// app/api/express/banks/route.ts
//
// Unified bank-list endpoint.
// Detects which processor the LP is using (via trust_express_pda) and
// fetches the bank list from the correct API.
//
// Query params:
//   country           — ISO2 country code (NG, GH, KE, ZA)
//   trust_express_pda — LP's on-chain PDA (used to look up processor)
//
// Falls back to Flutterwave if processor cannot be determined.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { decrypt } from '../../../../../discord-bot/lib/flutterwave-credentials-bot';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── Detect processor for a sell-order PDA ───────────────────────────────────

async function getProcessorForSellOrder(pda: string): Promise<string> {
  const { data: link } = await supabase
    .from('sell_order_credentials')
    .select('credential_id')
    .eq('trust_express_pda', pda)
    .maybeSingle();

  if (!link) return 'flutterwave';

  const { data: cred } = await supabase
    .from('seller_flutterwave_accounts')
    .select('processor')
    .eq('id', link.credential_id)
    .maybeSingle();

  return cred?.processor ?? 'flutterwave';
}

// ─── Flutterwave bank list ────────────────────────────────────────────────────

async function fetchFlutterwaveBanks(country: string) {
  const secretKey = process.env.FLUTTERWAVE_SECRET_KEY;
  if (!secretKey) throw new Error('FLUTTERWAVE_SECRET_KEY not set');

  const res = await fetch(`https://api.flutterwave.com/v3/banks/${country}`, {
    headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json' },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message ?? 'Flutterwave bank fetch failed');

  return (data.data ?? []).map((b: { id: number; code: string; name: string }) => ({
    id: b.id,
    code: b.code?.toString() ?? '',
    name: b.name,
  }));
}

// ─── Paystack bank list ───────────────────────────────────────────────────────

async function fetchPaystackBanks(country: string, secretKey: string) {
  // Paystack uses full country name for some endpoints — map ISO2 → currency
  const currencyMap: Record<string, string> = {
    NG: 'NGN', GH: 'GHS', KE: 'KES', ZA: 'ZAR',
  };
  const currency = currencyMap[country] ?? 'NGN';

  const res = await fetch(`https://api.paystack.co/bank?currency=${currency}&perPage=200`, {
    headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json' },
  });
  const data = await res.json();
  if (!res.ok || !data.status) throw new Error(data.message ?? 'Paystack bank fetch failed');

  return (data.data ?? []).map((b: { id: number; code: string; name: string }) => ({
    id: b.id,
    code: b.code?.toString() ?? '',
    name: b.name,
  }));
}

// ─── GET handler ─────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const country = (searchParams.get('country') ?? 'NG').toUpperCase();
    const pda = searchParams.get('trust_express_pda');

    const validCountries = ['NG', 'GH', 'KE', 'ZA'];
    if (!validCountries.includes(country)) {
      return NextResponse.json({ error: 'Invalid country code' }, { status: 400 });
    }

    // Detect processor
    const processor = pda ? await getProcessorForSellOrder(pda) : 'flutterwave';

    let banks: { id: number; code: string; name: string }[] = [];

    if (processor === 'paystack') {
      // Get the LP's decrypted Paystack key
      const { data: link } = await supabase
        .from('sell_order_credentials')
        .select('credential_id')
        .eq('trust_express_pda', pda!)
        .maybeSingle();

      const { data: cred } = await supabase
        .from('seller_flutterwave_accounts')
        .select('encrypted_secret_key, encryption_iv, encryption_auth_tag')
        .eq('id', link!.credential_id)
        .maybeSingle();

      const secretKey = decrypt(cred!.encrypted_secret_key, cred!.encryption_iv, cred!.encryption_auth_tag);
      banks = await fetchPaystackBanks(country, secretKey);
    } else {
      // Flutterwave (default) or OPay — OPay doesn't have a public bank list API,
      // so we fall back to Flutterwave's list for OPay users too.
      banks = await fetchFlutterwaveBanks(country);
    }

    banks.sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ success: true, processor, country, banks });
  } catch (err) {
    console.error('❌ /api/express/banks error:', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to fetch banks' },
      { status: 500 }
    );
  }
}