// components/payment-requests/RequestsInbox.tsx
"use client";
import React from "react";
import { usePaymentRequests } from "@/hooks/express/usePaymentRequest";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Check, X, Clock, User, DollarSign, AlertCircle, ArrowRight, Coins, Copy, ExternalLink, ChevronDown, ChevronUp, CheckCircle } from "lucide-react";
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { Transaction, Connection } from '@solana/web3.js';
import { getAssociatedTokenAddress, createTransferInstruction, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { formatDistanceToNow } from "date-fns";
import useTrustExpress from "@/hooks/express/useTrustExpress";
import { useTokenMetadata } from "@/hooks/useTokenMetadata";
import { toast } from "sonner";
import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface PaymentRequest {
  id: string;
  requester_wallet: string;
  payer_wallet: string;
  request_type: 'token' | 'fiat';
  fiat_amount?: number;
  currency?: string;
  payout_details?: {
    type: string;
    account_number: string;
    beneficiary_name: string;
    bank_code?: string;
    phone_number?: string;
    network?: string;
  };
  token_mint?: string;
  token_amount?: number;
  note?: string;
  status: 'pending' | 'completed' | 'rejected' | 'cancelled' | 'expired';
  created_at: string;
  updated_at: string;
  transaction_signature?: string;
  isExpired?: boolean;
}

interface TrustExpressOrder {
  publicKey: PublicKey;
  account: {
    escrowType: number;
    currency: number[];
    amount: BN;
    pricePerToken: BN;
    mint: PublicKey;
  };
}

interface ConfirmationData {
  request: PaymentRequest;
  trustExpressOrder: TrustExpressOrder;
  tokenAmount: BN;
  tokenAmountDecimal: number;
}

// Token Request Card Component
const TokenRequestCard: React.FC<{
  request: PaymentRequest;
  onAccept: (requestId: string) => void;
  onReject: (requestId: string) => void;
  processingId: string | null;
}> = ({ request, onAccept, onReject, processingId }) => {
  const { metadata } = useTokenMetadata(request.token_mint || "");

  return (
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-green-500/20 p-2 rounded-lg">
              <Coins className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <CardTitle className="text-white text-lg">
                Token Request
              </CardTitle>
              <CardDescription className="text-gray-400">
                From {request.requester_wallet.slice(0, 4)}...{request.requester_wallet.slice(-4)}
              </CardDescription>
            </div>
          </div>
          <Badge variant="outline" className="border-yellow-600 text-yellow-400">
            <Clock className="w-3 h-3 mr-1" />
            Pending
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex items-center justify-between p-4 bg-gray-900 rounded-lg">
          <div className="flex items-center gap-2 text-gray-300">
            <span className="text-sm font-medium">Amount</span>
          </div>
          <div className="text-white font-semibold text-lg">
            {request.token_amount} {metadata?.symbol || 'tokens'}
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-sm text-gray-400 font-medium">Token Details:</div>
          <div className="p-3 bg-gray-900 rounded-lg space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Token Mint:</span>
              <span className="text-white font-mono text-xs">
                {request.token_mint?.slice(0, 8)}...{request.token_mint?.slice(-8)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Symbol:</span>
              <span className="text-white">{metadata?.symbol || 'Loading...'}</span>
            </div>
          </div>
        </div>

        {request.note && (
          <div className="space-y-2">
            <div className="text-sm text-gray-400 font-medium">Note:</div>
            <div className="p-3 bg-gray-900 rounded-lg text-sm text-gray-300 italic">
              &quot;{request.note}&quot;
            </div>
          </div>
        )}

        <div className="text-xs text-gray-500">
          Requested {formatDistanceToNow(new Date(request.created_at), { addSuffix: true })}
        </div>

        {request.isExpired && (
          <div className="rounded-lg bg-red-900/20 border border-red-800 p-3 text-sm text-red-200">
            ⚠️ This request has expired
          </div>
        )}
      </CardContent>

      <CardFooter className="flex gap-3">
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => onReject(request.id)}
          disabled={processingId !== null || request.isExpired}
        >
          <X className="w-4 h-4 mr-2" />
          Reject
        </Button>
        <Button
          className="flex-1 bg-green-600 hover:bg-green-700"
          onClick={() => onAccept(request.id)}
          disabled={processingId !== null || request.isExpired}
        >
          <Check className="w-4 h-4 mr-2" />
          Accept & Send
        </Button>
      </CardFooter>
    </Card>
  );
};

const HistoryRequestCard: React.FC<{
  request: PaymentRequest;
}> = ({ request }) => {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const { metadata } = useTokenMetadata(request.token_mint || "");

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'border-green-600 text-green-400';
      case 'rejected':
        return 'border-red-600 text-red-400';
      case 'cancelled':
        return 'border-orange-600 text-orange-400';
      case 'expired':
        return 'border-gray-600 text-gray-400';
      default:
        return 'border-gray-600 text-gray-400';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <Check className="w-3 h-3 mr-1" />;
      case 'rejected':
      case 'cancelled':
        return <X className="w-3 h-3 mr-1" />;
      default:
        return <Clock className="w-3 h-3 mr-1" />;
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  return (
    <Card 
      className="bg-gray-800 border-gray-700 cursor-pointer hover:border-gray-600 transition-colors"
      onClick={() => setIsExpanded(!isExpanded)}
    >
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3 flex-1">
            <div className={`p-2 rounded-lg ${
              request.request_type === 'token' 
                ? 'bg-green-500/20' 
                : 'bg-purple-500/20'
            }`}>
              {request.request_type === 'token' ? (
                <Coins className="w-5 h-5 text-green-400" />
              ) : (
                <DollarSign className="w-5 h-5 text-purple-400" />
              )}
            </div>
            <div className="flex-1">
              <CardTitle className="text-white text-lg">
                {request.request_type === 'token' 
                  ? 'Token Payment Request'
                  : 'Fiat Payment Request'
                }
              </CardTitle>
              <CardDescription className="text-gray-400">
                From {request.requester_wallet.slice(0, 4)}...{request.requester_wallet.slice(-4)}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={getStatusColor(request.status)}>
              {getStatusIcon(request.status)}
              {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
            </Badge>
            {isExpanded ? (
              <ChevronUp className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            )}
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="space-y-4" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between p-4 bg-gray-900 rounded-lg">
            <div className="flex items-center gap-2 text-gray-300">
              <span className="text-sm font-medium">Amount</span>
            </div>
            <div className="text-white font-semibold text-lg">
              {request.request_type === 'token' 
                ? `${request.token_amount} ${metadata?.symbol || 'tokens'}`
                : `${request.fiat_amount} ${request.currency}`
              }
            </div>
          </div>

          {request.request_type === 'token' && (
            <div className="space-y-2">
              <div className="text-sm text-gray-400 font-medium">Token Details:</div>
              <div className="p-3 bg-gray-900 rounded-lg space-y-2 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Token Mint:</span>
                  <div className="flex items-center gap-2">
                    <span className="text-white font-mono text-xs">
                      {request.token_mint?.slice(0, 8)}...{request.token_mint?.slice(-8)}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => copyToClipboard(request.token_mint || '', 'Token mint')}
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Symbol:</span>
                  <span className="text-white">{metadata?.symbol || 'Loading...'}</span>
                </div>
              </div>
            </div>
          )}

          {request.request_type === 'fiat' && request.payout_details && (
            <div className="space-y-2">
              <div className="text-sm text-gray-400 font-medium">Payout Details:</div>
              <div className="p-3 bg-gray-900 rounded-lg space-y-2 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Account:</span>
                  <div className="flex items-center gap-2">
                    <span className="text-white">{request.payout_details.account_number}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => copyToClipboard(request.payout_details?.account_number || '', 'Account number')}
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Name:</span>
                  <span className="text-white">{request.payout_details.beneficiary_name}</span>
                </div>
                {request.payout_details.bank_code && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Bank:</span>
                    <span className="text-white">{request.payout_details.bank_code}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {request.note && (
            <div className="space-y-2">
              <div className="text-sm text-gray-400 font-medium">Note:</div>
              <div className="p-3 bg-gray-900 rounded-lg text-sm text-gray-300 italic">
                &quot;{request.note}&quot;
              </div>
            </div>
          )}

          {request.status === 'completed' && request.transaction_signature && (
            <div className="space-y-2">
              <div className="text-sm text-gray-400 font-medium">Transaction:</div>
              <div className="p-3 bg-gray-900 rounded-lg flex items-center justify-between text-sm">
                <span className="text-white font-mono text-xs">
                  {request.transaction_signature.slice(0, 8)}...{request.transaction_signature.slice(-8)}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => copyToClipboard(request.transaction_signature || '', 'Transaction signature')}
                  >
                    <Copy className="w-3 h-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => window.open(`https://solscan.io/tx/${request.transaction_signature}`, '_blank')}
                  >
                    <ExternalLink className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div className="text-xs text-gray-500">
            {request.status.charAt(0).toUpperCase() + request.status.slice(1)} {formatDistanceToNow(new Date(request.updated_at), { addSuffix: true })}
          </div>
        </CardContent>
      )}

      {!isExpanded && (
        <CardContent>
          <div className="text-xs text-gray-500">
            {request.status.charAt(0).toUpperCase() + request.status.slice(1)} {formatDistanceToNow(new Date(request.updated_at), { addSuffix: true })}
          </div>
        </CardContent>
      )}
    </Card>
  );
};

const RequestsInbox: React.FC = () => {
  const { incomingRequests, rejectRequest, completeRequest } = usePaymentRequests();
  const { instantReserve, getTrustExpressAccounts } = useTrustExpress();
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const [processingId, setProcessingId] = React.useState<string | null>(null);
  const [confirmationDialog, setConfirmationDialog] = React.useState<{
    open: boolean;
    data: ConfirmationData | null;
    loading: boolean;
  }>({
    open: false,
    data: null,
    loading: false,
  });
  const { metadata: tokenMetadata } = useTokenMetadata(
    confirmationDialog.data?.trustExpressOrder.account.mint.toString() || ""
  );
  
  // Receipt state
  const [receiptId, setReceiptId] = React.useState<string | null>(null);
  const [showReceipt, setShowReceipt] = React.useState(false);
  const [subscriptionId, setSubscriptionId] = React.useState<number | null>(null);
  const [paymentStatus, setPaymentStatus] = React.useState<'idle' | 'detecting' | 'processing' | 'generating_receipt' | 'completed'>('idle');
  const [isGeneratingReceipt, setIsGeneratingReceipt] = React.useState(false);

  // Transaction monitoring function
  const startTransactionMonitoring = React.useCallback((trustExpressAddress: string) => {
    const rpcConnection = new Connection(
      process.env.NEXT_PUBLIC_RPC_URL || 'https://api.devnet.solana.com'
    );

    const trustExpressPubkey = new PublicKey(trustExpressAddress);
    
    setPaymentStatus('detecting');
    setIsGeneratingReceipt(true);
    
    let pollCount = 0;
    const maxPolls = 90;
    let pollIntervalId: NodeJS.Timeout | null = null;
    let hasDetectedTransaction = false;
    let pollingStartTime: string | null = null;
    
    const pollForReceipt = async () => {
      try {
        if (!pollingStartTime) {
          return false;
        }
        
        const response = await fetch(
          `/api/receipts/by-transaction?trustExpressAddress=${trustExpressAddress}&since=${pollingStartTime}`
        );
        
        if (!response.ok) {
          console.error('[Polling] API returned error status:', response.status);
          return false;
        }

        const data = await response.json();

        if (data && data.id) {
          
          
          setTimeout(() => {
            setPaymentStatus('completed');
            setIsGeneratingReceipt(false);
            setReceiptId(data.id);
            setShowReceipt(true);
            setConfirmationDialog(prev => ({ ...prev, open: false, loading: false }));
            toast.success("Receipt generated! Click to view.");
          }, 5000);

          if (subscriptionId !== null) {
            rpcConnection.removeAccountChangeListener(subscriptionId);
            setSubscriptionId(null);
          }
          
          if (pollIntervalId) {
            clearInterval(pollIntervalId);
          }
          
          return true;
        }
        
        return false;
      } catch (error) {
        console.error('[Polling] Failed to fetch receipt:', error);
        return false;
      }
    };
    
    const subId = rpcConnection.onAccountChange(
      trustExpressPubkey,
      async (accountInfo, context) => {
        if (hasDetectedTransaction) {
          return;
        }

        
        hasDetectedTransaction = true;
        
        pollingStartTime = new Date().toISOString();
        
        
        setPaymentStatus('processing');
        
        await getTrustExpressAccounts.refetch();
        
        toast.success("Payment successful! Generating receipt...");
        
        setPaymentStatus('generating_receipt');

        setTimeout(() => {
          pollCount = 0;
          
          pollIntervalId = setInterval(async () => {
            pollCount++;
            
            if (pollCount >= maxPolls) {
              
              if (pollIntervalId) {
                clearInterval(pollIntervalId);
              }
              setPaymentStatus('idle');
              setIsGeneratingReceipt(false);
              setConfirmationDialog(prev => ({ ...prev, open: false, loading: false }));
              toast.info("Receipt generation is taking longer than expected. Check your receipts page.");
              return;
            }
            
            const found = await pollForReceipt();
            
            if (found && pollIntervalId) {
              clearInterval(pollIntervalId);
            }
          }, 3000);
        }, 8000);
      },
      'confirmed'
    );

    setSubscriptionId(subId);
    
    return () => {
      if (pollIntervalId) {
        clearInterval(pollIntervalId);
      }
      if (subId !== null) {
        rpcConnection.removeAccountChangeListener(subId);
      }
      setPaymentStatus('idle');
      setIsGeneratingReceipt(false);
    };
  }, [getTrustExpressAccounts, subscriptionId]);

  const handleAcceptClick = async (request: PaymentRequest) => {
    if (processingId !== null) {
      toast.error('A request is already being processed');
      return;
    }

    if (request.isExpired) {
      toast.error('This request has expired');
      return;
    }

    
    setConfirmationDialog({ open: true, data: null, loading: true });
    
    try {
      await getTrustExpressAccounts.refetch();

      const buyOrders = getTrustExpressAccounts.data?.filter((order) => {
        const requiredAmount = calculateRequiredTokenAmount(
          request.fiat_amount!,
          order.account.pricePerToken
        );
        
        return order.account.escrowType === 1 &&
          String.fromCharCode(...order.account.currency).trim() === request.currency &&
          order.account.amount.gte(requiredAmount);
      });

      if (!buyOrders || buyOrders.length === 0) {
        
        toast.error('No suitable buy orders available for this currency. Please create a buy order first.');
        setConfirmationDialog({ open: false, data: null, loading: false });
        return;
      }

      const bestBuyOrder = buyOrders.sort((a, b) => {
        const priceA = Number(a.account.pricePerToken.toString());
        const priceB = Number(b.account.pricePerToken.toString());
        return priceA - priceB;
      })[0];

      const tokenAmount = calculateRequiredTokenAmount(
        request.fiat_amount!,
        bestBuyOrder.account.pricePerToken
      );

      const tokenAmountDecimal = Number(tokenAmount.toString()) / 1e9;

      setConfirmationDialog({
        open: true,
        data: {
          request: request,
          trustExpressOrder: bestBuyOrder,
          tokenAmount,
          tokenAmountDecimal,
        },
        loading: false,
      });

    } catch (error) {
      console.error('❌ Error preparing request:', error);
      setConfirmationDialog({ open: false, data: null, loading: false });
      
      if (error instanceof Error) {
        toast.error(error.message);
      } else {
        toast.error('Failed to prepare request');
      }
    }
  };

  const handleConfirmPayment = async () => {
    if (!confirmationDialog.data) return;

    const { request, trustExpressOrder, tokenAmountDecimal } = confirmationDialog.data;

    setProcessingId(request.id);
    setConfirmationDialog(prev => ({ ...prev, loading: true }));

    try {
      
      
      // Start monitoring BEFORE the transaction
      startTransactionMonitoring(trustExpressOrder.publicKey.toString());
      
      let signature: string;
      
      try {
        signature = await instantReserve.mutateAsync({
          trustExpress: trustExpressOrder.publicKey,
          amount: tokenAmountDecimal,
          fiatAmount: request.fiat_amount!,
          currency: request.currency!,
          payoutDetails: JSON.stringify(request.payout_details),
        });
        
        
      } catch (reserveError) {
        const errorMessage = reserveError instanceof Error ? reserveError.message : String(reserveError);
        
        if (errorMessage.includes('already been processed')) {
          
          
          // IMPORTANT: Set these states FIRST before any async operations
          setPaymentStatus('generating_receipt');
          setIsGeneratingReceipt(true);
          setConfirmationDialog(prev => ({ ...prev, loading: false })); // Allow status message to show
          toast.success('Payment successful! Generating receipt...');
          
          // Mark request as completed
          try {
            await completeRequest.mutateAsync({
              requestId: request.id,
              signature: 'AUTO_PROCESSED',
            });
            
          } catch (completeError) {
            console.error('⚠️ Failed to complete request, but payment was processed:', completeError);
          }
          
          await incomingRequests.refetch();
          
          // Start polling for receipt immediately
          let pollCount = 0;
          const maxPolls = 30;
          let pollIntervalRef: NodeJS.Timeout | null = null;
          
          const pollForExistingReceipt = () => {
            pollIntervalRef = setInterval(async () => {
              pollCount++;
              
              
              try {
                const sinceTime = new Date(Date.now() - 60000).toISOString();
                const response = await fetch(
                  `/api/receipts/by-transaction?trustExpressAddress=${trustExpressOrder.publicKey.toString()}&since=${sinceTime}`
                );
                
                if (response.ok) {
                  const data = await response.json();
                  
                  if (data && data.id) {
                    
                    if (pollIntervalRef) clearInterval(pollIntervalRef);
                    
                    setPaymentStatus('completed');
                    setIsGeneratingReceipt(false);
                    setReceiptId(data.id);
                    setShowReceipt(true);
                    setConfirmationDialog({ open: false, data: null, loading: false });
                    setProcessingId(null); // Clear processing lock
                    toast.success("Receipt generated! Click to view.");
                    return;
                  }
                }
              } catch (error) {
                console.error('[Race Condition] Error polling for receipt:', error);
              }
              
              if (pollCount >= maxPolls) {
                
                if (pollIntervalRef) clearInterval(pollIntervalRef);
                setPaymentStatus('idle');
                setIsGeneratingReceipt(false);
                setConfirmationDialog({ open: false, data: null, loading: false });
                setProcessingId(null); // Clear processing lock
                toast.info("Receipt generation is taking longer than expected. Check your receipts page.");
              }
            }, 3000);
          };
          
          pollForExistingReceipt();
          
          // Don't set processingId to null yet - keep it locked
          return;
        }
        
        throw reserveError;
      }

      try {
        await completeRequest.mutateAsync({
          requestId: request.id,
          signature,
        });
        
      } catch (completeError) {
        console.error('⚠️ Failed to update request status:', completeError);
        toast.error('Payment completed but failed to update request status');
      }

      await incomingRequests.refetch();
      toast.success('Payment confirmed! Generating receipt...');
      
      // Keep dialog open - monitoring callback will handle closing when receipt is ready
      
    } catch (error) {
      console.error('❌ Error fulfilling request:', error);
      
      if (error instanceof Error) {
        if (error.message.includes('already been processed')) {
          // Don't clear processingId or states here - let the race condition handler manage it
          return;
        }
        
        if (error.message.includes('User rejected')) {
          toast.error('Transaction was rejected');
        } else {
          toast.error(error.message);
        }
      } else {
        toast.error('Failed to fulfill request');
      }
      
      setConfirmationDialog({ open: false, data: null, loading: false });
      setPaymentStatus('idle');
      setIsGeneratingReceipt(false);
      setProcessingId(null);
    }
    // Note: processingId is NOT cleared here if race condition occurred
    // It will be cleared when receipt polling completes or times out
  };

  const handleAcceptTokenRequest = async (requestId: string) => {
    if (processingId !== null) {
      toast.error('A request is already being processed');
      return;
    }

    const request = incomingRequests.data?.find((r: PaymentRequest) => r.id === requestId);
    if (!request || !request.token_mint || !request.token_amount) {
      toast.error('Invalid request data');
      return;
    }

    if (request.isExpired) {
      toast.error('This request has expired');
      return;
    }

    if (!publicKey) {
      toast.error('Wallet not connected');
      return;
    }

    setProcessingId(requestId);

    try {
      
      
      
      
      
      const mintPubkey = new PublicKey(request.token_mint);
      const recipientPubkey = new PublicKey(request.requester_wallet);

      
      const mintAccountInfo = await connection.getParsedAccountInfo(mintPubkey);
      
      let decimals = 6;
      let tokenProgramId = TOKEN_PROGRAM_ID;
      
      if (mintAccountInfo.value) {
        if (mintAccountInfo.value.owner.toString() === 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb') {
          tokenProgramId = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
          
        } else {
          
        }
        
        if ('parsed' in mintAccountInfo.value.data) {
          decimals = mintAccountInfo.value.data.parsed.info.decimals;
          
        }
      }
      
      const transferAmount = Math.floor(request.token_amount * Math.pow(10, decimals));
      

      
      const senderTokenAccount = await getAssociatedTokenAddress(
        mintPubkey,
        publicKey,
        false,
        tokenProgramId
      );
      

      const senderAccountInfo = await connection.getParsedAccountInfo(senderTokenAccount);
      if (!senderAccountInfo.value) {
        toast.error('You do not have a token account for this token');
        setProcessingId(null);
        return;
      }

      interface ParsedTokenAccount {
        parsed: {
          info: {
            tokenAmount: {
              uiAmount: number;
            };
          };
        };
      }

      const senderData = senderAccountInfo.value.data as ParsedTokenAccount;
      const senderBalance = senderData.parsed?.info?.tokenAmount?.uiAmount || 0;
      

      if (senderBalance < request.token_amount) {
        toast.error(`Insufficient balance. You have ${senderBalance} but need ${request.token_amount}`);
        setProcessingId(null);
        return;
      }

      
      const recipientTokenAccount = await getAssociatedTokenAddress(
        mintPubkey,
        recipientPubkey,
        false,
        tokenProgramId
      );
      

      const transaction = new Transaction();

      const recipientAccountInfo = await connection.getAccountInfo(recipientTokenAccount);
      
      if (!recipientAccountInfo) {
        
        
        const { createAssociatedTokenAccountInstruction } = await import('@solana/spl-token');
        
        transaction.add(
          createAssociatedTokenAccountInstruction(
            publicKey,
            recipientTokenAccount,
            recipientPubkey,
            mintPubkey,
            tokenProgramId
          )
        );
        
        
      } else {
        
      }

      transaction.add(
        createTransferInstruction(
          senderTokenAccount,
          recipientTokenAccount,
          publicKey,
          transferAmount,
          [],
          tokenProgramId
        )
      );

      

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      
      
      const signature = await sendTransaction(transaction, connection, {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });
      
      
      
      const confirmation = await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      }, 'confirmed');

      if (confirmation.value.err) {
        throw new Error('Transaction failed: ' + JSON.stringify(confirmation.value.err));
      }
      
      

      try {
        await completeRequest.mutateAsync({
          requestId: request.id,
          signature,
        });
        
      } catch (completeError) {
        console.error('⚠️ Failed to update request status:', completeError);
        toast.error('Tokens sent but failed to update request status');
      }

      await incomingRequests.refetch();
      toast.success('Tokens sent successfully!');
      
    } catch (error) {
      console.error('❌ Error fulfilling token request:', error);
      
      if (error instanceof Error) {
        console.error('Error details:', error.message);
        console.error('Error stack:', error.stack);
        
        if (error.message.includes('User rejected')) {
          toast.error('Transaction was rejected');
        } else if (error.message.includes('insufficient funds')) {
          toast.error('Insufficient SOL for transaction fees');
        } else if (error.message.includes('Insufficient balance')) {
          toast.error(error.message);
        } else {
          toast.error(`Failed to send tokens: ${error.message}`);
        }
      } else {
        toast.error('Failed to send tokens');
      }
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (requestId: string) => {
    if (processingId) {
      toast.error('Please wait for the current request to finish processing');
      return;
    }

    try {
      setProcessingId(requestId);
      await rejectRequest.mutateAsync(requestId);
      await incomingRequests.refetch();
    } catch (error) {
      console.error('Error rejecting request:', error);
    } finally {
      setProcessingId(null);
    }
  };

  const calculateRequiredTokenAmount = (fiatAmount: number, pricePerToken: BN): BN => {
    const price = Number(pricePerToken.toString());
    if (price === 0) return new BN(0);
    
    const tokenAmount = (fiatAmount / price) * 1e9;
    return new BN(Math.floor(tokenAmount));
  };

  // Cleanup subscription on unmount
  React.useEffect(() => {
    return () => {
      if (subscriptionId !== null) {
        const rpcConnection = new Connection(
          process.env.NEXT_PUBLIC_RPC_URL || 'https://api.devnet.solana.com'
        );
        rpcConnection.removeAccountChangeListener(subscriptionId);
      }
    };
  }, [subscriptionId]);

  if (incomingRequests.isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
      </div>
    );
  }

  const pendingRequests = incomingRequests.data?.filter((r: PaymentRequest) => r.status === 'pending') || [];
  const historyRequests = incomingRequests.data?.filter((r: PaymentRequest) => r.status !== 'pending') || [];

  return (
    <>
      <div className="space-y-6">
        {/* Pending Requests */}
        <div>
          <h2 className="text-2xl font-bold text-white mb-4">Pending Requests</h2>
          
          {pendingRequests.length === 0 ? (
            <Card className="bg-gray-800 border-gray-700">
              <CardContent className="py-12 text-center">
                <div className="text-gray-400 mb-2">No pending requests</div>
                <div className="text-sm text-gray-500">
                  When someone requests payment from you, it will appear here
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {pendingRequests.map((request: PaymentRequest) => {
                if (request.request_type === 'token') {
                  return (
                    <TokenRequestCard
                      key={request.id}
                      request={request}
                      onAccept={handleAcceptTokenRequest}
                      onReject={handleReject}
                      processingId={processingId}
                    />
                  );
                }
                
                return (
                  <Card key={request.id} className="bg-gray-800 border-gray-700">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="bg-purple-500/20 p-2 rounded-lg">
                            <User className="w-5 h-5 text-purple-400" />
                          </div>
                          <div>
                            <CardTitle className="text-white text-lg">
                              Payment Request
                            </CardTitle>
                            <CardDescription className="text-gray-400">
                              From {request.requester_wallet.slice(0, 4)}...{request.requester_wallet.slice(-4)}
                            </CardDescription>
                          </div>
                        </div>
                        <Badge variant="outline" className="border-yellow-600 text-yellow-400">
                          <Clock className="w-3 h-3 mr-1" />
                          Pending
                        </Badge>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between p-4 bg-gray-900 rounded-lg">
                        <div className="flex items-center gap-2 text-gray-300">
                          <span className="text-sm font-medium">Amount</span>
                        </div>
                        <div className="text-white font-semibold text-lg">
                          {request.fiat_amount} {request.currency}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="text-sm text-gray-400 font-medium">Payout Details:</div>
                        <div className="p-3 bg-gray-900 rounded-lg space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-400">Account:</span>
                            <span className="text-white">{request.payout_details?.account_number}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">Name:</span>
                            <span className="text-white">{request.payout_details?.beneficiary_name}</span>
                          </div>
                          {request.payout_details?.bank_code && (
                            <div className="flex justify-between">
                              <span className="text-gray-400">Bank:</span>
                              <span className="text-white">{request.payout_details.bank_code}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {request.note && (
                        <div className="space-y-2">
                          <div className="text-sm text-gray-400 font-medium">Note:</div>
                          <div className="p-3 bg-gray-900 rounded-lg text-sm text-gray-300 italic">
                            &quot;{request.note}&quot;
                          </div>
                        </div>
                      )}

                      <div className="text-xs text-gray-500">
                        Requested {formatDistanceToNow(new Date(request.created_at), { addSuffix: true })}
                      </div>

                      {request.isExpired && (
                        <div className="rounded-lg bg-red-900/20 border border-red-800 p-3 text-sm text-red-200">
                          ⚠️ This request has expired
                        </div>
                      )}
                    </CardContent>

                    <CardFooter className="flex gap-3">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => handleReject(request.id)}
                        disabled={processingId !== null || request.isExpired}
                      >
                        <X className="w-4 h-4 mr-2" />
                        Reject
                      </Button>
                      <Button
                        className="flex-1 bg-purple-600 hover:bg-purple-700"
                        onClick={() => handleAcceptClick(request)}
                        disabled={processingId !== null || request.isExpired}
                      >
                        <Check className="w-4 h-4 mr-2" />
                        Accept & Pay
                      </Button>
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* History */}
        {historyRequests.length > 0 && (
          <div>
            <h2 className="text-2xl font-bold text-white mb-4">History</h2>
            <div className="space-y-4">
              {historyRequests.map((request: PaymentRequest) => (
                <HistoryRequestCard key={request.id} request={request} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={confirmationDialog.open} onOpenChange={(open) => {
        if (!confirmationDialog.loading && paymentStatus === 'idle' && !isGeneratingReceipt) {
          setConfirmationDialog({ open, data: null, loading: false });
        }
      }}>
        <DialogContent className="bg-gray-800 border-gray-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Confirm Payment</DialogTitle>
            <DialogDescription className="text-gray-400">
              Review the transaction details before proceeding
            </DialogDescription>
          </DialogHeader>

          {confirmationDialog.loading && !confirmationDialog.data ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
              <span className="ml-3 text-gray-300">Finding best rate...</span>
            </div>
          ) : confirmationDialog.data ? (
            <div className="space-y-4">
              {/* Payment Status Indicator */}
              {paymentStatus !== 'idle' && (
                <div className="rounded-xl bg-blue-900/20 border border-blue-800 p-4">
                  <div className="flex items-center justify-center gap-3">
                    {paymentStatus === 'detecting' && (
                      <>
                        <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
                        <div className="text-sm text-blue-200">
                          <span className="font-medium">Waiting for transaction...</span>
                        </div>
                      </>
                    )}
                    {paymentStatus === 'processing' && (
                      <>
                        <Loader2 className="w-5 h-5 text-orange-400 animate-spin" />
                        <div className="text-sm text-orange-200">
                          <span className="font-medium">Processing payout...</span>
                        </div>
                      </>
                    )}
                    {paymentStatus === 'generating_receipt' && (
                      <>
                        <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
                        <div className="text-sm text-purple-200">
                          <span className="font-medium">Generating receipt...</span>
                          <p className="text-xs mt-1">Please wait, this may take up to a minute</p>
                        </div>
                      </>
                    )}
                    {paymentStatus === 'completed' && (
                      <>
                        <CheckCircle className="w-5 h-5 text-green-400" />
                        <div className="text-sm text-green-200">
                          <span className="font-medium">Payment completed!</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Amount to Pay */}
              <div className="bg-gray-900 rounded-lg p-4 space-y-3">
                <div className="text-sm text-gray-400 font-medium">Your tokens will be converted:</div>
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold text-white">
                    {confirmationDialog.data.tokenAmountDecimal.toFixed(4)} {tokenMetadata?.symbol || 'tokens'}
                  </span>

                  <ArrowRight className="w-5 h-5 text-gray-500" />
                  <span className="text-2xl font-bold text-green-400">
                    {confirmationDialog.data.request.fiat_amount} {confirmationDialog.data.request.currency}
                  </span>
                </div>
              </div>

              {/* Trust Express Details */}
              <div className="bg-gray-900 rounded-lg p-4 space-y-2">
                <div className="text-sm text-gray-400 font-medium mb-2">Trust Express Order:</div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Exchange Rate:</span>
                    <span className="text-white font-medium">
                      1 {tokenMetadata?.symbol || 'token'} = {Number(confirmationDialog.data.trustExpressOrder.account.pricePerToken.toString())} {confirmationDialog.data.request.currency}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Order Balance:</span>
                    <span className="text-white">
                      {(Number(confirmationDialog.data.trustExpressOrder.account.amount.toString()) / 1e9).toFixed(4)} {tokenMetadata?.symbol || 'tokens'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Order Address:</span>
                    <span className="text-white font-mono text-xs">
                      {confirmationDialog.data.trustExpressOrder.publicKey.toString().slice(0, 4)}...
                      {confirmationDialog.data.trustExpressOrder.publicKey.toString().slice(-4)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Recipient Details */}
              <div className="bg-gray-900 rounded-lg p-4 space-y-2">
                <div className="text-sm text-gray-400 font-medium mb-2">Paying to:</div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Name:</span>
                    <span className="text-white">{confirmationDialog.data.request.payout_details?.beneficiary_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Account:</span>
                    <span className="text-white">{confirmationDialog.data.request.payout_details?.account_number}</span>
                  </div>
                </div>
              </div>

              {/* Warning */}
              <div className="flex items-start gap-2 p-3 bg-yellow-900/20 border border-yellow-800 rounded-lg">
                <AlertCircle className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-yellow-200">
                  Clicking confirm will prompt your wallet to sign the transaction. This transaction is irreversible.
                </p>
              </div>
            </div>
          ) : null}

          <DialogFooter className="flex gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => {
                if (paymentStatus === 'idle' && !isGeneratingReceipt) {
                  setConfirmationDialog({ open: false, data: null, loading: false });
                }
              }}
              disabled={confirmationDialog.loading || paymentStatus !== 'idle' || isGeneratingReceipt}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmPayment}
              disabled={confirmationDialog.loading || !confirmationDialog.data || paymentStatus !== 'idle' || isGeneratingReceipt}
              className="flex-1 bg-purple-600 hover:bg-purple-700"
            >
              {confirmationDialog.loading || isGeneratingReceipt ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Confirm & Sign
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receipt View Dialog */}
      {showReceipt && receiptId && (
        <Dialog open={showReceipt} onOpenChange={setShowReceipt}>
          <DialogContent className="bg-gray-800 border-gray-700 text-white max-w-md">
            <div className="text-center space-y-4 py-6">
              <CheckCircle className="w-16 h-16 text-green-400 mx-auto" />
              <div>
                <h3 className="text-xl font-bold text-white mb-2">
                  Payment Successful!
                </h3>
                <p className="text-gray-300 text-sm">
                  Your payment has been processed successfully
                </p>
              </div>
              
              <div className="space-y-3 pt-4">
                <Button
                  onClick={() => {
                    window.open(`/receipts/${receiptId}`, '_blank');
                  }}
                  className="w-full bg-blue-600 hover:bg-blue-700"
                >
                  View Receipt
                </Button>
                
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowReceipt(false);
                    setReceiptId(null);
                    setConfirmationDialog({ open: false, data: null, loading: false });
                    setPaymentStatus('idle');
                  }}
                  className="w-full"
                >
                  Close
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};

export default RequestsInbox;