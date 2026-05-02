"use client";
import React, { useState } from "react";
import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../ui/card";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Avatar, AvatarFallback } from "../../ui/avatar";
import { Separator } from "@/components/ui/seperator";
import ExplorerLink from "@/components/ui/explorer-link";
import { ellipsify } from "@/lib/utils";
import {
  CreditCard,
  Coins,
  CheckCircle2,
  CircleUser,
  AlertCircle,
  CheckCircle,
  ShieldAlert, 
  DollarSign, 
  AlertTriangle, 
  Copy, 
} from "lucide-react";
import { toast } from "sonner";
import useTrustVaultProgram from "@/hooks/useTrustVaultProgram";
import { useQueryClient } from "@tanstack/react-query";
import ConfirmationDialog from "@/components/ui/confirmation-dialog";
import { DisputePaymentButton } from "../Shared/DisputePaymentButton";
import { useTokenMetadata } from "@/hooks/useTokenMetadata";
import TokenDisplay from "@/components/ui/token-display";

type Props = {
  trustVault: PublicKey;
  reservationIndex: number;
  mint: PublicKey;
  maker: PublicKey;
  reservation: {
    taker: PublicKey;
    amount: BN;
    fiatAmount: BN;
    trustVaultType: number;
    timestamp: BN;
    paymentInstructions: string | null;
    status: number;
    disputeReason: string | null;
    disputeId: string | null;
  };
  mintInfo: {
    decimals: number;
  };
  currency: string;
  pricePerToken: string | number;
};

