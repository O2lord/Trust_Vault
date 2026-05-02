// app/api/payment-processors/opay/seller-credentials/status/route.ts

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import axios from 'axios';
import { supabaseAdmin } from '@/lib/supabase/client';
import OpayService, { computeOpaySignature } from '../../../../../../../discord-bot/services/opayServices';

const ENCRYPTION_KEY = process.env.FLUTTERWAVE_ENCRYPTION_KEY!;
const ALGORITHM = 'aes-256-gcm';
const IS_PRODUCTION = process.env.OPAY_ENV === 'production';

const OPAY_TRANSFER_BASE = IS_PRODUCTION
  ? 'https://cashierapi.opayweb.com'
  : null; // testapi.opayweb.com does not resolve in sandbox

function decrypt(encrypted: string, iv: string, authTag: string): string {
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    Buffer.from(ENCRYPTION_KEY, 'hex'),
    Buffer.from(iv, 'hex')
  );
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

async function fetchOpayBalance(
  secretKey: string,
  merchantId: string
): Promise<{ balance: number | null; currency: string | null; sandboxNote?: string }> {
  // OPay's sandbox transfer base (testapi.opayweb.com) does not resolve.
  // Balance queries are only available in production.
  if (!OPAY_TRANSFER_BASE) {
    return { balance: null, currency: null, sandboxNote: 'Balance unavailable in sandbox mode' };
  }

  try {
    const payload = { merchantId };
    const signature = computeOpaySignature(payload, secretKey);

    const res = await axios.post<{
      code: string;
      data?: { usableAmount: string; currency: string };
    }>(
      `${OPAY_TRANSFER_BASE}/api/v3/merchant/balance`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${signature}`,
          MerchantId: merchantId,
          'Content-Type': 'application/json',
        },
        timeout: 10_000,
      }
    );

    if (res.data.code === '00000' && res.data.data) {
      return {
        // usableAmount is in kobo — convert to NGN
        balance: Number(res.data.data.usableAmount) / 100,
        currency: res.data.data.currency ?? 'NGN',
      };
    }

    console.warn('[OPay] Balance query returned non-success code:', res.data.code);
    return { balance: null, currency: null };
  } catch (err) {
    console.error('[OPay] fetchOpayBalance error:', err);
    return { balance: null, currency: null };
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const credentialId = searchParams.get('credentialId');
    const walletAddress = searchParams.get('walletAddress');

    if (!credentialId || !walletAddress) {
      return NextResponse.json(
        { error: 'Missing required parameters: credentialId, walletAddress' },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('seller_flutterwave_accounts')
      .select(`
        encrypted_secret_key,
        encryption_iv,
        encryption_auth_tag,
        encrypted_public_key,
        encryption_public_key_iv,
        encryption_public_key_auth_tag,
        processor_account_id
      `)
      .eq('id', credentialId)
      .eq('wallet_address', walletAddress)
      .eq('processor', 'opay')
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Credential not found' }, { status: 404 });
    }

    const secretKey = decrypt(data.encrypted_secret_key, data.encryption_iv, data.encryption_auth_tag);
    const publicKey = decrypt(data.encrypted_public_key, data.encryption_public_key_iv, data.encryption_public_key_auth_tag);
    const merchantId = data.processor_account_id;

    const [credentialCheck, balanceResult] = await Promise.all([
      OpayService.validateCredentials({ publicKey, secretKey, merchantId }),
      fetchOpayBalance(secretKey, merchantId),
    ]);

    await supabaseAdmin
      .from('seller_flutterwave_accounts')
      .update({
        is_active: credentialCheck.valid,
        last_verified: new Date().toISOString(),
      })
      .eq('id', credentialId);

    return NextResponse.json({
      credentialId,
      valid: credentialCheck.valid,
      balance: balanceResult.balance,
      currency: balanceResult.currency,
      sandboxNote: balanceResult.sandboxNote ?? null,
      message: credentialCheck.valid
        ? 'OPay seller credentials are valid'
        : 'OPay seller credentials are invalid or expired',
    });
  } catch (error) {
    console.error('[OPay] Error checking seller credential status:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}