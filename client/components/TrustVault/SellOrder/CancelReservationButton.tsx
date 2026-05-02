"use client";
import React, {useState} from "react";
import { PublicKey } from "@solana/web3.js";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import useTrustVaultProgram from "@/hooks/useTrustVaultProgram";
import { useQueryClient } from "@tanstack/react-query";
import { XCircle, Loader2 } from "lucide-react";
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

type Props = {
  trustVault: PublicKey;
  reservationIndex: number;
  reservationStatus: number;
};

const CancelReservationButton: React.FC<Props> = ({ 
  trustVault, 
  reservationIndex,
  reservationStatus 
}) => {
  const queryClient = useQueryClient();
  const { cancelReservation } = useTrustVaultProgram();
  const [showConfirmation, setShowConfirmation] = useState(false);  
  // If payment is sent (status === 1), don't render the component at all
  if (reservationStatus === 1) {
    return null;
  }

  const handleCancelReservation = async () => {
    toast.promise(cancelReservation.mutateAsync({ trustVault, reservationIndex }), {
      loading: "Cancelling reservation...",
      success: "Reservation cancelled successfully",
      error: "Failed to cancel reservation",
      finally() {
        setShowConfirmation(false);
        queryClient.invalidateQueries({
          queryKey: ["get-trust-vault-accounts"],
        });
        queryClient.invalidateQueries({
          queryKey: ["get-buyer-reservations"],
        });
      },
    });
  };

  const getConfirmationMessage = () => {
    return `You are about to cancel this reservation. 

${reservationStatus === 0 
  ? "Please make sure you have not made any payment before cancelling, as this would release the token back to the general pool and you won't be able to get it."
  : "You have already marked payment as sent. If you've actually sent the payment, please contact the seller directly before cancelling."}

Do you want to proceed with cancelling this reservation?`;
  };


  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="destructive"
          size="sm"
          className="w-full"
          disabled={cancelReservation.isPending}
        >
          {cancelReservation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <XCircle className="h-4 w-4 mr-2" />
          )}
          Cancel Reservation
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel Your Reservation</AlertDialogTitle>
          <AlertDialogDescription className="whitespace-pre-line">
            {getConfirmationMessage()}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>No, Keep Reservation</AlertDialogCancel>
          <AlertDialogAction onClick={handleCancelReservation}>
            {cancelReservation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <XCircle className="h-4 w-4 mr-2" />
            )}
            Yes, Cancel Reservation
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default CancelReservationButton;