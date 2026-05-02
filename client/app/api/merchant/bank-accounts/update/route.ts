// api/merchant/bank-accounts/update/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { verifySignature, validateMessageTimestamp } from '@/lib/solana-auth';

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      accountId,
      walletAddress,
      signature,
      message,
      label,
      bankName,
      accountNumber,
      accountName,
      currency,
      setAsDefault,
    } = body;

    // ── Validation ───────────────────────────────────────────────────────────
    if (!accountId || !walletAddress || !signature || !message) {
      return NextResponse.json(
        { error: 'Missing required fields' },
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

    // ── Verify account belongs to this wallet ────────────────────────────────
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('merchant_bank_accounts')
      .select('id, wallet_address')
      .eq('id', accountId)
      .eq('wallet_address', walletAddress)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: 'Account not found or does not belong to this wallet' },
        { status: 404 }
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

    // ── Build update payload (only include provided fields) ──────────────────
    const updates: Record<string, unknown> = {};
    if (label !== undefined)         updates.label          = label.trim();
    if (bankName !== undefined)      updates.bank_name      = bankName.trim();
    if (accountNumber !== undefined) updates.account_number = accountNumber.trim();
    if (accountName !== undefined)   updates.account_name   = accountName.trim();
    if (currency !== undefined)      updates.currency       = currency.toUpperCase();
    if (setAsDefault !== undefined)  updates.is_default     = setAsDefault;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('merchant_bank_accounts')
      .update(updates)
      .eq('id', accountId)
      .eq('wallet_address', walletAddress)
      .select('id, label, bank_name, account_number, account_name, currency, is_default, created_at')
      .single();

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: 'Failed to update bank account' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      account: data,
      message: 'Bank account updated successfully',
    });
  } catch (error) {
    console.error('Error updating merchant bank account:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}