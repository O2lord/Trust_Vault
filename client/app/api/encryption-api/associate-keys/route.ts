import { NextRequest, NextResponse } from 'next/server';
import { associateKeyWithVault } from '@/services/keyManagementService';

export async function POST(request: NextRequest) {
 
  try {
    const body = await request.json();
   
    
    // Validate request body
    if (!body.keyId) {
      return NextResponse.json(
        { error: 'Key ID is required' },
        { status: 400 }
      );
    }

    // Must have at least one target
    if (!body.trustVaultPubkey && !body.sellerPubkey) {
      return NextResponse.json(
        { error: 'Either trust vault pubkey or seller pubkey is required' },
        { status: 400 }
      );
    }

    // Associate the key with the vault and/or seller
    const result = await associateKeyWithVault({
      keyId: body.keyId,
      trustVaultPubkey: body.trustVaultPubkey,
      sellerPubkey: body.sellerPubkey, // NEW: Support seller pubkey
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    console.error('Associate key API error:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to associate key',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}