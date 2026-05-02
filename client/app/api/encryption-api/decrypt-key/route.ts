import { NextRequest, NextResponse } from 'next/server';
import { retrieveDecryptionKey } from '@/services/keyManagementService';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate request body - must have at least one identifier
    if (!body.trustVaultPubkey && !body.sellerPubkey) {
      return NextResponse.json(
        { error: 'Either trust vault pubkey or seller pubkey is required' },
        { status: 400 }
      );
    }

   

    // Retrieve the decryption key with enhanced lookup
    const result = await retrieveDecryptionKey(
      body.trustVaultPubkey,
      body.sellerPubkey // NEW: Support seller-specific lookup
    );

 

    return NextResponse.json({
      success: true,
      encryptionKey: result.encryptionKey,
      iv: result.iv,
      tag: result.tag,
      keyId: result.keyId,
    });
  } catch (error) {
    console.error('❌ API: Decrypt key error:', error);
    
    // Return 404 for key not found to distinguish from server errors
    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json(
        { error: 'Encryption key not available' },
        { status: 404 }
      );
    }
    
    return NextResponse.json(
      { 
        error: 'Failed to retrieve decryption key',
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