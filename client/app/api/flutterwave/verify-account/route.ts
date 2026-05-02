
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    
    const secretKey = process.env.FLUTTERWAVE_SECRET_KEY;
    
    if (!secretKey) {
      console.error("FLUTTERWAVE_SECRET_KEY environment variable is not set");
      return NextResponse.json(
        { 
          success: false, 
          error: "Flutterwave configuration missing. Please contact administrator." 
        },
        { status: 500 }
      );
    }

    
    const body = await request.json();
    let { account_number, account_bank } = body;

    
    if (!account_number || !account_bank) {
      return NextResponse.json(
        { 
          success: false,
          error: "Account number and bank code are required" 
        },
        { status: 400 }
      );
    }

    
    const isTestMode = secretKey.startsWith('FLWSECK_TEST');
    

    
    if (isTestMode) {
     
      
      
      
      const testAccountNumber = '0690000040'; 
      const testBankCode = '044'; 
      
      
      account_number = testAccountNumber;
      account_bank = testBankCode;
      
     
    }

    
    const response = await fetch('https://api.flutterwave.com/v3/accounts/resolve', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        account_number: account_number,
        account_bank: account_bank,
      }),
    });

    const data = await response.json();


    if (!response.ok) {
      // Handle different error cases
      if (response.status === 400) {
        return NextResponse.json(
          { 
            success: false, 
            error: isTestMode 
              ? "Account verification is simulated in test mode. In production, real account details will be verified."
              : data.message || "Invalid account details"
          },
          { status: 400 }
        );
      }
      
      throw new Error(`Flutterwave API responded with status: ${response.status}`);
    }

    // Check if verification was successful
    if (data.status === 'success' && data.data) {
      return NextResponse.json({
        success: true,
        account_name: isTestMode 
          ? "TEST USER (Demo Account)" // Return a test name in test mode
          : data.data.account_name,
        account_number: data.data.account_number,
        is_test_mode: isTestMode
      });
    } else {
      return NextResponse.json(
        { 
          success: false, 
          error: data.message || "Could not verify account details" 
        },
        { status: 400 }
      );
    }

  } catch (error) {
    console.error("Error verifying account:", error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to verify account. Please try again later." 
      },
      { status: 500 }
    );
  }
}