// ─────────────────────────────────────────────────────────────────────────────
// FILE: app/api/payment-processors/opay/buyer-credentials/store/route.ts
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/client';
import { verifySignature, validateMessageTimestamp } from '@/lib/solana-auth';
import OpayService from '../../../../../../../discord-bot/services/opayServices';

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
    const { walletAddress, publicKey, secretKey, merchantId, signature, message, label } = body;

    if (!walletAddress || !publicKey || !secretKey || !merchantId || !signature || !message) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    if (!validateMessageTimestamp(message)) {
      return NextResponse.json({ error: 'Message timestamp is too old or invalid' }, { status: 400 });
    }

    const isValid = await verifySignature(walletAddress, signature, message);
    if (!isValid) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });

    const credentialCheck = await OpayService.validateCredentials({ publicKey, secretKey, merchantId });
    if (!credentialCheck.valid) {
      return NextResponse.json({ error: credentialCheck.error ?? 'Invalid OPay credentials' }, { status: 400 });
    }

    const encryptedSecret = encrypt(secretKey);
    const encryptedPublic = encrypt(publicKey);
    const credentialId = crypto.randomUUID();

    // Writes to buyer_flutterwave_credentials with processor = 'opay'
    const { data, error } = await supabaseAdmin
      .from('buyer_flutterwave_credentials')
      .insert({
        id: credentialId,
        wallet_address: walletAddress,
        processor: 'opay',
        encrypted_secret_key: encryptedSecret.encrypted,
        encryption_iv: encryptedSecret.iv,
        encryption_auth_tag: encryptedSecret.authTag,
        encrypted_public_key: encryptedPublic.encrypted,
        encryption_public_key_iv: encryptedPublic.iv,
        encryption_public_key_auth_tag: encryptedPublic.authTag,
        processor_account_id: merchantId,
        label: label ?? null,
        is_active: true,
        created_at: new Date().toISOString(),
        last_verified: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('[OPay] DB error storing buyer credentials:', error);
      return NextResponse.json({ error: 'Failed to store credentials' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      credentialId: data.id,
      processor: 'opay',
      message: 'OPay buyer credentials stored successfully',
    });
  } catch (error) {
    console.error('[OPay] Error storing buyer credentials:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// FILE: app/api/payment-processors/opay/seller-credentials/list/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// (copy into separate file — same as buyer list below but queries seller table)

export async function GETSellerList(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const walletAddress = searchParams.get('walletAddress');
  if (!walletAddress) return NextResponse.json({ error: 'Missing wallet address' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('seller_flutterwave_accounts')
    .select('id, label, created_at, is_active, last_verified, processor, processor_account_id')
    .eq('wallet_address', walletAddress)
    .eq('processor', 'opay')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: 'Failed to fetch credentials' }, { status: 500 });
  return NextResponse.json({ credentials: data ?? [] });
}


// ─────────────────────────────────────────────────────────────────────────────
// FILE: app/api/payment-processors/opay/buyer-credentials/list/route.ts
// ─────────────────────────────────────────────────────────────────────────────

export async function GETBuyerList(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const walletAddress = searchParams.get('walletAddress');
  if (!walletAddress) return NextResponse.json({ error: 'Missing wallet address' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('buyer_flutterwave_credentials')
    .select('id, label, created_at, is_active, last_verified, processor, processor_account_id')
    .eq('wallet_address', walletAddress)
    .eq('processor', 'opay')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: 'Failed to fetch credentials' }, { status: 500 });
  return NextResponse.json({ credentials: data ?? [] });
}


// ─────────────────────────────────────────────────────────────────────────────
// FILE: app/api/payment-processors/opay/seller-credentials/link/route.ts
// Links sell order PDA → OPay seller credential
// Uses the SAME sell_order_credentials table — no new tables needed
// ─────────────────────────────────────────────────────────────────────────────

export async function POSTSellerLink(request: NextRequest) {
  try {
    const body = await request.json();
    const { trustExpressPda, credentialId, walletAddress } = body;

    if (!trustExpressPda || !credentialId || !walletAddress) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Verify the credential belongs to this wallet, is OPay, and is active
    const { data: credential } = await supabaseAdmin
      .from('seller_flutterwave_accounts')
      .select('id')
      .eq('id', credentialId)
      .eq('wallet_address', walletAddress)
      .eq('processor', 'opay')
      .eq('is_active', true)
      .single();

    if (!credential) {
      return NextResponse.json({ error: 'Invalid or inactive OPay credential' }, { status: 400 });
    }

    // Upsert into existing sell_order_credentials table
    const { data, error } = await supabaseAdmin
      .from('sell_order_credentials')
      .upsert(
        { trust_express_pda: trustExpressPda, credential_id: credentialId, wallet_address: walletAddress, created_at: new Date().toISOString() },
        { onConflict: 'trust_express_pda' }
      )
      .select()
      .single();

    if (error) return NextResponse.json({ error: 'Failed to link credential' }, { status: 500 });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// FILE: app/api/payment-processors/opay/buyer-credentials/link/route.ts
// Links buy order PDA → OPay buyer credential
// Uses the SAME buy_order_credentials table — no new tables needed
// ─────────────────────────────────────────────────────────────────────────────

export async function POSTBuyerLink(request: NextRequest) {
  try {
    const body = await request.json();
    const { trustExpressPda, credentialId, walletAddress, signature, message } = body;

    if (!trustExpressPda || !credentialId || !walletAddress || !signature || !message) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!validateMessageTimestamp(message)) {
      return NextResponse.json({ error: 'Message timestamp is too old or invalid' }, { status: 400 });
    }

    const isValid = await verifySignature(walletAddress, signature, message);
    if (!isValid) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });

    const { data: credential } = await supabaseAdmin
      .from('buyer_flutterwave_credentials')
      .select('id')
      .eq('id', credentialId)
      .eq('wallet_address', walletAddress)
      .eq('processor', 'opay')
      .eq('is_active', true)
      .single();

    if (!credential) {
      return NextResponse.json({ error: 'Invalid or inactive OPay credential' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('buy_order_credentials')
      .upsert(
        { trust_express_pda: trustExpressPda, credential_id: credentialId, wallet_address: walletAddress, created_at: new Date().toISOString() },
        { onConflict: 'trust_express_pda' }
      )
      .select()
      .single();

    if (error) return NextResponse.json({ error: 'Failed to link credential' }, { status: 500 });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}