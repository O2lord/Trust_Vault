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
} from "../../ui/alert-dialog";
import { Button } from "../../ui/button";
import { BicepsFlexed, RefreshCwOff, Info, Loader2 } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import useTrustVaultProgram from "@/hooks/useTrustVaultProgram";
import { useQueryClient } from "@tanstack/react-query";

type Props = {
  trustVault: PublicKey;
  mintA: PublicKey;
  vaultBalance: number | null; 
  disabled?: boolean;
};

const CancelorReduceButton: React.FC<Props> = ({ trustVault,vaultBalance, disabled }) => {
  const queryClient = useQueryClient();
  const { cancelOrReduceBuyOrder } = useTrustVaultProgram();
  const [newAmount, setNewAmount] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  const handleCancelorReduceBuyOrder = useCallback(async () => {
    const parsedAmount = parseFloat(newAmount);

    if (isNaN(parsedAmount) || parsedAmount < 0) {
      toast.error("Please enter a valid amount.");
      return;
    }

    if (vaultBalance === null) {
      toast.error("Vault balance is unavailable.");
      return;
    }

    if (parsedAmount > vaultBalance) {
      toast.error("Amount exceeds vault balance.");
      return;
    }

    setIsProcessing(true);

    try {
      // Check if this is a full cancellation (newAmount = 0)
      const isFullCancellation = parsedAmount === 0;
      
      // Execute the transaction
      await cancelOrReduceBuyOrder.mutateAsync({ 
        trustVault, 
        newAmount: parsedAmount 
      });
      
      // If this was a full cancellation, the vault will be closed
      // The key destruction is now handled in the mutation itself
      
      toast.success(isFullCancellation 
        ? "Buy order cancelled successfully" 
        : `Buy order reduced to ${parsedAmount} tokens`);
      
      // Invalidate queries to refresh UI
      queryClient.invalidateQueries({
        queryKey: ["get-trust-vault-accounts"],
      });
      
      setNewAmount("");
    } catch (error) {
      console.error("Failed to modify buy order:", error);
      toast.error(error instanceof Error ? error.message : "An unexpected error occurred");
    } finally {
      setIsProcessing(false);
    }
  }, [trustVault, newAmount, vaultBalance, queryClient, cancelOrReduceBuyOrder]);

  const handleHalfRefund = () => {
    if (vaultBalance !== null) {
      const halfBalance = (vaultBalance / 2).toString();
      setNewAmount(halfBalance);
    }
  };

  const handleMaxRefund = () => {
    if (vaultBalance !== null) {
      const maxBalance = vaultBalance.toString();
      setNewAmount(maxBalance);
    }
  };

  const handleCancelOrder = () => {
    setNewAmount("0");
  };

  return (
    <AlertDialog>
      <Button 
        asChild 
        className="w-full" 
        variant={"destructive"} 
        disabled={disabled || isProcessing}
      >
        <AlertDialogTrigger>
          <RefreshCwOff className="w-4 h-4 mr-2" />
          {isProcessing ? "Processing..." : "Modify Buy Order"}
        </AlertDialogTrigger>
      </Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Modify Buy Order</AlertDialogTitle>
          <AlertDialogDescription>
            Enter the new amount for your buy order. Enter 0 to cancel the order completely.
            You cannot reduce below any reserved amounts.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* Display vault balance */}
        <div className="mt-4 text-sm">
          {vaultBalance !== null
            ? `Current Order Size: ${vaultBalance} Tokens`
            : "Order size is unavailable."}
        </div>

        {/* Add action buttons */}
        <div className="flex gap-2 mt-4">
          <Button variant="outline" onClick={handleHalfRefund}>
            Half
          </Button>
          <Button variant="outline" onClick={handleMaxRefund}>
            Keep All
          </Button>
          <Button variant="destructive" onClick={handleCancelOrder}>
            Cancel Order
          </Button>
        </div>

        <div className="mt-4">
          <label htmlFor="new-amount" className="block text-sm font-medium mb-1">
            New Order Amount
          </label>
          <input
            id="new-amount"
            type="number"
            value={newAmount}
            onChange={(e) => setNewAmount(e.target.value)}
            placeholder="Enter new amount (0 to cancel)"
            className="w-full p-2 border rounded"
          />
        </div>

        {/* Info about cancellation */}
        {newAmount === "0" && (
          <div className="mt-2 text-sm flex items-center text-amber-600">
            <Info className="w-4 h-4 mr-1" />
            This will completely cancel your buy order and close the vault.
          </div>
        )}

        <AlertDialogFooter className="mt-4">
          <AlertDialogCancel disabled={isProcessing}>Cancel</AlertDialogCancel>
          <AlertDialogAction 
            onClick={handleCancelorReduceBuyOrder} 
            disabled={isProcessing || !newAmount}
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <BicepsFlexed className="w-4 h-4 mr-2" /> 
                {newAmount === "0" ? "Cancel Order" : "Update Order"}
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default CancelorReduceButton;