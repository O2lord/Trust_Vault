import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PublicKey } from "@solana/web3.js";
import { useToast } from "@/components/ui/use-toast";
import useTrustVaultProgram from "@/hooks/useTrustVaultProgram";
import { Loader2, CheckCircle, Clock } from "lucide-react";
import { BN } from "@project-serum/anchor";
import { closeVault } from "@/lib/encryptionApi";
import {useTrustVaultInfo} from "@/hooks/queries/useTrustVaultInfo";
import { useFeeInfoLogic } from "@/hooks/queries/useFeeInfo";

interface ConfirmPaymentButtonProps {
  trustVault: PublicKey;
  reservationIndex: number;
  reservations?: { 
    taker: PublicKey; 
    amount: BN; 
    fiatAmount: BN; 
    timestamp: BN; 
    status: number; 
  }[];
  mint?: PublicKey;
  tokenAmint?: PublicKey;
  vaultBalance?: number | null;
  pricePerToken?: number;
  currency?: string;
  disabled?: boolean;
  onSuccess?: () => void;
  variant?: "default" | "outline" | "secondary" | "ghost" | "link" | "destructive";
  feePercentage?: number;
  feeDestination?: PublicKey;
  originalDeposit?: number;
}

export default function ConfirmPaymentButton({
  trustVault,
  reservationIndex,
  disabled = false,
  onSuccess,
  variant = "default",
  reservations,
  vaultBalance,
  feePercentage = 0,
  feeDestination,
  originalDeposit = 0
}: ConfirmPaymentButtonProps) {
    
  const { confirmPayment, program } = useTrustVaultProgram();
  const { getTrustVaultInfo } = useTrustVaultInfo(program);
  const { getTrustVaultFeeInfo } = useFeeInfoLogic(getTrustVaultInfo);
  const { toast } = useToast();
  const [isConfirming, setIsConfirming] = useState(false);

  // Check if this reservation has payment sent status
  const currentReservation = reservations && reservations[reservationIndex];
  const isPaymentSent = currentReservation && currentReservation.status === 1;
  const isCompleted = currentReservation && currentReservation.status === 2;
  const isCancelled = currentReservation && currentReservation.status === 3;
  
  // Button should be disabled if:
  // - explicitly disabled via props
  // - transaction is in progress
  // - payment is NOT in "payment sent" status (status 1)
  // - payment is already completed or cancelled
  const buttonDisabled = disabled || 
                        isConfirming || 
                        confirmPayment.isPending || 
                        !isPaymentSent || 
                        isCompleted || 
                        isCancelled;

  const handleConfirmPayment = async () => {
    try {
      setIsConfirming(true);
      
      // Get actual fee info from smart contract if not passed in props
      let feeInfo = { feePercentage, feeDestination };
      if (!feePercentage || !feeDestination) {
        try {
          feeInfo = await getTrustVaultFeeInfo(trustVault);
        } catch (error) {
          console.error("Failed to fetch fee info:", error);
        }
      }
      
      // Calculate the proportion of tokens being transferred in this reservation
      const tokenAmount = currentReservation ? currentReservation.amount.toNumber() / Math.pow(10, 9) : 0;
      
      // Calculate the proportional fee to transfer
      let proportionalFeeAmount = 0;
      if (vaultBalance && originalDeposit && feeInfo.feePercentage) {
        // Calculate the original fee amount
        const totalFeeAmount = (originalDeposit * feeInfo.feePercentage) / 10000;
        // Calculate what proportion of the deposit is being sold
        const proportionSold = tokenAmount / originalDeposit;
        // Calculate proportional fee
        proportionalFeeAmount = totalFeeAmount * proportionSold;
      }
      
      // Check if this is the last reservation (will close the vault)
      const isLastReservation = reservations && reservations.length === 1;
  
      
      // Execute the transaction
      const signature = await confirmPayment.mutateAsync({
        trustVault,
        reservationIndex,
      });
      
     
      
      // If this was the last reservation, the vault will be closed
      // We should destroy the encryption key
      if (isLastReservation) {
        try {
        
          
          // Get the current user's public key
          const userPublicKey = window.solana?.publicKey?.toString();
          
          if (userPublicKey) {
            const closeResult = await closeVault(
              trustVault.toString(),
              'completed',
              userPublicKey
            );
            
          
            
            if (closeResult.success) {
           
            } else {
              console.warn("Key destruction warning:", closeResult.error);
            }
          } else {
            console.warn("Cannot destroy key - wallet not connected");
          }
        } catch (keyError) {
          console.error("Error destroying encryption key:", keyError);
          // Don't fail the whole operation if key destruction fails
        }
      }
      
      toast({
        title: "Payment confirmed",
        description: "The payment has been confirmed and tokens transferred to the buyer.",
        variant: "default",
      });
      
      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      console.error("Failed to confirm payment:", error);
      toast({
        title: "Failed to confirm payment",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setIsConfirming(false);
    }
  };

  // Determine button text based on reservation status
  let buttonText = "Waiting for Payment";
  let ButtonIcon = Clock;
  
  if (isPaymentSent) {
    buttonText = "Confirm Payment";
    ButtonIcon = CheckCircle;
  } else if (isCompleted) {
    buttonText = "Payment Completed";
    ButtonIcon = CheckCircle;
  } else if (isCancelled) {
    buttonText = "Reservation Cancelled";
    ButtonIcon = Clock;
  }

  return (
    <Button
      onClick={handleConfirmPayment}
      disabled={buttonDisabled}
      variant={variant}
    >
      {isConfirming || confirmPayment.isPending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Confirming...
        </>
      ) : (
        <>
          <ButtonIcon className="mr-2 h-4 w-4" />
          {buttonText}
        </>
      )}
    </Button>
  );
}