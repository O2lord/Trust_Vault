// api/merchant/bank-accounts/delete/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { verifySignature, validateMessageTimestamp } from '@/lib/solana-auth';

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const accountId     = searchParams.get('accountId');
    const walletAddress = searchParams.get('walletAddress');
    const signature     = searchParams.get('signature');
    const message       = searchParams.get('message');

    // ── Validation ───────────────────────────────────────────────────────────
    if (!accountId || !walletAddress || !signature || !message) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
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

    // ── Verify account belongs to this wallet and fetch current state ────────
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('merchant_bank_accounts')
      .select('id, wallet_address, is_default')
      .eq('id', accountId)
      .eq('wallet_address', walletAddress)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: 'Account not found or does not belong to this wallet' },
        { status: 404 }
      );
    }

    // ── Delete ───────────────────────────────────────────────────────────────
    const { error } = await supabaseAdmin
      .from('merchant_bank_accounts')
      .delete()
      .eq('id', accountId)
      .eq('wallet_address', walletAddress);

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: 'Failed to delete bank account' },
        { status: 500 }
      );
    }

    // ── If deleted account was default, promote the most recently created one ─
    if (existing.is_default) {
      const { data: next } = await supabaseAdmin
        .from('merchant_bank_accounts')
        .select('id')
        .eq('wallet_address', walletAddress)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (next) {
        await supabaseAdmin
          .from('merchant_bank_accounts')
          .update({ is_default: true })
          .eq('id', next.id);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Bank account deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting merchant bank account:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}