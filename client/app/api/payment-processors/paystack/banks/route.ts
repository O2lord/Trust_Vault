// app/api/payment-processors/paystack/banks/route.ts
// Mirrors /api/payment-processors/flutterwave/banks/route.ts but hits Paystack's GET /bank endpoint.
// Used when the escrow's processor = 'paystack' so the seller sees the correct
// bank list during payout-details entry.

import { NextRequest, NextResponse } from 'next/server';

interface PaystackBank {
  id: number;
  name: string;
  code: string;
  active: boolean;
  country: string;
  currency: string;
}

// Paystack currency → country code map (for the ?currency= param)
const CURRENCY_MAP: Record<string, string> = {
  NGN: 'NGN',
  GHS: 'GHS',
  ZAR: 'ZAR',
  KES: 'KES',
};

export async function GET(request: NextRequest) {
  try {
    const secretKey = process.env.PAYSTACK_SECRET_KEY ?? process.env.FLUTTERWAVE_SECRET_KEY;
    // NOTE: Use a dedicated PAYSTACK_SECRET_KEY env var in production.
    // Falling back to FLUTTERWAVE_SECRET_KEY is intentional during migration.

    if (!secretKey) {
      console.error('❌ [Paystack Banks] No secret key found in environment');
      return NextResponse.json({ error: 'Paystack configuration missing' }, { status: 500 });
    }

    // Accept ?currency=NGN (preferred) or ?country=NG (legacy compat)
    const { searchParams } = new URL(request.url);
    const currency = searchParams.get('currency')?.toUpperCase()
      ?? CURRENCY_MAP[searchParams.get('country')?.toUpperCase() ?? '']
      ?? 'NGN';

    if (!CURRENCY_MAP[currency]) {
      return NextResponse.json(
        { error: `Unsupported currency. Supported: ${Object.keys(CURRENCY_MAP).join(', ')}` },
        { status: 400 }
      );
    }

    console.log(`📞 [Paystack Banks] Fetching banks for currency: ${currency}`);

    const response = await fetch(
      `https://api.paystack.co/bank?currency=${currency}&use_cursor=false&perPage=200`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const data = await response.json() as {
      status: boolean;
      message: string;
      data?: PaystackBank[];
    };

    if (!response.ok || !data.status) {
      console.error('❌ [Paystack Banks] API error:', data);
      return NextResponse.json(
        { success: false, error: data.message ?? 'Failed to fetch banks' },
        { status: response.status }
      );
    }

    const banks = (data.data ?? [])
      .filter((b) => b.active)
      .map((b) => ({
        id: b.id,
        code: b.code,
        name: b.name,
      }));

    console.log(`✅ [Paystack Banks] Returned ${banks.length} active banks for ${currency}`);

    return NextResponse.json({ success: true, currency, banks });
  } catch (error) {
    console.error('❌ [Paystack Banks] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch banks' },
      { status: 500 }
    );
  }
}