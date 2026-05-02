// api/flutterwave/seller-credentials/store/route.ts
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
  accountId?: number;
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
        accountId: firstBalance.account_id,
      };
    }

    return { valid: true };
  } catch (error) {
    console.error('Error verifying Flutterwave credentials:', error);
    return { valid: false };
  }
}

// Create Flutterwave subaccount for seller
async function createFlutterwaveSubaccount(
  secretKey: string,
  walletAddress: string,
  businessName?: string
): Promise<{ success: boolean; subaccountId?: string; error?: string }> {
  try {
    // Fetch account details first
    const profileResponse = await fetch('https://api.flutterwave.com/v3/profile', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!profileResponse.ok) {
      return { success: false, error: 'Failed to fetch account profile' };
    }

    const profileData = await profileResponse.json();
    
    if (profileData.status !== 'success') {
      return { success: false, error: 'Invalid profile response' };
    }

    const accountDetails = profileData.data;

    // Create subaccount
    const subaccountPayload = {
      account_bank: accountDetails.account_bank || 'DEFAULT_BANK', // You might need to handle this
      account_number: accountDetails.account_number || 'DEFAULT_ACCOUNT',
      business_name: businessName || `Seller ${walletAddress.slice(0, 8)}`,
      business_email: accountDetails.email || `seller-${walletAddress.slice(0, 8)}@trustexpress.io`,
      business_contact: accountDetails.phone_number || 'N/A',
      business_mobile: accountDetails.phone_number || 'N/A',
      country: accountDetails.country || 'NG',
      split_type: 'percentage',
      split_value: 0.98, // Seller gets 98%, platform keeps 2%
    };

    const subaccountResponse = await fetch('https://api.flutterwave.com/v3/subaccounts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(subaccountPayload),
    });

    const subaccountData = await subaccountResponse.json();

    if (subaccountData.status === 'success' && subaccountData.data) {
      return {
        success: true,
        subaccountId: subaccountData.data.subaccount_id || subaccountData.data.id,
      };
    }

    return {
      success: false,
      error: subaccountData.message || 'Failed to create subaccount',
    };
  } catch (error) {
    console.error('Error creating Flutterwave subaccount:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
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

    // Create Flutterwave subaccount
    const subaccountResult = await createFlutterwaveSubaccount(
      secretKey,
      walletAddress,
      label || undefined
    );

    if (!subaccountResult.success) {
      console.warn('Failed to create subaccount:', subaccountResult.error);
      // Don't fail the entire request, just log it
      // Payment links can still work without subaccounts using split payments
    }

    // Encrypt the secret key
    const { encrypted, iv, authTag } = encrypt(secretKey);

    // Generate a unique credential ID
    const credentialId = crypto.randomUUID();

    // Store in database
    const { data, error } = await supabaseAdmin
      .from('seller_flutterwave_accounts')
      .insert({
        id: credentialId,
        wallet_address: walletAddress,
        encrypted_secret_key: encrypted,
        encryption_iv: iv,
        encryption_auth_tag: authTag,
        flutterwave_subaccount_id: subaccountResult.subaccountId || null,
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
      hasSubaccount: !!subaccountResult.subaccountId,
      message: 'Seller credentials stored successfully',
    });
  } catch (error) {
    console.error('Error in store seller credentials:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}