'use client';

import { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { useWallet } from '@solana/wallet-adapter-react';
import { toast } from 'sonner';
import { useDiscordAuth } from '@/hooks/useDiscordAuth';
import { InfoIcon, ExternalLink } from 'lucide-react';

export default function DiscordConnectButton() {
  const [isConnecting, setIsConnecting] = useState(false);
  const [showDMInfo, setShowDMInfo] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const { publicKey } = useWallet();
  const { isAuthenticated, user, loading, refetch } = useDiscordAuth();

  useEffect(() => {
    // Check URL params for connection status
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('discord_success') === 'connected') {
      toast.success('Discord connected successfully! Check your DMs for a welcome message.');
      setShowDMInfo(true);
      
      // Clean up URL - remove only Discord OAuth specific parameters
      const newUrlParams = new URLSearchParams(window.location.search);
      newUrlParams.delete('discord_success');
      newUrlParams.delete('discord_error');
      
      const newUrl = window.location.pathname + (newUrlParams.toString() ? '?' + newUrlParams.toString() : '');
      window.history.replaceState({}, '', newUrl);
      
      refetch();
    } else if (urlParams.get('discord_error')) {
      toast.error('Failed to connect Discord. Please try again.');
      
      // Clean up URL - remove only Discord OAuth specific parameters
      const newUrlParams = new URLSearchParams(window.location.search);
      newUrlParams.delete('discord_success');
      newUrlParams.delete('discord_error');
      
      const newUrl = window.location.pathname + (newUrlParams.toString() ? '?' + newUrlParams.toString() : '');
      window.history.replaceState({}, '', newUrl);
    }
  }, [refetch]);

  const handleConnect = async () => {
    if (!publicKey) {
      toast.error('Please connect your wallet first');
      return;
    }

    setIsConnecting(true);
    
    try {
      // Store wallet address in session storage for the callback
      sessionStorage.setItem('wallet_address', publicKey.toString());
      
      // Redirect to Discord OAuth
      const discordAuthUrl = `/api/bot/auth/discord?wallet=${publicKey.toString()}`;
      window.location.href = discordAuthUrl;
    } catch (error) {
      console.error('Error initiating Discord connection:', error);
      toast.error('Failed to connect to Discord');
      setIsConnecting(false);
    }
  };

  const handleViewProfile = () => {
    // Navigate to notification setup page to view profile and manage settings
    window.location.href = '/notification-setup';
  };

  const openDiscordDMs = () => {
    // Open Discord in a new tab - users can check their DMs there
    window.open('https://discord.com/channels/@me', '_blank');
  };

  if (loading) {
    return (
      <Button disabled className="bg-[#5865F2] hover:bg-[#4752C4] text-white">
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
        Loading...
      </Button>
    );
  }

  if (isAuthenticated && user) {
    return (
      <div className="relative">
        <div 
          className="relative"
          onMouseEnter={() => showDMInfo && setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          <Button
            onClick={handleViewProfile}
            className="bg-[#5865F2] hover:bg-[#4752C4] text-white transition-all duration-200"
          >
            <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z"/>
            </svg>
            View Profile
            {showDMInfo && <InfoIcon className="w-3 h-3 ml-2 opacity-60" />}
          </Button>

          {/* Hover Tooltip */}
          {showDMInfo && showTooltip && (
            <div className="absolute top-full left-0 mt-2 w-80 bg-white border border-gray-200 rounded-lg shadow-lg p-4 z-50 transform transition-all duration-200 ease-out">
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0">
                  <InfoIcon className="h-5 w-5 text-blue-500 mt-0.5" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-gray-700 mb-3">
                    Check your Discord DMs for a welcome message!
                  </p>
                  <Button
                    onClick={openDiscordDMs}
                    variant="outline"
                    size="sm"
                    className="text-xs hover:bg-gray-50 transition-colors duration-150"
                  >
                    <ExternalLink className="h-3 w-3 mr-1" />
                    Open Discord
                  </Button>
                </div>
              </div>
              {/* Arrow pointing up */}
              <div className="absolute -top-2 left-4 w-4 h-4 bg-white border-l border-t border-gray-200 transform rotate-45"></div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <div 
        className="relative"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <Button
          onClick={handleConnect}
          disabled={!publicKey || isConnecting}
          className="bg-[#5865F2] hover:bg-[#4752C4] text-white transition-all duration-200 relative"
        >
          {isConnecting ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
              Connecting...
            </>
          ) : (
            <>
              <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z"/>
              </svg>
              Connect Discord
              <InfoIcon className="w-3 h-3 ml-2 opacity-60" />
            </>
          )}
        </Button>

        {/* Hover Tooltip */}
        {showTooltip && !isConnecting && (
          <div className="absolute top-full left-0 mt-2 w-72 bg-white border border-gray-200 rounded-lg shadow-lg p-4 z-50 transform transition-all duration-200 ease-out">
            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0">
                <InfoIcon className="h-5 w-5 text-blue-500 mt-0.5" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-gray-700">
                  After connecting, you&apos;ll receive a welcome message in your Discord DMs. Make sure your DMs are enabled for the best experience!
                </p>
              </div>
            </div>
            {/* Arrow pointing up */}
            <div className="absolute -top-2 left-4 w-4 h-4 bg-white border-l border-t border-gray-200 transform rotate-45"></div>
          </div>
        )}
      </div>
    </div>
  );
}