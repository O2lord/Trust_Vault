import React, { useState, useMemo } from "react";
import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/seperator";
import ExplorerLink from "@/components/ui/explorer-link";
import { ellipsify } from "@/lib/utils";
import {
  Clock,
  CreditCard,
  Coins,
  Send,
  CircleUser,
  AlertCircle,
  CheckCircle,
  Copy,
  AlertTriangle,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  DollarSign,
} from "lucide-react";
import { toast } from "sonner";
import useTrustVaultProgram from "@/hooks/useTrustVaultProgram";
import { useQueryClient } from "@tanstack/react-query";
import CancelReservationButton from "./CancelReservationButton";
import ConfirmationDialog from "@/components/ui/confirmation-dialog";
import { DisputePaymentButton } from "../Shared/DisputePaymentButton";
import EncryptedPaymentDisplay from "@/components/TrustVault/Shared/EncryptedPaymentDisplay";
import TokenDisplay from "@/components/ui/token-display";
import { useTokenMetadata} from "@/hooks/useTokenMetadata";
import { TRUST_VAULT_TYPE_SELL_ORDER } from "@/utils/constants";

type Props = {
  trustVault: PublicKey;
  reservationIndex: number;
  mint: PublicKey;
  reservation: {
    taker: PublicKey;
    amount: BN;
    fiatAmount: BN;
    timestamp: BN;
    status: number;
    disputeReason?: string;
    disputeId?: string; 
  };
  trustVaultAccount: {
    maker: PublicKey;
    paymentInstructions: string;
    trustVaultType: number;
  };
  mintInfo: {
    decimals: number;
  };
  currency: string;
  pricePerToken: string | number;
};

