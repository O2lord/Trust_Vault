import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const walletAddress = searchParams.get('wallet');

    if (!walletAddress) {
      return NextResponse.json(
        { error: 'Wallet address is required' },
        { status: 400 }
      );
    }

    // Store wallet address in session for callback
    const response = NextResponse.redirect(
      `https://discord.com/api/oauth2/authorize?` +
      `client_id=${process.env.DISCORD_CLIENT_ID}&` +
      `redirect_uri=${encodeURIComponent(process.env.DISCORD_REDIRECT_URI!)}&` +
      `response_type=code&` +
      `scope=identify%20email&` +
      `state=${walletAddress}`
    );

    return response;
  } catch (error) {
    console.error('Discord OAuth initiation error:', error);
    return NextResponse.json(
      { error: 'Failed to initiate Discord OAuth' },
      { status: 500 }
    );
  }
}