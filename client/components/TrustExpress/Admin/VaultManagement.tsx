import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Search, AlertCircle, Info } from "lucide-react";
import { PublicKey } from '@solana/web3.js';
import useTrustExpress from '@/hooks/express/useTrustExpress';
import { toast } from 'sonner';

export function VaultManagement() {
  const { program } = useTrustExpress();

  const [vaultAddress, setVaultAddress] = useState('');
  const [vaultData, setVaultData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearchVault = async () => {
    if (!program) {
      toast.error('Program not initialized');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      
      const pubkey = new PublicKey(vaultAddress);
      
      // Fetch vault data from the program
      const data = await program.account.trustExpress.fetch(pubkey);
      setVaultData(data);
      
      toast.success('Vault loaded successfully');
    } catch (error) {
      console.error('Error fetching vault:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch vault data');
      toast.error('Failed to fetch vault data');
      setVaultData(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearSearch = () => {
    setVaultAddress('');
    setVaultData(null);
    setError(null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Vault Management</CardTitle>
        <CardDescription>
          View and monitor individual Trust Express vault details
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
            {vaultData && (
              <Button
                variant="outline"
                onClick={handleClearSearch}
              >
                Clear
              </Button>
            )}
          </div>
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-500 mt-2">
              <AlertCircle className="h-4 w-4" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Vault Details - Only show when vault is loaded */}
        {vaultData && (
          <div className="space-y-4 pt-4 border-t">
            {/* Vault Info */}
            <div className="p-4 bg-muted rounded-lg space-y-3">
              <h5 className="font-medium text-lg">Vault Information</h5>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div className="space-y-1">
                  <p className="text-muted-foreground">Maker</p>
                  <p className="font-mono text-xs break-all">{vaultData.maker?.toBase58()}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Mint</p>
                  <p className="font-mono text-xs break-all">{vaultData.mint?.toBase58()}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Type</p>
                  <p className="font-semibold">
                    {vaultData.escrowType === 0 ? '🔵 Buy Order' : '🟢 Sell Order'}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Available Amount</p>
                  <p className="font-semibold">{vaultData.amount?.toString()} tokens</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Price Per Token</p>
                  <p className="font-semibold">{vaultData.pricePerToken?.toString()}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Currency</p>
                  <p className="font-semibold">
                    {vaultData.currency ? String.fromCharCode(...vaultData.currency.filter((c: number) => c !== 0)) : 'N/A'}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Fee Percentage</p>
                  <p className="font-semibold">
                    {vaultData.feePercentage} basis points ({(vaultData.feePercentage / 100).toFixed(2)}%)
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Reserved Fee</p>
                  <p className="font-semibold">{vaultData.reservedFee?.toString() || '0'} tokens</p>
                </div>
              </div>
            </div>

            {/* Reservations */}
            <div className="p-4 bg-muted rounded-lg space-y-3">
              <h5 className="font-medium text-lg">Active Reservations</h5>
              {vaultData.reservedAmounts && vaultData.reservedAmounts.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    {vaultData.reservedAmounts.length} active reservation(s)
                  </p>
                  <div className="space-y-2">
                    {vaultData.reservedAmounts.map((reservation: any, index: number) => (
                      <div key={index} className="p-3 bg-background rounded border">
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-muted-foreground">Taker: </span>
                            <span className="font-mono">{reservation.taker?.toBase58().slice(0, 8)}...</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Amount: </span>
                            <span className="font-semibold">{reservation.amount?.toString()}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Status: </span>
                            <span className={`font-semibold ${
                              reservation.status === 0 ? 'text-yellow-500' :
                              reservation.status === 2 ? 'text-green-500' :
                              reservation.status === 3 ? 'text-red-500' : 'text-gray-500'
                            }`}>
                              {reservation.status === 0 ? 'Pending' :
                               reservation.status === 1 ? 'Payment Sent' :
                               reservation.status === 2 ? 'Completed' :
                               reservation.status === 3 ? 'Cancelled' : 'Disputed'}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Fiat: </span>
                            <span className="font-semibold">{reservation.fiatAmount?.toString()}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No active reservations</p>
              )}
            </div>

            {/* Payment Instructions */}
            {vaultData.paymentInstructions && (
              <div className="p-4 bg-muted rounded-lg space-y-2">
                <h5 className="font-medium">Payment Instructions</h5>
                <p className="text-sm whitespace-pre-wrap">{vaultData.paymentInstructions}</p>
              </div>
            )}

            {/* Flutterwave Credential */}
            {vaultData.flutterwaveCredentialId && (
              <div className="p-4 bg-muted rounded-lg space-y-2">
                <h5 className="font-medium">Flutterwave Integration</h5>
                <p className="text-sm">
                  <span className="text-muted-foreground">Credential ID: </span>
                  <span className="font-mono text-xs">{vaultData.flutterwaveCredentialId}</span>
                </p>
              </div>
            )}

            {/* Info Box */}
            <div className="p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg flex gap-3">
              <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-900 dark:text-blue-100 space-y-2">
                <p>
                  <strong>Global Controls:</strong> Use the Settings tab to pause/unpause buy or sell orders globally.
                </p>
                <p>
                  <strong>Vault Management:</strong> Individual vaults are controlled by the global pause settings. When buy/sell orders are globally paused, all respective vaults are affected.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!vaultData && !error && (
          <div className="text-center py-8 text-muted-foreground space-y-2">
            <p>Enter a vault address above to view its details</p>
            <p className="text-sm">You can monitor vault status, reservations, and configuration</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}