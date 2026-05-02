// components/TrustExpress/Payment/OutgoingRequests.tsx
"use client";
import React from "react";
import { usePaymentRequests } from "@/hooks/express/usePaymentRequest";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, User, DollarSign, Coins, Clock, Check, X, Copy, ExternalLink, AlertCircle, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useTokenMetadata } from "@/hooks/useTokenMetadata";
import { toast } from "sonner";
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
  // Fiat fields
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
  // Token fields
  token_mint?: string;
  token_amount?: number;
  note?: string;
  status: 'pending' | 'completed' | 'rejected' | 'cancelled' | 'expired';
  created_at: string;
  updated_at: string;
  transaction_signature?: string;
  isExpired?: boolean;
}

// Outgoing Fiat Request Card
const OutgoingFiatRequestCard: React.FC<{
  request: PaymentRequest;
  onCancel: (requestId: string) => void;
  processingId: string | null;
}> = ({ request, onCancel, processingId }) => {
  const [isExpanded, setIsExpanded] = React.useState(false);
  
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'border-yellow-600 text-yellow-400';
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
      case 'pending':
        return <Clock className="w-3 h-3 mr-1" />;
      case 'completed':
        return <Check className="w-3 h-3 mr-1" />;
      case 'rejected':
        return <X className="w-3 h-3 mr-1" />;
      case 'cancelled':
        return <X className="w-3 h-3 mr-1" />; 
      default:
        return <Clock className="w-3 h-3 mr-1" />;
    }
  };

  // Don't show chevron for pending requests (they're always expanded)
  const showChevron = request.status !== 'pending';

  return (
    <Card 
      className={`bg-gray-800 border-gray-700 ${showChevron ? 'cursor-pointer hover:border-gray-600 transition-colors' : ''}`}
      onClick={showChevron ? () => setIsExpanded(!isExpanded) : undefined}
    >
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3 flex-1">
            <div className="bg-purple-500/20 p-2 rounded-lg">
              <DollarSign className="w-5 h-5 text-purple-400" />
            </div>
            <div className="flex-1">
              <CardTitle className="text-white text-lg">
                Fiat Payment Request
              </CardTitle>
              <CardDescription className="text-gray-400">
                To {request.payer_wallet.slice(0, 4)}...{request.payer_wallet.slice(-4)}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={getStatusColor(request.status)}>
              {getStatusIcon(request.status)}
              {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
            </Badge>
            {showChevron && (
              isExpanded ? (
                <ChevronUp className="w-5 h-5 text-gray-400" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-400" />
              )
            )}
          </div>
        </div>
      </CardHeader>

      {(request.status === 'pending' || isExpanded) && (
        <CardContent className="space-y-4" onClick={(e) => e.stopPropagation()}>
          {/* Amount */}
          <div className="flex items-center justify-between p-4 bg-gray-900 rounded-lg">
            <div className="flex items-center gap-2 text-gray-300">
              <span className="text-sm font-medium">Amount Requested</span>
            </div>
            <div className="text-white font-semibold text-lg">
              {request.fiat_amount} {request.currency}
            </div>
          </div>

          {/* Payout Details */}
          <div className="space-y-2">
            <div className="text-sm text-gray-400 font-medium">Your Payout Details:</div>
            <div className="p-3 bg-gray-900 rounded-lg space-y-2 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Account:</span>
                <div className="flex items-center gap-2">
                  <span className="text-white">{request.payout_details?.account_number}</span>
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

          {/* Note */}
          {request.note && (
            <div className="space-y-2">
              <div className="text-sm text-gray-400 font-medium">Note:</div>
              <div className="p-3 bg-gray-900 rounded-lg text-sm text-gray-300 italic">
                &quot;{request.note}&quot;
              </div>
            </div>
          )}

          {/* Transaction Signature (if completed) */}
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

          {/* Timestamp */}
          <div className="text-xs text-gray-500">
            {request.status === 'pending' 
              ? `Sent ${formatDistanceToNow(new Date(request.created_at), { addSuffix: true })}`
              : `${request.status.charAt(0).toUpperCase() + request.status.slice(1)} ${formatDistanceToNow(new Date(request.updated_at), { addSuffix: true })}`
            }
          </div>

          {/* Expired Warning */}
          {request.isExpired && (
            <div className="rounded-lg bg-red-900/20 border border-red-800 p-3 text-sm text-red-200 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              This request has expired
            </div>
          )}
        </CardContent>
      )}

      {request.status !== 'pending' && !isExpanded && (
        <CardContent>
          <div className="text-xs text-gray-500">
            {request.status.charAt(0).toUpperCase() + request.status.slice(1)} {formatDistanceToNow(new Date(request.updated_at), { addSuffix: true })}
          </div>
        </CardContent>
      )}

      {/* Cancel Button for Pending Requests */}
      {request.status === 'pending' && !request.isExpired && (
        <CardFooter>
          <Button
            variant="outline"
            className="w-full border-red-600 text-red-400 hover:bg-red-900/20"
            onClick={() => onCancel(request.id)}
            disabled={processingId !== null}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Cancel Request
          </Button>
        </CardFooter>
      )}
    </Card>
  );
};