const PendingConfirmationCard: React.FC<Props> = ({
  trustVault,
  reservationIndex,
  mint,
  reservation,
  trustVaultAccount,
  mintInfo,
  currency,
  pricePerToken,
}) => {
  
  const queryClient = useQueryClient();
  const { markPaymentSent } = useTrustVaultProgram();
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [showPaymentInstructions, setShowPaymentInstructions] = useState(true);
  const tokenMetadata = useTokenMetadata(mint);


  // Check if this is a sell-first trustVault type
  const isValidTrustVault = useMemo(() => {
    if (!trustVaultAccount) {
      return false;
    }
    
    return trustVaultAccount.trustVaultType === TRUST_VAULT_TYPE_SELL_ORDER;
  }, [trustVaultAccount]);
  
  // If not a sell-first trustVault, don't render the card
  if (!isValidTrustVault) {
    return null;
  }

  // Format timestamp to human-readable date
  const reservationDate = new Date(reservation.timestamp.toNumber() * 1000).toLocaleString();
  
  // Convert token amount using decimals
  const tokenAmount = reservation.amount.toNumber() / 10 ** mintInfo.decimals;
  
  // Calculate fiat amount
  const fiatAmount = reservation.fiatAmount.toNumber(); // Assuming the same scaling as price
  
  // Calculate price per token at time of reservation
  const reservationPricePerToken = tokenAmount > 0 
    ? (fiatAmount / tokenAmount).toFixed(0) 
    : pricePerToken;

  // Function to copy dispute ID to clipboard
  const copyDisputeId = () => {
    if (reservation.disputeId) {
      navigator.clipboard.writeText(reservation.disputeId);
      toast.success("Dispute ID copied to clipboard");
    }
  };

  const handleConfirmPaymentSent = async () => {
    toast.promise(markPaymentSent.mutateAsync({ trustVault, reservationIndex }), {
      loading: "Marking payment as sent...",
      success: "Payment marked as sent. Awaiting seller confirmation.",
      error: "Failed to mark payment as sent",
      finally() {
        setShowConfirmation(false);
        queryClient.invalidateQueries({
          queryKey: ["get-buyer-reservations"],
        });
      },
    });
  };

  const getConfirmationMessage = () => {
    return `You are about to confirm the payment of ${fiatAmount.toLocaleString()} ${currency} to the seller.
    Please ensure that you have sent the payment according to the payment details provided.

    Please make the payment before confirming.
    Do you confirm that you have sent the payment as instructed?`;
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
          Payment Sent - Awaiting Confirmation
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

  // Render dispute notification when status is disputed
const renderDisputeNotification = () => {
  if (reservation.status === 4) {
    return (
      <div className="p-4 bg-red-50 dark:bg-red-950 rounded-md mt-4 border border-red-200 dark:border-red-800">
        <div className="flex items-start gap-3">
          <AlertTriangle className="text-red-500 h-5 w-5 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="font-medium text-red-800 dark:text-red-300">Disputed Transaction</h4>
            <p className="text-sm text-red-700 dark:text-red-400">
              This transaction is currently under dispute. 
              <span className="font-bold text-green-400"> {tokenAmount.toLocaleString()} {tokenMetadata.metadata?.symbol} </span> 
              are locked until the dispute is resolved. Please open a ticket in{' '}
              <a  href="https://discord.gg/ErvrS3BPJv" target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 underline hover:text-blue-800 dark:hover:text-blue-300"
              >
                discord
              </a>{' '}
              and provide the dispute ID to resolve this issue.
            </p>
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

  // Render payment instructions section with collapsible functionality
  const renderPaymentInstructionsSection = () => {
    // Make the section collapsible only when there's a dispute
    const isCollapsible = reservation.status === 4;

    return (
      <div>
        <div 
          className={`flex justify-between items-center mb-3 ${isCollapsible ? 'cursor-pointer' : ''}`}
          onClick={() => isCollapsible && setShowPaymentInstructions(!showPaymentInstructions)}
        >
          <p className="text-sm font-medium text-muted-foreground">
            Payment Instructions
          </p>
          {isCollapsible && (
            showPaymentInstructions ? 
              <ChevronUp className="h-4 w-4 text-muted-foreground" /> : 
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
        
        {(!isCollapsible || showPaymentInstructions) && (
          <EncryptedPaymentDisplay
            trustVaultPubkey={trustVault.toString()}
            paymentInstructions={trustVaultAccount.paymentInstructions}
            className="mb-4"
          />
        )}
      </div>
    );
  };

  return (
    <Card className={getCardBorderClass()}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getStatusIcon()}
            Your Reservation
            {getStatusBadge()}
          </div>
        </CardTitle>
        <CardDescription>
          Reserved on {reservationDate}
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <CircleUser className="w-4 h-4" />
            Seller:
          </div>
          <ExplorerLink type="address" value={trustVaultAccount.maker.toString()}>
            <Avatar>
              <AvatarFallback>
                {ellipsify(trustVaultAccount.maker.toString(), 1)}
              </AvatarFallback>
            </Avatar>
          </ExplorerLink>
        </div>
        
        <Separator />
      
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Coins className="w-4 h-4" />
            Reserved Tokens:
          </div>
          <TokenDisplay
            amount={tokenAmount}
            symbol={tokenMetadata?.metadata?.symbol}
            logoURI={tokenMetadata?.metadata?.logoURI}
          />
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
            Payment Amount:
          </div>
          <span className="font-semibold text-lg">{fiatAmount.toLocaleString()} {currency}</span>
        </div>
     
        
        <Separator />
        
        {/* Display dispute notification at the top if disputed */}
        {renderDisputeNotification()}
        
        {/* Render payment instructions using EncryptedPaymentDisplay */}
        {renderPaymentInstructionsSection()}
        
        <Separator />
        
        <div className="flex gap-2">
          {reservation.status === 0 ? (
            // Show "Mark Payment Sent" button when status is PENDING
            <Button 
              className="flex-1"
              disabled={markPaymentSent.isPending}
              onClick={() => setShowConfirmation(true)}
              variant="default"
            >
              <Send className="w-4 h-4 mr-2" />
              {markPaymentSent.isPending ? "Processing..." : "Mark Payment Sent"}
            </Button>
          ) : reservation.status === 1 ? (
            // Show disabled "Waiting for confirmation" button when status is PAYMENT_SENT
            <Button 
              className="flex-1"
              disabled={true}
              variant="secondary"
            >
              <Clock className="w-4 h-4 mr-2" />
              Waiting for Seller Confirmation
            </Button>
          ) : reservation.status === 4 ? (
            // Show dispute status button
            <Button 
              className="flex-1"
              disabled={true}
              variant="outline"
            >
              <ShieldAlert className="w-4 h-4 mr-2 text-red-500" />
              Transaction Disputed
            </Button>
          ) : null}
        </div>
        
        {/* Action buttons area */}
        <div className="flex flex-col gap-2 pt-2">
          {/* Cancel Reservation Button - hide when disputed */}
          {reservation.status !== 4 && (
            <CancelReservationButton 
              trustVault={trustVault}
              reservationIndex={reservationIndex}
              reservationStatus={reservation.status}
            />
          )}
          
          {/*  Dispute Payment Button - only visible when payment is marked as sent and not already disputed */}
          {reservation.status === 1 && (
            <DisputePaymentButton
              trustVault={trustVault}
              reservationIndex={reservationIndex}
              reservationStatus={reservation.status}
              isTaker={true}
              variant="outline"
              className="w-full mt-2"
              onDisputed={() => {
                queryClient.invalidateQueries({
                  queryKey: ["get-buyer-reservations"],
                });
              }}
            />
          )}
        </div>
      </CardContent>

      <ConfirmationDialog
        isOpen={showConfirmation}
        onClose={() => setShowConfirmation(false)}
        onConfirm={handleConfirmPaymentSent}
        title="Confirm Payment Sent"
        description={getConfirmationMessage()}
        confirmText="Yes, I've Sent the Payment"
        cancelText="Cancel"
        isProcessing={markPaymentSent.isPending}
      />
    </Card>
  );
};

export default PendingConfirmationCard;