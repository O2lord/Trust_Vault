import { NextRequest, NextResponse } from 'next/server';
import { handleVaultClosure } from '../../../../services/trustVaultService';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate request body
    if (!body.trustVaultPubkey || !body.reason || !body.initiatedBy) {
      return NextResponse.json(
        { error: 'Trust vault pubkey, reason, and initiatedBy are required' },
        { status: 400 }
      );
    }

    // Validate reason
    const validReasons = ['completed', 'cancelled', 'disputed', 'manual'];
    if (!validReasons.includes(body.reason)) {
      return NextResponse.json(
        { error: 'Invalid closure reason' },
        { status: 400 }
      );
    }

    // Handle vault closure
    const result = await handleVaultClosure({
      trustVaultPubkey: body.trustVaultPubkey,
      reason: body.reason,
      initiatedBy: body.initiatedBy,
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
      keyDestroyed: result.keyDestroyed,
    });
  } catch (error) {
    console.error('Close vault API error:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to close vault',
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