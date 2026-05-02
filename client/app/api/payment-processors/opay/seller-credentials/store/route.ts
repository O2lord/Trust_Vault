// app/api/payment-processors/opay/seller-credentials/store/route.ts
//
// Stores encrypted OPay credentials for a seller LP.
// Mirrors: app/api/flutterwave/seller-credentials/store/route.ts
//
// Difference from Flutterwave:
//   - Stores both public_key AND secret_key (two encrypted fields)
//   - Stores merchant_id in processor_account_id
//   - Writes processor = 'opay' into seller_flutterwave_accounts
//     (same table, new processor column — zero disruption to existing rows)

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/client';
import { verifySignature, validateMessageTimestamp } from '@/lib/solana-auth';
import OpayService from '../../../../../../../discord-bot/services/opayServices';

const ENCRYPTION_KEY = process.env.FLUTTERWAVE_ENCRYPTION_KEY!;
const ALGORITHM = 'aes-256-gcm';

if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 64) {
  throw new Error('FLUTTERWAVE_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
}

function encrypt(text: string): { encrypted: string; iv: string; authTag: string } {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return {
    encrypted,
    iv: iv.toString('hex'),
    authTag: cipher.getAuthTag().toString('hex'),
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { walletAddress, publicKey, secretKey, merchantId, signature, message, label } = body;

    // ── Validate required fields ──────────────────────────────────────────────
    if (!walletAddress || !publicKey || !secretKey || !merchantId || !signature || !message) {
      return NextResponse.json(
        { error: 'Missing required fields: walletAddress, publicKey, secretKey, merchantId, signature, message' },
        { status: 400 }
      );
    }

    // ── Replay attack prevention ──────────────────────────────────────────────
    if (!validateMessageTimestamp(message)) {
      return NextResponse.json(
        { error: 'Message timestamp is too old or invalid' },
        { status: 400 }
      );
    }

    // ── Verify Solana wallet signature ────────────────────────────────────────
    const isValid = await verifySignature(walletAddress, signature, message);
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // ── Validate OPay credentials against the OPay API ────────────────────────
    const credentialCheck = await OpayService.validateCredentials({
      publicKey,
      secretKey,
      merchantId,
    });

    if (!credentialCheck.valid) {
      return NextResponse.json(
        { error: credentialCheck.error ?? 'Invalid OPay credentials' },
        { status: 400 }
      );
    }

    // ── Encrypt both keys ─────────────────────────────────────────────────────
    const encryptedSecret = encrypt(secretKey);
    const encryptedPublic = encrypt(publicKey);
    const credentialId = crypto.randomUUID();

    // ── Store in seller_flutterwave_accounts with processor = 'opay' ──────────
    const { data, error } = await supabaseAdmin
      .from('seller_flutterwave_accounts')
      .insert({
        id: credentialId,
        wallet_address: walletAddress,
        processor: 'opay',

        // Secret key (same columns as Flutterwave)
        encrypted_secret_key: encryptedSecret.encrypted,
        encryption_iv: encryptedSecret.iv,
        encryption_auth_tag: encryptedSecret.authTag,

        // Public key (new columns)
        encrypted_public_key: encryptedPublic.encrypted,
        encryption_public_key_iv: encryptedPublic.iv,
        encryption_public_key_auth_tag: encryptedPublic.authTag,

        // Merchant ID
        processor_account_id: merchantId,

        label: label ?? null,
        is_active: true,
        created_at: new Date().toISOString(),
        last_verified: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('[OPay] DB error storing seller credentials:', error);
      return NextResponse.json({ error: 'Failed to store credentials' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      credentialId: data.id,
      processor: 'opay',
      message: 'OPay seller credentials stored successfully',
    });
  } catch (error) {
    console.error('[OPay] Error storing seller credentials:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}