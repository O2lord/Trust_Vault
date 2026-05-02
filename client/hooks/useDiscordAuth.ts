'use client';

import { useState, useEffect } from 'react';

interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
}

interface AuthState {
  isAuthenticated: boolean;
  user: DiscordUser | null;
  loading: boolean;
}

export function useDiscordAuth() {
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    user: null,
    loading: true,
  });

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const response = await fetch('/api/bot/user/profile');
      if (response.ok) {
        const data = await response.json();
        setAuthState({
          isAuthenticated: true,
          user: data.discord_user,
          loading: false,
        });
      } else {
        setAuthState({
          isAuthenticated: false,
          user: null,
          loading: false,
        });
      }
    } catch (error) {
      console.error('Error checking auth status:', error);
      setAuthState({
        isAuthenticated: false,
        user: null,
        loading: false,
      });
    }
  };

  const logout = async () => {
    try {
      const response = await fetch('/api/bot/auth/logout', { method: 'POST' });
      
      if (!response.ok) {
        throw new Error('Failed to logout');
      }
      
      // Update local state immediately
      setAuthState({
        isAuthenticated: false,
        user: null,
        loading: false,
      });
      
      
    } catch (error) {
      console.error('Error logging out:', error);
      throw error; // Re-throw to allow components to handle the error
    }
  };

  return {
    ...authState,
    logout,
    refetch: checkAuthStatus,
  };
}