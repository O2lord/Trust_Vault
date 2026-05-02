// /lib/flutterwave-credentials.ts
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { verifySignature, validateMessageTimestamp } from './solana-auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ENCRYPTION_KEY = process.env.FLUTTERWAVE_ENCRYPTION_KEY!;
const ALGORITHM = 'aes-256-gcm';

if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 64) {
  throw new Error('FLUTTERWAVE_ENCRYPTION_KEY must be a 64-character hex string');
}

// ==========================================
// Encryption Utilities
// ==========================================
export function encrypt(text: string): { encrypted: string; iv: string; authTag: string } {
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

export function decrypt(encrypted: string, iv: string, authTag: string): string {
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

// ==========================================
// Flutterwave API Verification
// ==========================================
export async function verifyFlutterwaveCredentials(secretKey: string): Promise<{
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
    
    // Extract balance information if available
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

// ==========================================
// Store Credentials
// ==========================================
export async function storeCredentials(request: NextRequest) {
  try {
    const body = await request.json();
    const { walletAddress, secretKey, signature, message, label } = body;

    // Validate required fields
    if (!walletAddress || !secretKey || !signature || !message) {
      return NextResponse.json(
        { error: 'Missing required fields: walletAddress, secretKey, signature, message' },
        { status: 400 }
      );
    }

    // Validate message timestamp (must be recent)
    if (!validateMessageTimestamp(message)) {
      return NextResponse.json(
        { error: 'Message timestamp is too old or invalid' },
        { status: 400 }
      );
    }

    // Verify the signature
    const isValidSignature = await verifySignature(walletAddress, signature, message);
    if (!isValidSignature) {
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      );
    }

    // Verify the Flutterwave credentials
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
    const credentialId = `cred_${crypto.randomBytes(16).toString('hex')}`;

    // Store in database
    const { data, error } = await supabase
      .from('lp_flutterwave_credentials')
      .insert({
        id: credentialId,
        wallet_address: walletAddress,
        encrypted_secret_key: encrypted,
        encryption_iv: iv,
        encryption_auth_tag: authTag,
        label: label || null,
        is_active: true,
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
      message: 'Credentials stored successfully',
    });
  } catch (error) {
    console.error('Error in store credentials:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ==========================================
// Verify Credentials (before storing)
// ==========================================
export async function verifyCredentials(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const secretKey = searchParams.get('secretKey');

    if (!secretKey) {
      return NextResponse.json(
        { error: 'Missing secret key parameter' },
        { status: 400 }
      );
    }

    const result = await verifyFlutterwaveCredentials(secretKey);

    return NextResponse.json({
      valid: result.valid,
      balance: result.balance,
      currency: result.currency,
      message: result.valid ? 'Credentials are valid' : 'Invalid credentials',
    });
  } catch (error) {
    console.error('Error verifying credentials:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ==========================================
// List Credentials
// ==========================================
export async function listCredentials(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const walletAddress = searchParams.get('walletAddress');
    const signature = searchParams.get('signature');
    const message = searchParams.get('message');

    if (!walletAddress || !signature || !message) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // Validate message timestamp
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

    // Fetch credentials (without the actual secret keys)
    const { data, error } = await supabase
      .from('lp_flutterwave_credentials')
      .select('id, label, created_at, is_active, updated_at')
      .eq('wallet_address', walletAddress)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch credentials' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      credentials: data || [],
    });
  } catch (error) {
    console.error('Error listing credentials:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ==========================================
// Delete Credential
// ==========================================
export async function deleteCredential(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const credentialId = searchParams.get('credentialId');
    const walletAddress = searchParams.get('walletAddress');
    const signature = searchParams.get('signature');
    const message = searchParams.get('message');

    if (!credentialId || !walletAddress || !signature || !message) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // Validate message timestamp
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

    // Check if credential is being used by any buy orders
    const { data: buyOrders } = await supabase
      .from('buy_order_credentials')
      .select('trust_express_pda')
      .eq('credential_id', credentialId)
      .limit(1);

    if (buyOrders && buyOrders.length > 0) {
      return NextResponse.json(
        { 
          error: 'Cannot delete credential that is being used by active buy orders',
          buyOrderCount: buyOrders.length 
        },
        { status: 400 }
      );
    }

    // Delete the credential
    const { error } = await supabase
      .from('lp_flutterwave_credentials')
      .delete()
      .eq('id', credentialId)
      .eq('wallet_address', walletAddress);

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: 'Failed to delete credential' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Credential deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting credential:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ==========================================
// Check Credential Status
// ==========================================
export async function checkCredentialStatus(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const credentialId = searchParams.get('credentialId');
    const walletAddress = searchParams.get('walletAddress');
    const signature = searchParams.get('signature');
    const message = searchParams.get('message');

    if (!credentialId || !walletAddress || !signature || !message) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // Validate message timestamp
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

    // Fetch the encrypted credential
    const { data, error } = await supabase
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
    await supabase
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

// ==========================================
// Get Decrypted Credentials (Internal Use Only)
// ==========================================
export async function getDecryptedCredentials(
  credentialId: string,
  walletAddress: string
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('lp_flutterwave_credentials')
      .select('encrypted_secret_key, encryption_iv, encryption_auth_tag, is_active')
      .eq('id', credentialId)
      .eq('wallet_address', walletAddress)
      .eq('is_active', true)
      .single();

    if (error || !data) {
      console.error('Error fetching credentials:', error);
      return null;
    }

    return decrypt(
      data.encrypted_secret_key,
      data.encryption_iv,
      data.encryption_auth_tag
    );
  } catch (error) {
    console.error('Error decrypting credentials:', error);
    return null;
  }
}

// ==========================================
// Get Credentials for Trust Express (Internal Use)
// ==========================================
export async function getCredentialsForTrustExpress(
  trustExpressPda: string
): Promise<string | null> {
  try {
    // Get the credential ID linked to this trust express
    const { data: linkData, error: linkError } = await supabase
      .from('buy_order_credentials')
      .select('credential_id, wallet_address')
      .eq('trust_express_pda', trustExpressPda)
      .single();

    if (linkError || !linkData) {
      
      return null;
    }

    // Get and decrypt the credentials
    return await getDecryptedCredentials(
      linkData.credential_id,
      linkData.wallet_address
    );
  } catch (error) {
    console.error('Error getting credentials for trust express:', error);
    return null;
  }
}