"use client";
import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { LockIcon, Loader2, ShieldAlert, RefreshCcw } from "lucide-react";
import { toast } from "sonner";
import useTrustVaultProgram from "@/hooks/useTrustVaultProgram";
import { PublicKey } from "@solana/web3.js";
import { useQueryClient } from "@tanstack/react-query";
import { useTokenMetadata } from "@/hooks/useTokenMetadata";
import TokenDisplay from "@/components/ui/token-display";


type Props = {
  disabled: boolean | null;
  trustVault: PublicKey;
  mint: PublicKey;
  vaultBalance: number | null;
  availableTokens?: number | null; 
  pricePerToken: number;
  currency: string;
  paymentInstructions?: string;
  pendingReservations?: number; 
};

const ReserveTokensButton: React.FC<Props> = ({ 
  disabled, 
  trustVault, 
  mint, 
  vaultBalance,
  availableTokens, 
  pricePerToken,
  currency,
  pendingReservations = 0, 
}) => {
  const queryClient = useQueryClient();
  const { reserveTokens } = useTrustVaultProgram();
  const [reserveAmount, setReserveAmount] = useState<string>("");
  const [fiatAmount, setFiatAmount] = useState<number>(0);
  const [open, setOpen] = useState(false);
  const tokenMetadata = useTokenMetadata(mint);

  // Calculate fiat amount whenever token amount changes
  useEffect(() => {
    const tokenAmount = parseFloat(reserveAmount);
    if (!isNaN(tokenAmount)) {
      setFiatAmount(tokenAmount * pricePerToken);
    } else {
      setFiatAmount(0);
    }
  }, [reserveAmount, pricePerToken]);

  // Force refresh trustVault data when dialog opens
  useEffect(() => {
    if (open) {
      // Refresh data immediately when the dialog is opened
      queryClient.invalidateQueries({
        queryKey: ["get-trustVault-accounts"],
        refetchType: "active"
      });
    }
  }, [open, queryClient]);

  const handleReserve = useCallback(async () => {
    const parsedAmount = parseFloat(reserveAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      toast.error("Please enter a valid reserve amount.");
      return;
    }

    // Check against available tokens first, fallback to vault balance
    const tokensToCheck = availableTokens !== null && availableTokens !== undefined
      ? availableTokens
      : vaultBalance;
    
    if (tokensToCheck === null) {
      toast.error("Token balance is unavailable.");
      return;
    }
    
    if (parsedAmount > tokensToCheck) {
      toast.error(`Reserve amount (${parsedAmount}) exceeds available tokens (${tokensToCheck}).`);
      return;
    }

    toast.promise(
      reserveTokens.mutateAsync({ trustVault, amount: parsedAmount }).then(() => {
        // Reset form state
        setReserveAmount("");
        setFiatAmount(0);
        setOpen(false);
        
        // Force immediate refetch to update UI
        return queryClient.invalidateQueries({
          queryKey: ["get-trustVault-accounts"],
          refetchType: "active",
        });
      }),
      {
        loading: "Reserving tokens...",
        success: "Tokens reserved successfully",
        error: "Failed to reserve tokens",
      }
    );
  }, [reserveAmount, availableTokens, vaultBalance, trustVault, reserveTokens, queryClient]);

  const handleHalfReserve = useCallback(() => {
    if (availableTokens !== null && availableTokens !== undefined) {
      const halfAvailable = (availableTokens / 2).toString();
      setReserveAmount(halfAvailable);
    } else if (vaultBalance !== null) {
      const halfBalance = (vaultBalance / 2).toString();
      setReserveAmount(halfBalance);
    }
  }, [availableTokens, vaultBalance]);

  const handleMaxReserve = useCallback(() => {
    if (availableTokens !== null && availableTokens !== undefined) {
      const maxAvailable = availableTokens.toString();
      setReserveAmount(maxAvailable);
    } else if (vaultBalance !== null) {
      const maxBalance = vaultBalance.toString();
      setReserveAmount(maxBalance);
    }
  }, [availableTokens, vaultBalance]);

  // Handle manual refresh
  const handleRefresh = useCallback(() => {
    // Refresh trust vault data
    queryClient.invalidateQueries({
      queryKey: ["get-trust-vault-accounts"],
      refetchType: "active"
    });
    
    toast.info("Refreshing trust vault data...");
  }, [queryClient]);

  // Format currency for display
  const formatCurrency = useCallback((amount: number) => {
    return new Intl.NumberFormat('en-US', { 
      style: 'decimal', 
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount) + " " + currency;
  }, [currency]);

  // Debug logging - only in development
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      
    }
  }, [availableTokens, vaultBalance]);

  // Ensure the disabled prop is always a boolean value, default to false if null
  const isDisabled = disabled ?? false;
  
  // Check if there are no available tokens - memoized to prevent recalculation
  const tokens = useMemo(() => {
    return availableTokens !== undefined && availableTokens !== null
      ? availableTokens
      : vaultBalance;
  }, [availableTokens, vaultBalance]);
  
  const noAvailableTokens = useMemo(() => {
    return tokens !== null && tokens <= 0;
  }, [tokens]);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <Button
        asChild
        className={`w-full ${
          isDisabled || noAvailableTokens ? "cursor-not-allowed opacity-50" : "cursor-pointer"
        }`}
        disabled={isDisabled || noAvailableTokens || reserveTokens.isPending}
      >
        <div>
        <AlertDialogTrigger
            disabled={isDisabled || noAvailableTokens || reserveTokens.isPending}
            className={`flex items-center ${isDisabled || noAvailableTokens ? "cursor-not-allowed" : ""}`}
          >
            {reserveTokens.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : noAvailableTokens ? (
              <ShieldAlert className="w-4 h-4 mr-2" />
            ) : (
              <LockIcon className="w-4 h-4 mr-2" />
            )}
            {noAvailableTokens ? "No Available Tokens" : "Buy Tokens"}
          </AlertDialogTrigger>
        </div>
      </Button>
      <AlertDialogContent className="border border-gray-700 rounded-lg bg-gray-800/50 backdrop-blur-sm">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center justify-between">
            <span>Buy Tokens</span>
            <Button 
              onClick={handleRefresh} 
              variant="ghost" 
              size="sm" 
              className="h-8 w-8 p-0 rounded-full"
            >
              <RefreshCcw className="h-4 w-4" />
              <span className="sr-only">Refresh</span>
            </Button>
          </AlertDialogTitle>
          <AlertDialogDescription>
            This will reserve tokens from the vault. You will need to complete the payment
            according to the provided instructions.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* Display total and available token information */}
        <div className="bg-gray-900/80 rounded-lg p-4 border border-gray-600">
          <div className="flex justify-between">
            <span>Available to buy:</span>
            <TokenDisplay
              amount={availableTokens !== null && availableTokens !== undefined ? availableTokens.toFixed(2) : "Loading..."}
              symbol={tokenMetadata?.metadata?.symbol || "Token"}
              logoURI={tokenMetadata?.metadata?.logoURI}
            />
          </div>
          {pendingReservations > 0 && (
            <div className="flex justify-between mt-1 text-amber-600 dark:text-amber-400">
              <span>Pending reservations:</span>
              <span>{pendingReservations}</span>
            </div>
          )}
        </div>

        <div className="flex gap-4 mt-4">
          <Button variant="outline" onClick={handleHalfReserve} disabled={noAvailableTokens}>
            Half
          </Button>
          <Button variant="outline" onClick={handleMaxReserve} disabled={noAvailableTokens}>
            Max
          </Button>
        </div>

        <input
          type="number"
          value={reserveAmount}
          onChange={(e) => setReserveAmount(e.target.value)}
          placeholder="Enter amount you want to buy"
          className="mt-4 p-4 rounded-md border border-gray-700 bg-gray-800/50 backdrop-blur-sm"
          disabled={noAvailableTokens}
        />
        
        {/* Display payment calculation with explicit multiplication */}
        {parseFloat(reserveAmount) > 0 && (
          <div className="mt-4 p-4 rounded-md border border-gray-700 bg-gray-800/50 backdrop-blur-sm">
            <div className="font-medium">Payment Summary:</div>
           <div className="flex justify-between mt-2">
              <span>Buying:</span>
              <TokenDisplay
                amount={parseFloat(reserveAmount).toFixed(2)}
                symbol={tokenMetadata?.metadata?.symbol || "Token"}
                logoURI={tokenMetadata?.metadata?.logoURI}
              />
            </div>
            <div className="flex justify-between mt-1">
              <span>At the Price  of:</span>
              <span>{formatCurrency(pricePerToken)}</span>
            </div>
            <div className="flex justify-between mt-1 pt-2 border-t border-gray-200 font-medium">
              <span>Total to pay:</span>
              <span>{formatCurrency(fiatAmount)}</span>
            </div>
          </div>
        )}
        <AlertDialogFooter className="mt-4">
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction 
            onClick={handleReserve} 
            disabled={isDisabled || noAvailableTokens || reserveTokens.isPending}
          >
            {reserveTokens.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <LockIcon className="w-4 h-4 mr-2" />
            )}
            Confirm Buy
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default ReserveTokensButton;