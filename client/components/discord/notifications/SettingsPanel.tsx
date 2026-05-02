'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

interface NotificationPreferences {
  trust_vault_created: boolean;
  payment_confirmed: boolean;
  payment_sent: boolean;
  reservation_cancelled: boolean;
  withdrawal_event: boolean;
  tokens_reserved: boolean;
  dispute_created: boolean;
  dispute_resolved: boolean;
  buy_order_created: boolean;
  buy_order_reserved: boolean;
  buy_order_cancelled: boolean;
  buy_order_reduced: boolean;
  buyer_payment_sent: boolean;
  seller_confirms_payment: boolean;
  price_updated: boolean; 
  trust_vault_closed: boolean; 
  // TRUST EXPRESS
  express_buy_order_created: boolean;
  instant_payment_reserved: boolean;
  express_buy_order_cancelled: boolean;
  express_buy_order_reduced: boolean;
  instant_payment_payout_result: boolean;
  express_price_updated: boolean; 
}

const notificationLabels: Record<keyof NotificationPreferences, string> = {
  trust_vault_created: 'Trust Vault Created',
  payment_confirmed: 'Payment Confirmed',
  payment_sent: 'Payment Sent',
  reservation_cancelled: 'Reservation Cancelled',
  withdrawal_event: 'Withdrawal Events',
  tokens_reserved: 'Tokens Reserved',
  dispute_created: 'Dispute Created',
  dispute_resolved: 'Dispute Resolved',
  buy_order_created: 'Buy Order Created',
  buy_order_reserved: 'Buy Order Reserved',
  buy_order_cancelled: 'Buy Order Cancelled',
  buy_order_reduced: 'Buy Order Reduced',
  price_updated: 'Price Updated',
  trust_vault_closed: 'Trust Vault Closed',
  buyer_payment_sent: 'Buyer Payment Sent',
  seller_confirms_payment: 'Seller Confirms Payment',
  // TRUST EXPRESS
  express_buy_order_created: 'express buy order created',
  instant_payment_reserved: 'instant payment reserved',
  express_buy_order_cancelled: 'express buy order cancelled',
  express_buy_order_reduced: 'express buy order reduced',
  instant_payment_payout_result: 'instant payment payout result',
  express_price_updated: 'express price updated', 
};

export default function NotificationSettingsPanel() {
  const [preferences, setPreferences] = useState<NotificationPreferences>({
    trust_vault_created: true,
    payment_confirmed: true,
    payment_sent: true,
    reservation_cancelled: true,
    withdrawal_event: true,
    tokens_reserved: true,
    dispute_created: true,
    dispute_resolved: true,
    buy_order_created: true,
    buy_order_reserved: true,
    buy_order_cancelled: true,
    price_updated: true,
    trust_vault_closed: true,
    buy_order_reduced: true,
    buyer_payment_sent: true,
    seller_confirms_payment: true,
    // TRUST EXPRESS
    express_buy_order_created: true,
    instant_payment_reserved: true,
    express_buy_order_cancelled: true,
    express_buy_order_reduced: true,
    instant_payment_payout_result: true,
    express_price_updated: true,
  });
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchPreferences();
  }, []);

  const fetchPreferences = async () => {
    try {
      const response = await fetch('/api/bot/user/notifications');
      if (response.ok) {
        const data = await response.json();
        setPreferences(data.notification_preferences || preferences);
      }
    } catch (error) {
      console.error('Error fetching preferences:', error);
    } finally {
      setLoading(false);
    }
  };

  const updatePreference = (key: keyof NotificationPreferences, value: boolean) => {
    setPreferences(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const savePreferences = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/bot/user/notifications', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ notification_preferences: preferences }),
      });

      if (response.ok) {
        toast.success('Notification preferences saved');
      } else {
        toast.error('Failed to save preferences');
      }
    } catch (error) {
      console.error('Error saving preferences:', error);
      toast.error('Failed to save preferences');
    } finally {
      setSaving(false);
    }
  };

  const enableAll = () => {
    const allEnabled = Object.keys(preferences).reduce((acc, key) => ({
      ...acc,
      [key]: true
    }), {} as NotificationPreferences);
    setPreferences(allEnabled);
  };

  const disableAll = () => {
    const allDisabled = Object.keys(preferences).reduce((acc, key) => ({
      ...acc,
      [key]: false
    }), {} as NotificationPreferences);
    setPreferences(allDisabled);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="h-4 bg-gray-300 rounded w-1/2"></div>
                <div className="h-6 bg-gray-300 rounded w-12"></div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Notification Preferences</span>
          <div className="space-x-2 flex items-center">
            <Button onClick={enableAll} variant="outline" size="sm">
              Enable All
            </Button>
            <Button onClick={disableAll} variant="outline" size="sm">
              Disable All
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4">
          {Object.entries(notificationLabels).map(([key, label]) => (
            <div key={key} className="flex items-center justify-between">
              <Label htmlFor={key} className="text-sm font-medium">
                {label}
              </Label>
              <Switch
                id={key}
                checked={preferences[key as keyof NotificationPreferences]}
                onCheckedChange={(checked) => 
                  updatePreference(key as keyof NotificationPreferences, checked)
                }
              />
            </div>
          ))}
        </div>

        <div className="pt-4 border-t">
          <Button 
            onClick={savePreferences} 
            disabled={saving}
            className="w-full"
          >
            {saving ? 'Saving...' : 'Save Preferences'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
