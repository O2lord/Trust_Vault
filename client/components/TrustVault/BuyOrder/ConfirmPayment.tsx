import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PublicKey } from "@solana/web3.js";
import { useToast } from "@/components/ui/use-toast";
import useTrustVaultProgram from "@/hooks/useTrustVaultProgram";
import { Loader2, CheckCircle, Clock } from "lucide-react";
import { BN } from "@project-serum/anchor";

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
  mintA?: PublicKey;
  tokenAmint?: PublicKey;
  vaultBalance?: number | null;
  pricePerToken?: number;
  currency?: string;
  disabled?: boolean;
  onSuccess?: () => void;
  variant?: "default" | "outline" | "secondary" | "ghost" | "link" | "destructive" |"gradient";
}

export default function ConfirmPaymentButton({
  trustVault,
  reservationIndex,
  disabled = false,
  onSuccess,
  variant = "default",
  reservations,
}: ConfirmPaymentButtonProps) {
    
  const { sellerConfirmsPayment } = useTrustVaultProgram();
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
                        sellerConfirmsPayment.isPending || 
                        !isPaymentSent || 
                        isCompleted || 
                        isCancelled;

  const handleConfirmPayment = async () => {
    try {
      setIsConfirming(true);
      await sellerConfirmsPayment.mutateAsync({
        trustVault,
        reservationIndex,
      });
      
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
      {isConfirming || sellerConfirmsPayment.isPending ? (
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