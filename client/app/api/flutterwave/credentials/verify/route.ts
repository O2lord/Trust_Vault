// api/flutterwave/credentials/verify/route.ts
import { NextRequest, NextResponse } from 'next/server';

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

export async function GET(request: NextRequest) {
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