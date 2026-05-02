import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';

export async function POST(request: NextRequest) {
  try {
    const discordUserId = request.cookies.get('discord_user_id')?.value;
    
    // If there's a discord user ID, remove their subscription from the database
    if (discordUserId) {
    
      
      // Delete the user's subscription from the database
      const { error: deleteError } = await supabaseAdmin
        .from('user_subscriptions')
        .delete()
        .eq('discord_user_id', discordUserId);

      if (deleteError) {
        console.error('❌ Error removing user subscription:', deleteError);
        // Don't fail the logout if database deletion fails
        // The cookie will still be cleared
      } else {
       
      }
    }

    const response = NextResponse.json({ success: true });
    
    // Clear the session cookie
    response.cookies.set('discord_user_id', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 0, // Expire immediately
    });

    return response;
  } catch (error) {
    console.error('❌ Logout error:', error);
    return NextResponse.json(
      { error: 'Failed to logout' },
      { status: 500 }
    );
  }
}