'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface BotStatus {
  online: boolean;
  last_seen: string;
  events_processed: number;
  notifications_sent: number;
}

export default function StatusCard() {
  const [status, setStatus] = useState<BotStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000); // Update every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchStatus = async () => {
    try {
      const response = await fetch('/api/bot/status');
      if (response.ok) {
        const data = await response.json();
        setStatus(data);
      }
    } catch (error) {
      console.error('Error fetching bot status:', error);
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
        <CardTitle className="flex items-center justify-between">
          <span>Bot Status</span>
          <Badge variant={status?.online ? "default" : "destructive"}>
            {status?.online ? "Online" : "Offline"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {status && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium">Events Processed</p>
                <p className="text-2xl font-bold">{status.events_processed}</p>
              </div>
              <div>
                <p className="text-sm font-medium">Notifications Sent</p>
                <p className="text-2xl font-bold">{status.notifications_sent}</p>
              </div>
            </div>
            <div>
              <p className="text-sm font-medium">Last Seen</p>
              <p className="text-sm text-muted-foreground">
                {new Date(status.last_seen).toLocaleString()}
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}