const TakerCard: React.FC<Props> = ({
  trustVault,
  reservationIndex,
  mint,
  maker,
  reservation,
  mintInfo,
  currency,
  pricePerToken,
}) => {
  const queryClient = useQueryClient();
  const { sellerConfirmsPayment } = useTrustVaultProgram();
  const [showConfirmation, setShowConfirmation] = useState(false);
  const tokenMetadata = useTokenMetadata(mint);

  // Function to copy dispute ID to clipboard
  const copyDisputeId = () => {
    if (reservation.disputeId) {
      navigator.clipboard.writeText(reservation.disputeId);
      toast.success("Dispute ID copied to clipboard");
    }
  };

  // Format timestamp to human-readable date
  const reservationDate = new Date(reservation.timestamp.toNumber() * 1000).toLocaleString();
  const tokenAmount = reservation.amount.toNumber() / 10 ** mintInfo.decimals;
  const fiatAmount = reservation.fiatAmount.toNumber();
  const reservationPricePerToken = tokenAmount > 0 
    ? (fiatAmount / tokenAmount).toFixed(0) 
    : pricePerToken;

  const handleConfirmPaymentReceived = async () => {
    toast.promise(sellerConfirmsPayment.mutateAsync({ trustVault, reservationIndex }), {
      loading: "Confirming payment...",
      success: "Payment confirmed and tokens transferred to buyer",
      error: "Failed to confirm payment",
      finally() {
        setShowConfirmation(false);
        queryClient.invalidateQueries({
          queryKey: ["get-trust-vault-accounts"],
        });
      },
    });
  };

  const getConfirmationMessage = () => {
    return `Please verify that you have actually received the payment of ${fiatAmount.toLocaleString()} ${currency} from the buyer.
    This action is irreversible and will transfer ${tokenAmount.toLocaleString()} ${tokenMetadata?.metadata?.symbol || "Token"} tokens to the buyer's wallet.
    Have you checked and confirmed that you have received the full payment amount?`;
      };

  // Get appropriate status badge based on reservation status
  const getStatusBadge = () => {
    if (reservation.status === 0) { // PENDING
      return (
        <Badge variant="outline" className="ml-2 bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-300">
          Awaiting Payment
        </Badge>
      );
    } else if (reservation.status === 1) { // PAYMENT_SENT
      return (
        <Badge variant="outline" className="ml-2 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-300">
          Payment Sent - Ready for Confirmation
        </Badge>
      );
    } else if (reservation.status === 4) { // DISPUTED
      return (
        <Badge variant="outline" className="ml-2 bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-300">
          Payment Disputed
        </Badge>
      );
    }
  };

  // Get appropriate card border color based on status
  const getCardBorderClass = () => {
    if (reservation.status === 0) return "border-amber-500 dark:border-amber-600";
    if (reservation.status === 1) return "border-blue-500 dark:border-blue-600";
    if (reservation.status === 4) return "border-red-500 dark:border-red-600";
    return "";
  };

  // Get appropriate status icon based on status
  const getStatusIcon = () => {
    if (reservation.status === 0) return <AlertCircle className="text-amber-500" />;
    if (reservation.status === 1) return <CheckCircle className="text-blue-500" />;
    if (reservation.status === 4) return <ShieldAlert className="text-red-500" />;
    return null;
  };

  // Get appropriate notification message based on status
  const getNotificationMessage = () => {
    if (reservation.status === 0) {
      return (
        <div className="p-3 bg-amber-50 dark:bg-amber-950 rounded-md text-sm">
          <p className="font-medium text-amber-800 dark:text-amber-400 mb-2">Payment Verification</p>
          <p>The buyer has not yet sent payment. Once they do, they will mark it as sent.</p>
        </div>
      );
    } else if (reservation.status === 1) {
      return (
        <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-md text-sm">
          <p className="font-medium text-blue-800 dark:text-blue-400 mb-2">Payment Verification</p>
          <p>The buyer has marked payment as sent. Please verify you have received payment before confirming.</p>
        </div>
      );
    } else if (reservation.status === 4) {
      return (
        <div className="p-4 bg-red-50 dark:bg-red-950 rounded-md text-sm border border-red-200 dark:border-red-800">
          <div className="flex items-start gap-3">
            <AlertTriangle className="text-red-500 h-5 w-5 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="font-medium text-red-800 dark:text-red-300">Disputed Transaction</h4>
              <p className="text-red-700 dark:text-red-400">
                This transaction is currently under dispute. 
                <span className="font-medium text-green-500"> {tokenAmount.toLocaleString()} {tokenMetadata.metadata?.symbol} </span> 
                are locked in trust vault until the dispute is resolved. Please open a ticket in <a href="https://discord.gg/34vsB6xx" target="_blank" rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 underline hover:text-blue-800 dark:hover:text-blue-300"
                > discord</a> and provide the dispute ID to resolve this issue.
              </p>
              
              {/* Display dispute ID when available */}
              {reservation.disputeId && (
                <div className="flex items-center mt-2 bg-red-100 dark:bg-red-900 p-2 rounded-md">
                  <div className="flex-1 flex items-center">
                    <span className="text-red-800 dark:text-red-300 font-medium mr-2">Dispute ID:</span>
                    <span className="font-mono bg-red-200 dark:bg-red-800 py-1 px-2 rounded text-sm">
                      {reservation.disputeId}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 ml-2"
                    onClick={copyDisputeId}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className={getCardBorderClass()}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getStatusIcon()}
            Buy Order
          </div>
            {getStatusBadge()}
        </CardTitle>
        <CardDescription>
          Reserved on {reservationDate}
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <CircleUser className="w-4 h-4" />
            Buyer:
          </div>
          <ExplorerLink type="address" value={maker.toString()}>
            <Avatar>
              <AvatarFallback>
                {ellipsify(maker.toString(), 1)}
              </AvatarFallback>
            </Avatar>
          </ExplorerLink>
        </div>
        
        <Separator />
        
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Coins className="w-4 h-4" />
            Reserved :
          </div>
          <span className="font-medium">
            <TokenDisplay
            amount={tokenAmount}
            symbol={tokenMetadata?.metadata?.symbol || "Token"}
            logoURI={tokenMetadata?.metadata?.logoURI}
            />
          </span>
        </div>
        
         <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-green-400" />
            Price per Token:
          </div>
          <span>
            {reservationPricePerToken} {currency}
          </span>
        </div>

        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4" />
            Expected Payment:
          </div>
          <span className="font-semibold text-lg">{fiatAmount.toLocaleString()} {currency}</span>
        </div>
        
        <Separator />
        
        {getNotificationMessage()}
        
        <div className="flex flex-col gap-2">
          {/* Show different button based on status */}
          {reservation.status !== 4 ? (
            <Button 
              className="w-full"
              disabled={sellerConfirmsPayment.isPending || reservation.status === 0}
              onClick={() => reservation.status === 1 && setShowConfirmation(true)}
            >
              <CheckCircle2 className="w-4 h-4 mr-2" />
              {sellerConfirmsPayment.isPending ? "Processing..." : 
                reservation.status === 0 ? "Waiting for Payment" : "Confirm Payment Received"}
            </Button>
          ) : (
            <Button 
              className="w-full"
              variant="outline"
              disabled={true}
            >
              <ShieldAlert className="w-4 h-4 mr-2 text-red-500" />
              Transaction Disputed
            </Button>
          )}
          
          {/* Dispute Payment Button - only visible when payment is marked as sent and not already disputed */}
          {reservation.status === 1 && (
            <DisputePaymentButton
              trustVault={trustVault}
              reservationIndex={reservationIndex}
              reservationStatus={reservation.status}
              isMaker={true}
              variant="outline"
              className="w-full mt-2"
              onDisputed={() => {
                queryClient.invalidateQueries({
                  queryKey: ["get-trust-vault-accounts"],
                });
              }}
            />
          )}
        </div>
      </CardContent>

      <ConfirmationDialog
        isOpen={showConfirmation}
        onClose={() => setShowConfirmation(false)}
        onConfirm={handleConfirmPaymentReceived}
        title="Confirm Payment Receipt"
        description={getConfirmationMessage()}
        confirmText="Yes, I've Received the Payment"
        cancelText="Cancel"
        isProcessing={sellerConfirmsPayment.isPending}
      />
    </Card>
  );
};

export default TakerCard;