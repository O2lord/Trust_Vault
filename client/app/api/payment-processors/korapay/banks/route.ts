// app/api/korapay/banks/route.ts
// Returns Korapay's bank list for Nigeria.
// Used by useProcessorBanks hook when processor = 'korapay'.

import { NextRequest, NextResponse } from 'next/server';

interface KorapayBank {
  name: string;
  slug: string;
  code: string;
  nibss_bank_code: string;
}

export async function GET(request: NextRequest) {
  try {
    const secretKey = process.env.KORAPAY_SECRET_KEY;
    console.log('[Korapay Banks] Key present:', !!process.env.KORAPAY_SECRET_KEY);
console.log('[Korapay Banks] Key prefix:', process.env.KORAPAY_SECRET_KEY?.slice(0, 10));
    if (!secretKey) {
      return NextResponse.json({ error: 'Korapay configuration missing' }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const country = searchParams.get('country') ?? 'NG';

    console.log(`📞 [Korapay Banks] Fetching banks for country: ${country}`);

    const response = await fetch(
      `https://api.korapay.com/merchant/api/v1/misc/banks?countryCode=${country}`,
      {
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const data = await response.json() as {
      status: boolean;
      message: string;
      data?: KorapayBank[];
    };

    if (!response.ok || !data.status) {
      console.error('[Korapay Banks] API error:', data);
      return NextResponse.json({ success: false, error: data.message ?? 'Failed to fetch banks' }, { status: response.status });
    }

    const banks = (data.data ?? []).map(b => ({
      id:   b.nibss_bank_code ?? b.code,
      code: b.code,
      name: b.name,
    }));

    console.log(`✅ [Korapay Banks] Returned ${banks.length} banks`);
    return NextResponse.json({ success: true, country, banks });
  } catch (error) {
    console.error('[Korapay Banks] Error:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Failed to fetch banks' }, { status: 500 });
  }
}