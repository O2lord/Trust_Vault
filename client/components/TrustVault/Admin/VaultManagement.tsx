import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Loader2, Search } from "lucide-react";
import { PublicKey } from '@solana/web3.js';
import useTrustExpress  from '@/hooks/express/useTrustExpress';
import { toast } from 'sonner';

export function VaultManagement() {
  const {
    pauseVaultWithdrawals,
    pauseVaultReservations,
  } = useTrustExpress();

  const [vaultAddress, setVaultAddress] = useState('');
  const [vaultData, setVaultData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isTogglingWithdrawals, setIsTogglingWithdrawals] = useState(false);
  const [isTogglingReservations, setIsTogglingReservations] = useState(false);

  const handleSearchVault = async () => {
    try {
      setIsLoading(true);
      const pubkey = new PublicKey(vaultAddress);
      
      // Fetch vault data here - you'll need to implement this based on your program
      // For now, we'll use a placeholder
      // const data = await program.account.trustExpress.fetch(pubkey);
      // setVaultData(data);
      
      toast.success('Vault found');
    } catch (error) {
      console.error('Error fetching vault:', error);
      toast.error('Failed to fetch vault data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleWithdrawals = async (paused: boolean) => {
    try {
      setIsTogglingWithdrawals(true);
      const pubkey = new PublicKey(vaultAddress);
      await pauseVaultWithdrawals(pubkey, paused);
      toast.success(`Withdrawals ${paused ? 'paused' : 'unpaused'} successfully`);
      await handleSearchVault();
    } catch (error) {
      console.error('Error toggling withdrawals:', error);
      toast.error('Failed to toggle withdrawals');
    } finally {
      setIsTogglingWithdrawals(false);
    }
  };

  const handleToggleReservations = async (paused: boolean) => {
    try {
      setIsTogglingReservations(true);
      const pubkey = new PublicKey(vaultAddress);
      await pauseVaultReservations(pubkey, paused);
      toast.success(`Reservations ${paused ? 'paused' : 'unpaused'} successfully`);
      await handleSearchVault();
    } catch (error) {
      console.error('Error toggling reservations:', error);
      toast.error('Failed to toggle reservations');
    } finally {
      setIsTogglingReservations(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Vault Management</CardTitle>
        <CardDescription>
          Control individual vault settings
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search Vault */}
        <div className="space-y-2">
          <Label htmlFor="vault-address">Vault Address</Label>
          <div className="flex gap-2">
            <Input
              id="vault-address"
              value={vaultAddress}
              onChange={(e) => setVaultAddress(e.target.value)}
              placeholder="Enter Trust Express vault address"
              className="font-mono text-sm"
            />
            <Button
              onClick={handleSearchVault}
              disabled={isLoading || !vaultAddress}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  Search
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Vault Controls - Only show when vault is loaded */}
        {vaultData && (
          <div className="space-y-4 pt-4 border-t">
            <div className="space-y-2">
              <h4 className="font-semibold">Vault Controls</h4>
              
              {/* Withdrawals Toggle */}
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="space-y-0.5">
                  <Label>Withdrawals</Label>
                  <p className="text-sm text-muted-foreground">
                    {vaultData?.withdrawalsPaused ? 'Currently paused' : 'Currently active'}
                  </p>
                </div>
                <Switch
                  checked={!vaultData?.withdrawalsPaused}
                  onCheckedChange={(checked) => handleToggleWithdrawals(!checked)}
                  disabled={isTogglingWithdrawals}
                />
              </div>

              {/* Reservations Toggle */}
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="space-y-0.5">
                  <Label>Reservations</Label>
                  <p className="text-sm text-muted-foreground">
                    {vaultData?.reservationsPaused ? 'Currently paused' : 'Currently active'}
                  </p>
                </div>
                <Switch
                  checked={!vaultData?.reservationsPaused}
                  onCheckedChange={(checked) => handleToggleReservations(!checked)}
                  disabled={isTogglingReservations}
                />
              </div>
            </div>

            {/* Vault Info */}
            <div className="p-4 bg-muted rounded-lg space-y-2">
              <h5 className="font-medium">Vault Information</h5>
              <div className="text-sm space-y-1">
                <p><span className="text-muted-foreground">Maker:</span> {vaultData?.maker?.toBase58()}</p>
                <p><span className="text-muted-foreground">Amount:</span> {vaultData?.amount?.toString()}</p>
                <p><span className="text-muted-foreground">Type:</span> {vaultData?.escrowType === 0 ? 'Buy Order' : 'Sell Order'}</p>
              </div>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!vaultData && (
          <div className="text-center py-8 text-muted-foreground">
            <p>Enter a vault address to manage its settings</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}