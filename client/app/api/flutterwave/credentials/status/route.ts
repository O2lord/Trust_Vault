// api/flutterwave/credentials/status/route.ts
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/client';

const ENCRYPTION_KEY = process.env.FLUTTERWAVE_ENCRYPTION_KEY!;
const ALGORITHM = 'aes-256-gcm';

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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const credentialId = searchParams.get('credentialId');
    const walletAddress = searchParams.get('walletAddress');

    if (!credentialId || !walletAddress) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // Fetch the encrypted credential
    const { data, error } = await supabaseAdmin
      .from('lp_flutterwave_credentials')
      .select('encrypted_secret_key, encryption_iv, encryption_auth_tag')
      .eq('id', credentialId)
      .eq('wallet_address', walletAddress)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: 'Credential not found' },
        { status: 404 }
      );
    }

    // Decrypt and verify
    const secretKey = decrypt(
      data.encrypted_secret_key,
      data.encryption_iv,
      data.encryption_auth_tag
    );

    const credentialCheck = await verifyFlutterwaveCredentials(secretKey);

    // Update status in database
    await supabaseAdmin
      .from('lp_flutterwave_credentials')
      .update({ 
        is_active: credentialCheck.valid,
        updated_at: new Date().toISOString()
      })
      .eq('id', credentialId);

    return NextResponse.json({
      credentialId,
      valid: credentialCheck.valid,
      balance: credentialCheck.balance,
      currency: credentialCheck.currency,
      message: credentialCheck.valid
        ? 'Credentials are valid'
        : 'Credentials are invalid or expired',
    });
  } catch (error) {
    console.error('Error checking credential status:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}