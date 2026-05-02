import { NextRequest, NextResponse } from 'next/server';
import { destroyVaultKey } from '@/services/keyManagementService';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Log the entire request body at the beginning
  
    
    // Validate request body
    if (!body.trustVaultPubkey && !body.sellerPubkey) {
      return NextResponse.json(
        { error: 'Either trustVaultPubkey or sellerPubkey is required' },
        { status: 400 }
      );
    }

    // Destroy the vault key
    await destroyVaultKey({
      trustVaultPubkey: body.trustVaultPubkey,
      sellerPubkey: body.sellerPubkey,
      reason: body.reason || 'Manual destruction via API',
    });

   

    return NextResponse.json({
      success: true,
      message: 'Encryption key destroyed successfully',
    });
  } catch (error) {
    console.error('Destroy key API error:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to destroy encryption key',
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