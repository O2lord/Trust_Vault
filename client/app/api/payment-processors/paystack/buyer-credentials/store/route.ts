// app/api/payment-processors/paystack/buyer-credentials/store/route.ts

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/client';
import { verifySignature, validateMessageTimestamp } from '@/lib/solana-auth';
import PaystackService from '../../../../../../../discord-bot/services/paystackService';

const ENCRYPTION_KEY = process.env.FLUTTERWAVE_ENCRYPTION_KEY!;
const ALGORITHM = 'aes-256-gcm';

function encrypt(text: string): { encrypted: string; iv: string; authTag: string } {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return { encrypted, iv: iv.toString('hex'), authTag: cipher.getAuthTag().toString('hex') };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { walletAddress, secretKey, signature, message, label } = body;

    if (!walletAddress || !secretKey || !signature || !message) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    if (!validateMessageTimestamp(message)) {
      return NextResponse.json({ error: 'Message timestamp is too old or invalid' }, { status: 400 });
    }
    const isValid = await verifySignature(walletAddress, signature, message);
    if (!isValid) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });

    const credentialCheck = await PaystackService.validateCredentials({ secretKey });
    if (!credentialCheck.valid) {
      return NextResponse.json({ error: credentialCheck.error ?? 'Invalid Paystack credentials' }, { status: 400 });
    }

    const encryptedSecret = encrypt(secretKey);
    const credentialId = crypto.randomUUID();

    const { data, error } = await supabaseAdmin
      .from('buyer_flutterwave_credentials')
      .insert({
        id: credentialId,
        wallet_address: walletAddress,
        processor: 'paystack',
        encrypted_secret_key: encryptedSecret.encrypted,
        encryption_iv: encryptedSecret.iv,
        encryption_auth_tag: encryptedSecret.authTag,
        encrypted_public_key: null,
        encryption_public_key_iv: null,
        encryption_public_key_auth_tag: null,
        processor_account_id: null,
        label: label ?? null,
        is_active: true,
        created_at: new Date().toISOString(),
        last_verified: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('[Paystack] DB error storing buyer credentials:', error);
      return NextResponse.json({ error: 'Failed to store credentials' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      credentialId: data.id,
      processor: 'paystack',
      balance: credentialCheck.balance,
      currency: credentialCheck.currency,
      message: 'Paystack buyer credentials stored successfully',
    });
  } catch (error) {
    console.error('[Paystack] Error storing buyer credentials:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}