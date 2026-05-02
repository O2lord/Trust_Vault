'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import UserProfile from '@/components/discord/UserProfile';
import NotificationSettingsPanel from '@/components/discord/notifications/SettingsPanel';
import StatusCard from '@/components/discord/notifications/StatusCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { InfoIcon, ArrowLeft, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

export default function NotificationSetupContent() {
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const { publicKey } = useWallet();
  const searchParams = useSearchParams();

  const welcomeDmFailed = searchParams.get('welcome_dm_failed') === 'true';

  useEffect(() => {
    checkConnection();
  }, []);

  const checkConnection = async () => {
    try {
      const response = await fetch('./api/bot/user/profile');
      setIsConnected(response.ok);
    } catch (error) {
      console.error('Error checking connection:', error);
      setIsConnected(false);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-300 rounded w-1/3"></div>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="h-64 bg-gray-300 rounded"></div>
            <div className="h-64 bg-gray-300 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  const DISCORD_SERVER_INVITE_LINK = process.env.NEXT_PUBLIC_DISCORD_SERVER_INVITE_LINK || "https://discord.gg/34vsB6xx";

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center space-x-4">
        <Link href="/explorer">
          <Button variant={"gradient"} size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Explorer
          </Button>
        </Link>
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Discord Profile & Notifications</h1>
          <p className="text-muted-foreground">
            Manage your Discord connection and notification preferences
          </p>
        </div>
      </div>

      <Alert>
        <InfoIcon className="h-4 w-4" />
        <AlertDescription>
          {isConnected 
            ? "Your Discord account is connected. You can manage your notification preferences below."
            : "Connect your Discord account from the Explorer page to start receiving notifications for Trust Vault events."
          }
        </AlertDescription>
      </Alert>

      {welcomeDmFailed && (
        <Alert variant="destructive">
          <TriangleAlert className="h-4 w-4" />
          <AlertTitle>Welcome Message Failed!</AlertTitle>
          <AlertDescription>
            We couldn&apos;t send you a welcome message on Discord. This usually happens if your privacy settings block DMs from non-friends.
            To ensure you receive notifications, please adjust your Discord privacy settings and join our dicord server using this link: {' '}
            <a href={DISCORD_SERVER_INVITE_LINK} target="_blank" rel="noopener noreferrer" className="underline font-medium text-blue-500">
              Discord Server
            </a>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-6">
          {!isConnected ? (
            <Card>
              <CardHeader>
                <CardTitle>Connect Discord</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Go back to the Explorer page to connect your Discord account
                </p>
                <Link href="/explorer">
                  <Button className="w-full">
                    Go to Explorer
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <UserProfile />
          )}

          <StatusCard />
        </div>

        <div className="space-y-6">
          {isConnected && (
            <NotificationSettingsPanel />
          )}
        </div>
      </div>
    </div>
  );
}