// Outgoing Token Request Card
const OutgoingTokenRequestCard: React.FC<{
  request: PaymentRequest;
  onCancel: (requestId: string) => void;
  processingId: string | null;
}> = ({ request, onCancel, processingId }) => {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const { metadata } = useTokenMetadata(request.token_mint || "");

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'border-yellow-600 text-yellow-400';
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
      case 'pending':
        return <Clock className="w-3 h-3 mr-1" />;
      case 'completed':
        return <Check className="w-3 h-3 mr-1" />;
      case 'rejected':
        return <X className="w-3 h-3 mr-1" />;
      case 'cancelled':
        return <X className="w-3 h-3 mr-1" />;
      default:
        return <Clock className="w-3 h-3 mr-1" />;
    }
  };

  const showChevron = request.status !== 'pending';

  return (
    <Card 
      className={`bg-gray-800 border-gray-700 ${showChevron ? 'cursor-pointer hover:border-gray-600 transition-colors' : ''}`}
      onClick={showChevron ? () => setIsExpanded(!isExpanded) : undefined}
    >
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3 flex-1">
            <div className="bg-green-500/20 p-2 rounded-lg">
              <Coins className="w-5 h-5 text-green-400" />
            </div>
            <div className="flex-1">
              <CardTitle className="text-white text-lg">
                Token Payment Request
              </CardTitle>
              <CardDescription className="text-gray-400">
                To {request.payer_wallet.slice(0, 4)}...{request.payer_wallet.slice(-4)}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={getStatusColor(request.status)}>
              {getStatusIcon(request.status)}
              {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
            </Badge>
            {showChevron && (
              isExpanded ? (
                <ChevronUp className="w-5 h-5 text-gray-400" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-400" />
              )
            )}
          </div>
        </div>
      </CardHeader>

      {(request.status === 'pending' || isExpanded) && (
        <CardContent className="space-y-4" onClick={(e) => e.stopPropagation()}>
          {/* Amount */}
          <div className="flex items-center justify-between p-4 bg-gray-900 rounded-lg">
            <div className="flex items-center gap-2 text-gray-300">
              <span className="text-sm font-medium">Amount Requested</span>
            </div>
            <div className="text-white font-semibold text-lg">
              {request.token_amount} {metadata?.symbol || 'tokens'}
            </div>
          </div>

          {/* Token Details */}
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

          {/* Note */}
          {request.note && (
            <div className="space-y-2">
              <div className="text-sm text-gray-400 font-medium">Note:</div>
              <div className="p-3 bg-gray-900 rounded-lg text-sm text-gray-300 italic">
                &quot;{request.note}&quot;
              </div>
            </div>
          )}

          {/* Transaction Signature (if completed) */}
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

          {/* Timestamp */}
          <div className="text-xs text-gray-500">
            {request.status === 'pending' 
              ? `Sent ${formatDistanceToNow(new Date(request.created_at), { addSuffix: true })}`
              : `${request.status.charAt(0).toUpperCase() + request.status.slice(1)} ${formatDistanceToNow(new Date(request.updated_at), { addSuffix: true })}`
            }
          </div>

          {/* Expired Warning */}
          {request.isExpired && (
            <div className="rounded-lg bg-red-900/20 border border-red-800 p-3 text-sm text-red-200 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              This request has expired
            </div>
          )}
        </CardContent>
      )}

      {request.status !== 'pending' && !isExpanded && (
        <CardContent>
          <div className="text-xs text-gray-500">
            {request.status.charAt(0).toUpperCase() + request.status.slice(1)} {formatDistanceToNow(new Date(request.updated_at), { addSuffix: true })}
          </div>
        </CardContent>
      )}

      {/* Cancel Button for Pending Requests */}
      {request.status === 'pending' && !isExpanded && (
        <CardFooter>
          <Button
            variant="outline"
            className="w-full border-red-600 text-red-400 hover:bg-red-900/20"
            onClick={() => onCancel(request.id)}
            disabled={processingId !== null}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Cancel Request
          </Button>
        </CardFooter>
      )}
    </Card>
  );
};


