import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";
import { PublicKey } from '@solana/web3.js';
import useTrustExpress from '@/hooks/express/useTrustExpress';
import { toast } from 'sonner';

interface AdminSettingsProps {
  globalState?: any;
  onUpdate?: () => void;
}

export function AdminSettings({ globalState, onUpdate }: AdminSettingsProps) {
  const {
    updateFeePercentage,
    updateFeeDestination,
    pauseBuyOrders,
    pauseSellOrders,
  } = useTrustExpress();

  const [feePercentage, setFeePercentage] = useState(
    globalState?.feePercentage?.toString() || '5'
  );
  const [feeDestination, setFeeDestination] = useState(
    globalState?.feeDestination?.toBase58() || ''
  );
  const [isUpdatingFee, setIsUpdatingFee] = useState(false);
  const [isUpdatingDestination, setIsUpdatingDestination] = useState(false);
  const [isTogglingBuyOrders, setIsTogglingBuyOrders] = useState(false);
  const [isTogglingSellOrders, setIsTogglingSellOrders] = useState(false);

  const { setGlobalStats } = useTrustExpress();
const [seedVolume, setSeedVolume] = useState('');
const [seedConfirmations, setSeedConfirmations] = useState('');
const [isSeedingStats, setIsSeedingStats] = useState(false);

  const handleUpdateFeePercentage = async () => {
    try {
      setIsUpdatingFee(true);
      const feeValue = parseInt(feePercentage);
      
      if (isNaN(feeValue) || feeValue < 0 || feeValue > 1000) {
        toast.error('Fee must be between 0 and 1000 basis points (0-10%)');
        return;
      }

      await updateFeePercentage(feeValue);
      toast.success('Fee percentage updated successfully');
      onUpdate?.();
    } catch (error) {
      console.error('Error updating fee percentage:', error);
      toast.error('Failed to update fee percentage');
    } finally {
      setIsUpdatingFee(false);
    }
  };

  const handleUpdateFeeDestination = async () => {
    try {
      setIsUpdatingDestination(true);
      const destination = new PublicKey(feeDestination);
      await updateFeeDestination(destination);
      toast.success('Fee destination updated successfully');
      onUpdate?.();
    } catch (error) {
      console.error('Error updating fee destination:', error);
      toast.error('Failed to update fee destination');
    } finally {
      setIsUpdatingDestination(false);
    }
  };

  const handleToggleBuyOrders = async (paused: boolean) => {
    try {
      setIsTogglingBuyOrders(true);
      await pauseBuyOrders(paused);
      toast.success(`Buy orders ${paused ? 'paused' : 'unpaused'} successfully`);
      onUpdate?.();
    } catch (error) {
      console.error('Error toggling buy orders:', error);
      toast.error('Failed to toggle buy orders');
    } finally {
      setIsTogglingBuyOrders(false);
    }
  };

  const handleToggleSellOrders = async (paused: boolean) => {
    try {
      setIsTogglingSellOrders(true);
      await pauseSellOrders(paused);
      toast.success(`Sell orders ${paused ? 'paused' : 'unpaused'} successfully`);
      onUpdate?.();
    } catch (error) {
      console.error('Error toggling sell orders:', error);
      toast.error('Failed to toggle sell orders');
    } finally {
      setIsTogglingSellOrders(false);
    }
  };

 const handleSeedStats = async () => {
  try {
    setIsSeedingStats(true);
    const decimals = 9;
    await setGlobalStats({
      // multiply by 10^9 so user can just type "1000" meaning $1000
      totalVolume: seedVolume ? Math.floor(Number(seedVolume) * Math.pow(10, decimals)) : undefined,
      totalConfirmations: seedConfirmations ? Number(seedConfirmations) : undefined,
    });
    toast.success('Global stats seeded successfully');
    onUpdate?.();
  } catch (error) {
    console.error('Error seeding stats:', error);
    toast.error('Failed to seed stats');
  } finally {
    setIsSeedingStats(false);
  }
};

  return (
    <div className="space-y-6">
      {/* Fee Management */}
      <Card>
        <CardHeader>
          <CardTitle>Fee Management</CardTitle>
          <CardDescription>
            Configure platform fees and fee destination
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Fee Percentage */}
          <div className="space-y-2">
            <Label htmlFor="fee-percentage">
              Fee Percentage (Basis Points)
            </Label>
            <div className="flex gap-2">
              <Input
                id="fee-percentage"
                type="number"
                min="0"
                max="1000"
                value={feePercentage}
                onChange={(e) => setFeePercentage(e.target.value)}
                placeholder="5"
              />
              <Button
                onClick={handleUpdateFeePercentage}
                disabled={isUpdatingFee}
              >
                {isUpdatingFee ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  'Update'
                )}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Current: {feePercentage} basis points ({(parseInt(feePercentage) / 100).toFixed(2)}%)
              <br />
              Maximum: 1000 basis points (10%)
            </p>
          </div>

          {/* Fee Destination */}
          <div className="space-y-2">
            <Label htmlFor="fee-destination">Fee Destination Address</Label>
            <div className="flex gap-2">
              <Input
                id="fee-destination"
                value={feeDestination}
                onChange={(e) => setFeeDestination(e.target.value)}
                placeholder="Enter Solana address"
                className="font-mono text-sm"
              />
              <Button
                onClick={handleUpdateFeeDestination}
                disabled={isUpdatingDestination}
              >
                {isUpdatingDestination ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  'Update'
                )}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Address where platform fees will be sent
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Order Controls */}
      <Card>
        <CardHeader>
          <CardTitle>Order Controls</CardTitle>
          <CardDescription>
            Pause or resume buy and sell orders globally
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Buy Orders */}
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="space-y-0.5">
              <Label>Buy Orders</Label>
              <p className="text-sm text-muted-foreground">
                {globalState?.buyOrdersPaused ? 'Currently paused' : 'Currently active'}
              </p>
            </div>
            <Switch
              checked={!globalState?.buyOrdersPaused}
              onCheckedChange={(checked) => handleToggleBuyOrders(!checked)}
              disabled={isTogglingBuyOrders}
            />
          </div>

          {/* Sell Orders */}
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="space-y-0.5">
              <Label>Sell Orders</Label>
              <p className="text-sm text-muted-foreground">
                {globalState?.sellOrdersPaused ? 'Currently paused' : 'Currently active'}
              </p>
            </div>
            <Switch
              checked={!globalState?.sellOrdersPaused}
              onCheckedChange={(checked) => handleToggleSellOrders(!checked)}
              disabled={isTogglingSellOrders}
            />
          </div>
        </CardContent>
      </Card>
      {/* Seed Global Stats */}
      <Card>
        <CardHeader>
          <CardTitle>Seed Global Stats</CardTitle>
          <CardDescription>
            Manually set on-chain stats to backfill historical data. Values are in raw token units (multiply by 10^9 for USDC).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Total Volume (raw)</Label>
              <Input
                type="number"
                placeholder="e.g. 1500000000000"
                value={seedVolume}
                onChange={e => setSeedVolume(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Enter dollar value e.g. "1000" = $1,000. Stored as {seedVolume ? (Number(seedVolume) * 1e9).toLocaleString() : '0'} raw units.
              </p>
            </div>
            <div className="space-y-1">
              <Label>Total Confirmations</Label>
              <Input
                type="number"
                placeholder="e.g. 16"
                value={seedConfirmations}
                onChange={e => setSeedConfirmations(e.target.value)}
              />
            </div>
          </div>
          <Button onClick={handleSeedStats} disabled={isSeedingStats}>
            {isSeedingStats ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Seeding...</> : 'Seed Stats'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}