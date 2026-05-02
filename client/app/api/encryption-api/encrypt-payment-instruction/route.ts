import { NextRequest, NextResponse } from 'next/server';
import { encryptInstructions, validatePaymentInstructions, sanitizePaymentInstructions } from '@/services/encryptionService';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate request body
    if (!body.paymentInstructions) {
      return NextResponse.json(
        { error: 'Payment instructions are required' },
        { status: 400 }
      );
    }

    // Validate payment instructions format
    if (!validatePaymentInstructions(body.paymentInstructions)) {
      return NextResponse.json(
        { error: 'Invalid payment instructions format' },
        { status: 400 }
      );
    }

    // Sanitize the payment instructions
    const sanitizedInstructions = sanitizePaymentInstructions(body.paymentInstructions);

    //Fixed error
    // Type assertion since we know sanitizedInstructions should be an object after validation
    if (typeof sanitizedInstructions !== 'object' || sanitizedInstructions === null) {
      return NextResponse.json(
        { error: 'Sanitization failed - invalid result type' },
        { status: 500 }
      );
    }

    // Encrypt the payment instructions
    const result = await encryptInstructions({
      paymentInstructions: sanitizedInstructions as object,
    });

   

    return NextResponse.json({
      success: true,
      encryptedData: result.encryptedData,
      keyId: result.keyId,
    });
  } catch (error) {
    console.error('Encrypt instructions API error:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to encrypt payment instructions',
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