const OutgoingRequests: React.FC = () => {
  const { outgoingRequests, cancelRequest } = usePaymentRequests();
  const [processingId, setProcessingId] = React.useState<string | null>(null);
  const [cancelDialog, setCancelDialog] = React.useState<{
    open: boolean;
    requestId: string | null;
  }>({
    open: false,
    requestId: null,
  });

  const handleCancelClick = (requestId: string) => {
    setCancelDialog({ open: true, requestId });
  };

  const handleConfirmCancel = async () => {
    if (!cancelDialog.requestId) return;

    setProcessingId(cancelDialog.requestId);
    
    try {
      await cancelRequest.mutateAsync(cancelDialog.requestId);
      await outgoingRequests.refetch();
      toast.success('Request cancelled successfully');
      setCancelDialog({ open: false, requestId: null });
    } catch (error) {
      console.error('Error cancelling request:', error);
      toast.error('Failed to cancel request');
    } finally {
      setProcessingId(null);
    }
  };

  if (outgoingRequests.isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
      </div>
    );
  }

  const pendingRequests = outgoingRequests.data?.filter((r: PaymentRequest) => r.status === 'pending') || [];
  const historyRequests = outgoingRequests.data?.filter((r: PaymentRequest) => r.status !== 'pending') || [];

  return (
    <>
      <div className="space-y-6">
        {/* Pending Requests */}
        <div>
          <h2 className="text-2xl font-bold text-white mb-4">Sent Requests</h2>
          
          {pendingRequests.length === 0 ? (
            <Card className="bg-gray-800 border-gray-700">
              <CardContent className="py-12 text-center">
                <div className="text-gray-400 mb-2">No pending sent requests</div>
                <div className="text-sm text-gray-500">
                  Requests you send to others will appear here
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {pendingRequests.map((request: PaymentRequest) => {
                if (request.request_type === 'token') {
                  return (
                    <OutgoingTokenRequestCard
                      key={request.id}
                      request={request}
                      onCancel={handleCancelClick}
                      processingId={processingId}
                    />
                  );
                }
                
                return (
                  <OutgoingFiatRequestCard
                    key={request.id}
                    request={request}
                    onCancel={handleCancelClick}
                    processingId={processingId}
                  />
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
              {historyRequests.map((request: PaymentRequest) => {
                if (request.request_type === 'token') {
                  return (
                    <OutgoingTokenRequestCard
                      key={request.id}
                      request={request}
                      onCancel={handleCancelClick}
                      processingId={processingId}
                    />
                  );
                }
                
                return (
                  <OutgoingFiatRequestCard
                    key={request.id}
                    request={request}
                    onCancel={handleCancelClick}
                    processingId={processingId}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Cancel Confirmation Dialog */}
      <Dialog open={cancelDialog.open} onOpenChange={(open) => {
        if (!processingId) {
          setCancelDialog({ open, requestId: null });
        }
      }}>
        <DialogContent className="bg-gray-800 border-gray-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Cancel Request?</DialogTitle>
            <DialogDescription className="text-gray-400">
              Are you sure you want to cancel this payment request? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="flex gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setCancelDialog({ open: false, requestId: null })}
              disabled={processingId !== null}
              className="flex-1"
            >
              No, Keep It
            </Button>
            <Button
              onClick={handleConfirmCancel}
              disabled={processingId !== null}
              className="flex-1 bg-red-600 hover:bg-red-700"
            >
              {processingId ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Cancelling...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Yes, Cancel
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default OutgoingRequests;