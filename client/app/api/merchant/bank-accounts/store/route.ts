// api/merchant/bank-accounts/store/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { verifySignature, validateMessageTimestamp } from '@/lib/solana-auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      walletAddress,
      signature,
      message,
      label,
      bankName,
      bankCode,        // ← added
      accountNumber,
      accountName,
      currency,
      setAsDefault,
    } = body;

    // ── Validation ───────────────────────────────────────────────────────────
    if (!walletAddress || !signature || !message) {
      return NextResponse.json(
        { error: 'Missing required auth fields' },
        { status: 400 }
      );
    }

    if (!bankName || !bankCode || !accountNumber || !accountName || !currency) {
      return NextResponse.json(
        { error: 'Missing required bank account fields' },
        { status: 400 }
      );
    }

    if (!validateMessageTimestamp(message)) {
      return NextResponse.json(
        { error: 'Message timestamp is too old or invalid' },
        { status: 400 }
      );
    }

    const isValid = await verifySignature(walletAddress, signature, message);
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // ── Check account limit (max 10 per wallet) ──────────────────────────────
    const { count } = await supabaseAdmin
      .from('merchant_bank_accounts')
      .select('id', { count: 'exact', head: true })
      .eq('wallet_address', walletAddress);

    if ((count ?? 0) >= 10) {
      return NextResponse.json(
        { error: 'Maximum of 10 bank accounts per wallet reached' },
        { status: 400 }
      );
    }

    // ── If setting as default, clear existing default first ─────────────────
    if (setAsDefault) {
      await supabaseAdmin
        .from('merchant_bank_accounts')
        .update({ is_default: false })
        .eq('wallet_address', walletAddress)
        .eq('is_default', true);
    }

    // ── Insert ───────────────────────────────────────────────────────────────
    const isFirstAccount = (count ?? 0) === 0;

    const { data, error } = await supabaseAdmin
      .from('merchant_bank_accounts')
      .insert({
        wallet_address: walletAddress,
        label: label?.trim() || `${bankName} - ${accountName.split(' ')[0]}`,
        bank_name: bankName.trim(),
        bank_code: bankCode.trim(),   // ← saved
        account_number: accountNumber.trim(),
        account_name: accountName.trim(),
        currency: currency.toUpperCase(),
        is_default: setAsDefault || isFirstAccount,
      })
      .select('id, label, bank_name, bank_code, account_number, account_name, currency, is_default, created_at')
      .single();

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: 'Failed to save bank account' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      account: data,
      message: 'Bank account saved successfully',
    });
  } catch (error) {
    console.error('Error storing merchant bank account:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}