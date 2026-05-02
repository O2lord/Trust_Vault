'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useWallet } from '@solana/wallet-adapter-react';
import { CheckCircle } from 'lucide-react';

export default function WalletInput() {
  const [connectedWallets, setConnectedWallets] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const { publicKey } = useWallet();

  useEffect(() => {
    fetchConnectedWallets();
  }, []);

  const fetchConnectedWallets = async () => {
    try {
      const response = await fetch('/api/bot/user/wallet');
      if (response.ok) {
        const data = await response.json();
        setConnectedWallets(data.wallets || []);
      }
    } catch (error) {
      console.error('Error fetching wallets:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-gray-300 rounded w-1/2"></div>
            <div className="h-4 bg-gray-300 rounded w-3/4"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connected Wallet</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {publicKey ? (
          <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-950 rounded-md border border-green-200 dark:border-green-800">
            <div className="flex items-center space-x-3">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <div>
                <p className="font-medium text-green-800 dark:text-green-300">
                  Wallet Connected
                </p>
                <p className="text-sm text-green-600 dark:text-green-400 font-mono">
                  {publicKey.toString().substring(0, 8)}...{publicKey.toString().substring(-8)}
                </p>
              </div>
            </div>
            <Badge variant="outline" className="bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-300">
              Active
            </Badge>
          </div>
        ) : (
          <div className="p-3 bg-amber-50 dark:bg-amber-950 rounded-md border border-amber-200 dark:border-amber-800">
            <p className="text-amber-800 dark:text-amber-300">
              No wallet connected. Connect your wallet to receive notifications.
            </p>
          </div>
        )}
        
        <div className="text-sm text-muted-foreground">
          <p>
            Your connected wallet will receive notifications for all Trust Vault activities.
            Only one wallet can be connected at a time.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}