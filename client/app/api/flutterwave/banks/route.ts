// app/api/flutterwave/banks/route.ts
import { NextRequest, NextResponse } from "next/server";

// Define the bank interface
interface FlutterwaveBank {
  id: number;
  code: string;
  name: string;
}

export async function GET(request: NextRequest) {
  try {
    // Access environment variable directly
    const secretKey = process.env.FLUTTERWAVE_SECRET_KEY;
    
    if (!secretKey) {
      console.error("❌ FLUTTERWAVE_SECRET_KEY is not set");
      console.error("Available env vars:", Object.keys(process.env).filter(k => k.includes('FLUTTER')));
      return NextResponse.json(
        { error: "Flutterwave configuration missing" },
        { status: 500 }
      );
    }

    console.log("✅ Secret key found, length:", secretKey.length);
    console.log("✅ Key starts with:", secretKey.substring(0, 15));

    const { searchParams } = new URL(request.url);
    const country = searchParams.get('country') || 'NG';

    const validCountries = ['NG', 'GH', 'KE', 'UG', 'TZ', 'ZA'];
    if (!validCountries.includes(country.toUpperCase())) {
      return NextResponse.json(
        { error: "Invalid country code. Supported: " + validCountries.join(', ') },
        { status: 400 }
      );
    }

    console.log(`📞 Calling Flutterwave API for country: ${country}`);

    // Direct fetch to Flutterwave
    const response = await fetch(
      `https://api.flutterwave.com/v3/banks/${country.toUpperCase()}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log("📡 Flutterwave response status:", response.status);

    const data = await response.json();
    console.log("📦 Response data:", JSON.stringify(data).substring(0, 200));

    if (!response.ok) {
      console.error("❌ Flutterwave API error:", data);
      return NextResponse.json(
        { 
          success: false, 
          error: data.message || "Failed to fetch banks",
          details: data
        },
        { status: response.status }
      );
    }

    // Type assertion with proper interface
    const banksData = data.data as FlutterwaveBank[] | undefined;
    
    const processedBanks = (banksData || []).map((bank: FlutterwaveBank) => ({
      id: bank.id,
      code: bank.code?.toString() || '',
      name: bank.name,
    }));

    return NextResponse.json({
      success: true,
      country: country.toUpperCase(),
      banks: processedBanks,
    });

  } catch (error) {
    console.error("❌ Error fetching banks:", error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to fetch banks" 
      },
      { status: 500 }
    );
  }
}