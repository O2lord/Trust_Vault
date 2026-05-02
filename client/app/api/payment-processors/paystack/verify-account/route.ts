// app/api/paystack/verify-account/route.ts
// Mirrors /api/flutterwave/verify-account/route.ts but hits Paystack's
// GET /bank/resolve endpoint.
// Used when the escrow's processor = 'paystack'.

import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const secretKey = process.env.PAYSTACK_SECRET_KEY ?? process.env.FLUTTERWAVE_SECRET_KEY;

    if (!secretKey) {
      console.error('[Paystack VerifyAccount] No secret key in environment');
      return NextResponse.json(
        { success: false, error: 'Paystack configuration missing. Please contact administrator.' },
        { status: 500 }
      );
    }

    const body = await request.json() as {
      account_number?: string;
      account_bank?: string;  // bank_code
      bank_code?: string;     // alias
    };

    const account_number = body.account_number?.trim();
    const bank_code = (body.account_bank ?? body.bank_code)?.trim();

    if (!account_number || !bank_code) {
      return NextResponse.json(
        { success: false, error: 'account_number and bank code (account_bank) are required' },
        { status: 400 }
      );
    }

    const isTestMode =
      secretKey.startsWith('sk_test_') ||
      secretKey.startsWith('FLWSECK_TEST');  // fallback key compat

    // ── TEST MODE: skip the API call entirely ─────────────────────────────────
    // Paystack enforces a hard limit of 3 live bank resolves per day in test mode.
    // Hitting it returns a 429 and blocks all subsequent verifications.
    // In test mode we just mock a successful response — the real validation
    // happens at transfer time anyway (the transfer itself will fail if the
    // account doesn't exist in production).
    if (isTestMode) {
      console.log(`🧪 [Paystack VerifyAccount] Test mode — skipping API call, returning mock success`);
      return NextResponse.json({
        success: true,
        account_name: 'TEST USER (Demo Account)',
        account_number,
        is_test_mode: true,
      });
    }

    console.log(`📞 [Paystack VerifyAccount] Resolving ${account_number} / bank ${bank_code}`);

    const response = await fetch(
      `https://api.paystack.co/bank/resolve?account_number=${account_number}&bank_code=${bank_code}`,
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
      data?: { account_name: string; account_number: string };
    };

    if (!response.ok || !data.status) {
      console.error('[Paystack VerifyAccount] API error:', data);
      return NextResponse.json(
        { success: false, error: data.message ?? 'Could not resolve account. Please check the account number and bank.' },
        { status: response.status === 429 ? 429 : 400 }
      );
    }

    return NextResponse.json({
      success: true,
      account_name: data.data!.account_name,
      account_number: data.data!.account_number,
      is_test_mode: false,
    });
  } catch (error) {
    console.error('[Paystack VerifyAccount] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to verify account. Please try again.' },
      { status: 500 }
    );
  }
}