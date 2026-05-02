'use client';

import { Button } from '../ui/button';
import { toast } from 'sonner';
import { useDiscordAuth } from '@/hooks/useDiscordAuth';

interface DisconnectButtonProps {
  onDisconnect?: () => void;
  variant?: "default" | "outline" | "destructive" | "secondary" | "ghost" | "link";
  className?: string;
}

export default function DisconnectButton({ 
  onDisconnect, 
  variant = "outline",
  className = ""
}: DisconnectButtonProps) {
  const { isAuthenticated, logout } = useDiscordAuth();

  const handleDisconnect = async () => {
    try {
      await logout();
      toast.success('Successfully disconnected from Discord and removed from notifications');
      if (onDisconnect) {
        onDisconnect();
      }
    } catch (error) {
      console.error('Error disconnecting:', error);
      toast.error('Failed to disconnect from Discord');
    }
  };

  // Only show the disconnect button if user is authenticated
  if (!isAuthenticated) {
    return null;
  }

  return (
    <Button
      onClick={handleDisconnect}
      variant={variant}
      className={`text-red-600 hover:text-red-700 hover:bg-red-50 ${className}`}
    >
      Disconnect Discord
    </Button>
  );
}