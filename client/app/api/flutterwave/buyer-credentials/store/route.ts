// api/flutterwave/buyer-credentials/store/route.ts
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/client';
import { verifySignature, validateMessageTimestamp } from '@/lib/solana-auth';

const ENCRYPTION_KEY = process.env.FLUTTERWAVE_ENCRYPTION_KEY!;
const ALGORITHM = 'aes-256-gcm';

if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 64) {
  throw new Error('FLUTTERWAVE_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
}

// Encryption function
function encrypt(text: string): { encrypted: string; iv: string; authTag: string } {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(
    ALGORITHM,
    Buffer.from(ENCRYPTION_KEY, 'hex'),
    iv
  );

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return {
    encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
  };
}

// Verify Flutterwave credentials
async function verifyFlutterwaveCredentials(secretKey: string): Promise<{
  valid: boolean;
  balance?: number;
  currency?: string;
}> {
  try {
    const response = await fetch('https://api.flutterwave.com/v3/balances', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return { valid: false };
    }

    const data = await response.json();
    
    if (data.status === 'success' && data.data && data.data.length > 0) {
      const firstBalance = data.data[0];
      return {
        valid: true,
        balance: firstBalance.available_balance,
        currency: firstBalance.currency,
      };
    }

    return { valid: true };
  } catch (error) {
    console.error('Error verifying Flutterwave credentials:', error);
    return { valid: false };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { walletAddress, secretKey, signature, message, label } = body;

    // Validate required fields
    if (!walletAddress || !secretKey || !signature || !message) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate message timestamp (prevent replay attacks)
    if (!validateMessageTimestamp(message)) {
      return NextResponse.json(
        { error: 'Message timestamp is too old or invalid' },
        { status: 400 }
      );
    }

    // Verify the signature
    const isValid = await verifySignature(walletAddress, signature, message);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      );
    }

    // Verify the Flutterwave credentials are valid
    const credentialCheck = await verifyFlutterwaveCredentials(secretKey);
    if (!credentialCheck.valid) {
      return NextResponse.json(
        { error: 'Invalid Flutterwave credentials' },
        { status: 400 }
      );
    }

    // Encrypt the secret key
    const { encrypted, iv, authTag } = encrypt(secretKey);

    // Generate a unique credential ID
    const credentialId = crypto.randomUUID();

    // Store in database - using buyer_flutterwave_credentials table
    const { data, error } = await supabaseAdmin
      .from('buyer_flutterwave_credentials')
      .insert({
        id: credentialId,
        wallet_address: walletAddress,
        encrypted_secret_key: encrypted,
        encryption_iv: iv,
        encryption_auth_tag: authTag,
        label: label || null,
        is_active: true,
        created_at: new Date().toISOString(),
        last_verified: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: 'Failed to store credentials' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      credentialId: data.id,
      balance: credentialCheck.balance,
      currency: credentialCheck.currency,
      message: 'Buyer credentials stored successfully',
    });
  } catch (error) {
    console.error('Error in store buyer credentials:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}