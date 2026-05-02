'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Badge } from '../ui/badge';
import { useWallet } from '@solana/wallet-adapter-react';
import { toast } from 'sonner';
import DisconnectButton from './DisconnectButton'

interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  email?: string;
}

interface UserProfile {
  discord_user: DiscordUser;
  wallet_address: string;
  created_at: string;
}

export default function UserProfile() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const { publicKey } = useWallet();

  useEffect(() => {
    if (publicKey) {
      fetchProfile();
    } else {
      setProfile(null);
      setLoading(false);
    }
  }, [publicKey]);

  const fetchProfile = async () => {
    try {
      const response = await fetch('/api/bot/user/profile');
      if (response.ok) {
        const data = await response.json();
        setProfile(data);
      } else {
        setProfile(null);
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnectComplete = () => {
    // Clear the profile state when user disconnects
    setProfile(null);
    toast.success('You will no longer receive Discord notifications');
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse flex space-x-4">
            <div className="rounded-full bg-gray-300 h-12 w-12"></div>
            <div className="flex-1 space-y-2 py-1">
              <div className="h-4 bg-gray-300 rounded w-3/4"></div>
              <div className="h-4 bg-gray-300 rounded w-1/2"></div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!profile) {
    return null;
  }

  const avatarUrl = profile.discord_user.avatar
    ? `https://cdn.discordapp.com/avatars/${profile.discord_user.id}/${profile.discord_user.avatar}.png`
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Discord Profile</span>
          <Badge variant="outline" className="bg-green-100 text-green-800">
            Connected
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center space-x-4">
          <Avatar className="h-12 w-12">
            <AvatarImage src={avatarUrl || undefined} />
            <AvatarFallback>
              {profile.discord_user.username.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="font-medium">
              {profile.discord_user.username}
              {profile.discord_user.discriminator !== '0' && 
                `#${profile.discord_user.discriminator}`
              }
            </p>
            <p className="text-sm text-muted-foreground">
              ID: {profile.discord_user.id}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <div>
            <p className="text-sm font-medium">Wallet Address</p>
            <p className="text-sm text-muted-foreground font-mono">
              {profile.wallet_address}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">Connected Since</p>
            <p className="text-sm text-muted-foreground">
              {new Date(profile.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>
        
        <div className="pt-2 border-t">
          <p className="text-sm text-muted-foreground mb-3">
            Disconnecting will remove you from all Trust Vault notifications and delete your data from our system.
          </p>
          <DisconnectButton onDisconnect={handleDisconnectComplete} />
        </div>
      </CardContent>
    </Card>
  );
}