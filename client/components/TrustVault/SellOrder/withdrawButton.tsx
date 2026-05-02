"use client";
import { PublicKey } from "@solana/web3.js";
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
import { BicepsFlexed, RefreshCwOff, Info, Loader2 } from "lucide-react";
import { useCallback, useState, useEffect } from "react";
import { toast } from "sonner";
import { useConnection } from "@solana/wallet-adapter-react";
import useTrustVaultProgram from "@/hooks/useTrustVaultProgram";
import { useFeeInfoLogic } from "@/hooks/queries/useFeeInfo";
import { useTrustVaultInfo } from "@/hooks/queries/useTrustVaultInfo";
import { useQueryClient } from "@tanstack/react-query";
import { closeVault } from "@/lib/encryptionApi";
import { getAvailableTrustVaultBalance } from "@/utils/calculations";

type Props = {
  trustVault: PublicKey;
  mint: PublicKey;
  vaultBalance: number | null;  
  originalDeposit: number; 
  disabled?: boolean;
};

const WithdrawalButton: React.FC<Props> = ({ trustVault, originalDeposit, disabled }) => {
  const queryClient = useQueryClient();
  const { withdraw, program} = useTrustVaultProgram();
  const { getTrustVaultInfo } = useTrustVaultInfo(program);
  const {connection} = useConnection();
  const { getTrustVaultFeeInfo } = useFeeInfoLogic(getTrustVaultInfo);
  const [withdrawAmount, setWithdrawAmount] = useState<string>("");
  const [availableBalance, setAvailableBalance] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [feeInfo, setFeeInfo] = useState<{
    feePercentage: number;
    feeDestination: PublicKey;
    feeWithdrawAmount: number;
    remainingFeeBalance: number;
  }>({
    feePercentage: 0,
    feeDestination: PublicKey.default,
    feeWithdrawAmount: 0,
    remainingFeeBalance: 0
  });

  // Fetch available balance and fee information when dialog opens
  const fetchBalanceAndFees = useCallback(async () => {
    if (!trustVault) return;
    
   
    setIsLoading(true);
    try {
      // Fetch the actual available balance (excluding active reservations)
      const balanceInfo = await getAvailableTrustVaultBalance(trustVault, getTrustVaultInfo, connection);
      const trustVaultInfo = await getTrustVaultInfo(trustVault);
      const decimals = 9; // Default to 9 decimals if not available
      
    
      // Convert from raw units to UI units
      const availableForWithdrawal = balanceInfo.available.toNumber() / Math.pow(10, decimals);
     
      
      setAvailableBalance(availableForWithdrawal);
     
      
      // Fetch fee information from the smart contract
      const feeDetails = await getTrustVaultFeeInfo(trustVault);
    
      
      // Get the reserved fee amount directly from the trust vault account
      const reservedFee = trustVaultInfo.reservedFee ? 
        trustVaultInfo.reservedFee.toNumber() / Math.pow(10, decimals) : 0;
    
      
      setFeeInfo({
        ...feeDetails,
        remainingFeeBalance: reservedFee,
        feeWithdrawAmount: 0
      });
    
      
    } catch (error) {
      console.error("[ERROR] Failed to fetch balance or fee information:", error);
      toast.error("Failed to fetch available balance");
    } finally {
      setIsLoading(false);
    
    }
  }, [trustVault, getAvailableTrustVaultBalance, getTrustVaultInfo, getTrustVaultFeeInfo, originalDeposit]);

  // Calculate fee refund amount when refund amount changes - NOW MATCHING SMART CONTRACT LOGIC
  useEffect(() => {
    const calculateFeeWithdrawal = () => {
    
      if (!withdrawAmount || isNaN(parseFloat(withdrawAmount)) || !availableBalance || availableBalance <= 0) {
      
        setFeeInfo(prev => {
          const updated = { ...prev, feeWithdrawAmount: 0 };
        
          return updated;
        });
        return;
      }

      const parsedAmount = parseFloat(withdrawAmount);
    
      // Calculate fee refund 
      // fee_refund_amount = reserved_fee * refund_amount / available_balance
      const feeWithdrawAmount = parsedAmount > 0 && availableBalance > 0
        ? (feeInfo.remainingFeeBalance * parsedAmount) / availableBalance
        : 0;
        
      setFeeInfo(prev => {
        const updated = { ...prev, feeWithdrawAmount };
      
        return updated;
      });
    };
    
    calculateFeeWithdrawal();
  }, [withdrawAmount, availableBalance, feeInfo.remainingFeeBalance]);

  const handleWithdrawal = useCallback(async () => {
    const parsedAmount = parseFloat(withdrawAmount);

    const totalWithdrawalAmount = parsedAmount + feeInfo.feeWithdrawAmount;

    
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
     
      toast.error("Please enter a valid withdrawal amount.");
      return;
    }

    if (availableBalance === null) {
     
      toast.error("Available balance information is unavailable.");
      return;
    }

    // safety margin to prevent errors due to rounding or calculation differences
    const safetyMargin = 0.99; 
    if (totalWithdrawalAmount > availableBalance * safetyMargin) {
     
      // Calculate a safe withdraw amount that accounts for the fee
      const safeWithdrawAmount = (availableBalance * safetyMargin) / (1 + (feeInfo.feeWithdrawAmount / parsedAmount));
      toast.error(`Withdrawal amount too close to maximum. Please use at most ${safeWithdrawAmount.toFixed(6)} to account for fees.`);
      return;
    }
    
    if (parsedAmount > availableBalance * safetyMargin) {
     
      toast.error(`Withdrawal amount too close to maximum. Please use at most ${(availableBalance * safetyMargin).toFixed(6)} to account for fees.`);
      return;
    }

   
    
    // Check if this is a full withdrawl (or close to it)
    const isFullWithdrawal = parsedAmount >= availableBalance * 0.95;
  

    try {
      // Execute the withdraw transaction
      const signature = await withdraw.mutateAsync({ 
        trustVault, 
        withdrawAmount: parsedAmount
      });
      
  
      
      // If this was a full withdrawal, destroy the encryption key
      if (isFullWithdrawal) {
        try {
      
          
          // Get the current user's public key
          const userPublicKey = window.solana?.publicKey?.toString();
          
          if (userPublicKey) {
            const closeResult = await closeVault(
              trustVault.toString(),
              'manual',
              userPublicKey
            );
            
            
            
            if (closeResult.success) {
              toast.success("Vault closed and encryption key destroyed");
            } else {
              console.warn("[WITHDRAWAL] Key destruction warning:", closeResult.error);
            }
          } else {
            console.warn("[WITHDRAWAL] Cannot destroy key - wallet not connected");
          }
        } catch (keyError) {
          console.error("[WITHDRAWAL] Error destroying encryption key:", keyError);
          // Don't fail the whole operation if key destruction fails
        }
      }
      
      toast.success(`Successfully withdrawal ${parsedAmount.toFixed(6)} tokens`);
      
      // Invalidate queries to refresh UI
      queryClient.invalidateQueries({
        queryKey: ["get-trust-vault-accounts"],
      });
      
      setWithdrawAmount("");
      
      
    } catch (err) {
      console.error("[WITHDRAWAL] Error during withdrawal:", err);
      
      // Improved error handling
      if (err instanceof Error) {
  if (err.message?.includes("0xb")) {
    toast.error("Failed to withdraw: Insufficient funds available for withdrawal");
  } else {
    toast.error(`Failed to withdraw trust vault: ${err.message}`);
  }
} else {
  toast.error("Failed to withdraw trust vault: Unknown error");
}
    }
  }, [trustVault, withdrawAmount, availableBalance, feeInfo, queryClient, withdraw]);

  // Auto-fetch data when dialog opens
  const handleDialogOpen = () => {
    fetchBalanceAndFees();
  };

  const handleHalfWithdrawal = () => {
    if (availableBalance !== null) {
      // Use 95% of half the balance to account for fees
      const halfBalance = Math.floor((availableBalance * 0.5 * 0.95) * 1e6) / 1e6;
      
      setWithdrawAmount(halfBalance.toString());
      
    }
  };

  const handleMaxWithdrawal = () => {
    if (availableBalance !== null) {
      // Use a stricter safety margin of 0.99 (99%)
      const safetyMargin = 0.99;
      // Calculate a safe amount considering the fee refund
      // This is approximate since fee depends on amount, but will be safer
      const maxSafeAmount = Math.floor((availableBalance * safetyMargin * 0.995) * 1e6) / 1e6;
      
      
      setWithdrawAmount(maxSafeAmount.toString());
      
    }
  };

  return (
    <AlertDialog>
      <Button 
        asChild 
        className="w-full" 
        variant={"destructive"} 
        disabled={disabled}
      >
        <AlertDialogTrigger onClick={handleDialogOpen}>
          <RefreshCwOff className="w-4 h-4 mr-2" />
          Withdraw From TrustVault
        </AlertDialogTrigger>
      </Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Withdraw from TrustVault</AlertDialogTitle>
          <AlertDialogDescription>
            Enter the amount you want to withdraw from the trust vault. If you withdraw the
            full available amount, the vault will be closed and your rent refunded.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* Display loading indicator */}
        {isLoading && (
          <div className="flex justify-center my-4">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span className="ml-2">Loading balance information...</span>
          </div>
        )}

        {/* Display available balance */}
        {!isLoading && availableBalance !== null && (
          <div className="mt-4 text-sm font-medium">
            Available Balance: {availableBalance.toFixed(6)} Tokens
          </div>
        )}

        {/* Add Half and Max buttons */}
        <div className="flex gap-4 mt-4">
          <Button variant="outline" onClick={handleHalfWithdrawal} disabled={isLoading || availableBalance === null}>
            Half
          </Button>
          <Button variant="outline" onClick={handleMaxWithdrawal} disabled={isLoading || availableBalance === null}>
            Max
          </Button>
        </div>

        <div className="mt-4">
          <label htmlFor="refund-amount" className="block text-sm font-medium mb-1">
            Withdrawal Amount
          </label>
          <input
            id="refund-amount"
            type="number"
            value={withdrawAmount}
            onChange={(e) => setWithdrawAmount(e.target.value)}
            placeholder="Enter withdrawal amount"
            className="w-full p-2 border rounded"
            disabled={isLoading || availableBalance === null}
          />
        </div>

        {/* Info about fee refund */}
        {parseFloat(withdrawAmount) > 0 && feeInfo.feeWithdrawAmount > 0 && (
          <div className="mt-2 text-sm flex items-center text-gray-600">
            <Info className="w-4 h-4 mr-1" />
            Includes fee refund: {feeInfo.feeWithdrawAmount.toFixed(6)} tokens
          </div>
        )}

        {/* Info about key destruction for full refunds */}
        {availableBalance !== null && parseFloat(withdrawAmount) > availableBalance * 0.95 && (
          <div className="mt-2 p-3 bg-amber-50 dark:bg-amber-950 rounded-md border border-amber-200 dark:border-amber-800">
            <div className="flex items-center text-amber-700 dark:text-amber-300 text-sm">
              <Info className="w-4 h-4 mr-2 flex-shrink-0" />
              <span>
                This is a full withdrawal. The vault will be closed and any encryption keys will be destroyed.
                Payment instructions will no longer be accessible after this action.
              </span>
            </div>
          </div>
        )}

        <AlertDialogFooter className="mt-4">
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleWithdrawal} disabled={isLoading || !withdrawAmount || parseFloat(withdrawAmount) <= 0}>
            <BicepsFlexed className="w-4 h-4 mr-2" /> Confirm Withdrawal
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default WithdrawalButton;