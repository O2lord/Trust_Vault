// app/api/express/verify-account/route.ts
//
// Unified account-verification endpoint.
// Detects the LP's processor from trust_express_pda and verifies the
// taker's bank account via the correct payment processor API.
//
// Body:
//   account_number    — bank account number to verify
//   account_bank      — bank code
//   trust_express_pda — LP's on-chain PDA (used to look up processor)

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { decrypt } from '../../../../../discord-bot/lib/flutterwave-credentials-bot';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── Detect processor + get credentials for a sell-order PDA ─────────────────

async function getCredentialsForSellOrder(pda: string) {
  const { data: link } = await supabase
    .from('sell_order_credentials')
    .select('credential_id')
    .eq('trust_express_pda', pda)
    .maybeSingle();

  if (!link) return { processor: 'flutterwave', secretKey: null };

  const { data: cred } = await supabase
    .from('seller_flutterwave_accounts')
    .select('processor, encrypted_secret_key, encryption_iv, encryption_auth_tag')
    .eq('id', link.credential_id)
    .maybeSingle();

  if (!cred) return { processor: 'flutterwave', secretKey: null };

  const secretKey = decrypt(cred.encrypted_secret_key, cred.encryption_iv, cred.encryption_auth_tag);
  return { processor: cred.processor ?? 'flutterwave', secretKey };
}

// ─── Flutterwave account verification ────────────────────────────────────────

async function verifyFlutterwaveAccount(accountNumber: string, bankCode: string) {
  const secretKey = process.env.FLUTTERWAVE_SECRET_KEY!;
  const isTest = secretKey.startsWith('FLWSECK_TEST');

  // Flutterwave test mode: override with test account
  const resolvedAccount = isTest ? '0690000040' : accountNumber;
  const resolvedBank = isTest ? '044' : bankCode;

  const res = await fetch('https://api.flutterwave.com/v3/accounts/resolve', {
    method: 'POST',
    headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ account_number: resolvedAccount, account_bank: resolvedBank }),
  });
  const data = await res.json();

  if (!res.ok || data.status !== 'success' || !data.data) {
    return { success: false, error: data.message ?? 'Could not verify account' };
  }

  return {
    success: true,
    account_name: isTest ? 'TEST USER (Demo Account)' : data.data.account_name,
    account_number: data.data.account_number,
    processor: 'flutterwave',
  };
}

// ─── Paystack account verification ───────────────────────────────────────────

async function verifyPaystackAccount(accountNumber: string, bankCode: string, secretKey: string) {
  const isTest = secretKey.startsWith('sk_test_');

  // Paystack test mode: use Paystack's own test account
  const resolvedAccount = isTest ? '0000000000' : accountNumber;
  const resolvedBank = isTest ? '063' : bankCode;

  const res = await fetch(
    `https://api.paystack.co/bank/resolve?account_number=${resolvedAccount}&bank_code=${resolvedBank}`,
    {
      headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json' },
    }
  );
  const data = await res.json();

  if (!res.ok || !data.status) {
    return { success: false, error: data.message ?? 'Could not verify account' };
  }

  return {
    success: true,
    account_name: isTest ? 'TEST USER (Demo Account)' : data.data?.account_name,
    account_number: data.data?.account_number ?? accountNumber,
    processor: 'paystack',
  };
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { account_number, account_bank, trust_express_pda } = body;

    if (!account_number || !account_bank) {
      return NextResponse.json(
        { success: false, error: 'account_number and account_bank are required' },
        { status: 400 }
      );
    }

    // Detect processor
    let processor = 'flutterwave';
    let lpSecretKey: string | null = null;

    if (trust_express_pda) {
      const result = await getCredentialsForSellOrder(trust_express_pda);
      processor = result.processor;
      lpSecretKey = result.secretKey;
    }

    let verifyResult;

    if (processor === 'paystack' && lpSecretKey) {
      verifyResult = await verifyPaystackAccount(account_number, account_bank, lpSecretKey);
    } else {
      // Flutterwave (default) or OPay fallback
      verifyResult = await verifyFlutterwaveAccount(account_number, account_bank);
    }

    if (!verifyResult.success) {
      return NextResponse.json({ success: false, error: verifyResult.error }, { status: 400 });
    }

    return NextResponse.json(verifyResult);
  } catch (err) {
    console.error('❌ /api/express/verify-account error:', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Verification failed' },
      { status: 500 }
    );
  }
}