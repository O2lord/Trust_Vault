// app/api/korapay/verify-account/route.ts
// Resolves a Nigerian bank account name via Korapay's /misc/banks/resolve endpoint.

import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const secretKey = process.env.KORAPAY_SECRET_KEY;
    if (!secretKey) {
      return NextResponse.json({ success: false, error: 'Korapay configuration missing.' }, { status: 500 });
    }

    const body = await request.json() as {
      account_number?: string;
      account_bank?: string;
      bank_code?: string;
    };

    const account_number = body.account_number?.trim();
    const bank_code = (body.account_bank ?? body.bank_code)?.trim();

    if (!account_number || !bank_code) {
      return NextResponse.json({ success: false, error: 'account_number and bank_code are required' }, { status: 400 });
    }

    const isTestMode = secretKey.startsWith('sk_test_');

    if (isTestMode) {
      // Korapay test mode does resolve real accounts, but returns errors for fake ones.
      // We still call the API but mock the name in test mode if it fails.
      console.log(`📞 [Korapay VerifyAccount] Resolving ${account_number} / bank ${bank_code} [TEST MODE]`);
    }

    const response = await fetch('https://api.korapay.com/merchant/api/v1/misc/banks/resolve', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        bank:     bank_code,
        account:  account_number,
        currency: 'NGN',
      }),
    });

    const data = await response.json() as {
      status: boolean;
      message: string;
      data?: {
        account_name: string;
        account_number: string;
        bank_name: string;
        bank_code: string;
      };
    };

    if (!response.ok || !data.status) {
      console.error('[Korapay VerifyAccount] API error:', data);

      // In test mode with an unresolvable account, return mock success
      if (isTestMode) {
        console.log('🧪 [Korapay VerifyAccount] Test mode — returning mock success');
        return NextResponse.json({
          success: true,
          account_name: 'TEST USER (Demo Account)',
          account_number,
          is_test_mode: true,
        });
      }

      return NextResponse.json(
        { success: false, error: data.message ?? 'Could not resolve account. Please check the account number and bank.' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      account_name:   data.data!.account_name,
      account_number: data.data!.account_number,
      bank_name:      data.data!.bank_name,
      is_test_mode:   isTestMode,
    });
  } catch (error) {
    console.error('[Korapay VerifyAccount] Error:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Failed to verify account.' }, { status: 500 });
  }
}