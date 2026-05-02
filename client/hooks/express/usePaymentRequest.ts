// hooks/usePaymentRequests.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useWallet } from '@solana/wallet-adapter-react';
import { toast } from 'sonner';
import bs58 from 'bs58';

interface PayoutDetails {
  type: "bank_transfer" | "mobile_money" | "flutterwave_wallet";
  account_number: string;
  beneficiary_name: string;
  bank_code?: string;
  phone_number?: string;
  network?: string;
}

interface CreateRequestParams {
  requestType: 'token' | 'fiat';
  payerWallet: string;
  fiatAmount?: number;
  currency?: string;
  tokenMint?: string;
  tokenAmount?: number;
  payoutDetails?: PayoutDetails;
  note?: string;
}



interface FulfillRequestParams {
  requestId: string;
}

export function usePaymentRequests() {
  const { publicKey, signMessage } = useWallet();
  const queryClient = useQueryClient();

  // Fetch incoming requests (where user is the payer)
  const incomingRequests = useQuery({
    queryKey: ['payment-requests', 'incoming', publicKey?.toString()],
    queryFn: async () => {
      if (!publicKey) return [];
      
      const response = await fetch(
        `/api/payment-requests/list?wallet=${publicKey.toString()}&type=incoming`
      );
      
      if (!response.ok) throw new Error('Failed to fetch requests');
      
      const data = await response.json();
      return data.requests;
    },
    enabled: !!publicKey,
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  // Fetch outgoing requests (where user is the requester)
  const outgoingRequests = useQuery({
    queryKey: ['payment-requests', 'outgoing', publicKey?.toString()],
    queryFn: async () => {
      if (!publicKey) return [];
      
      const response = await fetch(
        `/api/payment-requests/list?wallet=${publicKey.toString()}&type=outgoing`
      );
      
      if (!response.ok) throw new Error('Failed to fetch requests');
      
      const data = await response.json();
      return data.requests;
    },
    enabled: !!publicKey,
    refetchInterval: 30000,
  });

  // Create new request
  const createRequest = useMutation({
    mutationFn: async (params: CreateRequestParams) => {
      if (!publicKey || !signMessage) {
        throw new Error('Wallet not connected');
      }

      // Create message to sign
    let message: string;
    if (params.requestType === 'token') {
      message = `Request ${params.tokenAmount} tokens (${params.tokenMint}) from ${params.payerWallet}`;
    } else {
      message = `Request ${params.fiatAmount} ${params.currency} from ${params.payerWallet}`;
    }
    const messageBytes = new TextEncoder().encode(message);
    const signatureBytes = await signMessage(messageBytes);
    const signature = bs58.encode(signatureBytes);

    const response = await fetch('/api/payment-requests/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...params,
        requesterWallet: publicKey.toString(),
        signature,
        message,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create request');
    }

    return response.json();
  },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-requests'] });
      toast.success('Payment request sent successfully!');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Fulfill request (returns request details for instant reserve)
  const fulfillRequest = useMutation({
    mutationFn: async (params: FulfillRequestParams) => {
      if (!publicKey || !signMessage) {
        throw new Error('Wallet not connected');
      }

      // Create message to sign
      const message = `Fulfill payment request ${params.requestId}`;
      const messageBytes = new TextEncoder().encode(message);
      const signatureBytes = await signMessage(messageBytes);
      const signature = bs58.encode(signatureBytes);

      const response = await fetch('/api/payment-requests/fulfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: params.requestId,
          payerWallet: publicKey.toString(),
          signature,
          message,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fulfill request');
      }

      return response.json();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Reject request
  const rejectRequest = useMutation({
    mutationFn: async (requestId: string) => {
      if (!publicKey || !signMessage) {
        throw new Error('Wallet not connected');
      }

      // Create message to sign
      const message = `Reject payment request ${requestId}`;
      const messageBytes = new TextEncoder().encode(message);
      const signatureBytes = await signMessage(messageBytes);
      const signature = bs58.encode(signatureBytes);

      const response = await fetch('/api/payment-requests/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId,
          status: 'rejected',
          payerWallet: publicKey.toString(),
          signature,
          message,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to reject request');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-requests'] });
      toast.success('Request rejected');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

// Complete request (called after successful transaction)
const completeRequest = useMutation({
  mutationFn: async ({ requestId, signature }: { requestId: string; signature: string }) => {

    
    const requestBody = {
      requestId,
      status: 'completed' as const,
      transactionSignature: signature,
    };
    

    
    const response = await fetch('/api/payment-requests/update-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });


    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Response not OK:', errorText);
      throw new Error('Failed to complete request');
    }

    const result = await response.json();

    return result;
  },
  onSuccess: (data) => {

    queryClient.invalidateQueries({ queryKey: ['payment-requests'] });
  },
  onError: (error) => {
    console.error('❌ completeRequest onError:', error);
  },
});

 // Cancel request (for requesters to cancel their own requests)
  const cancelRequest = useMutation({
    mutationFn: async (requestId: string) => {
      if (!publicKey || !signMessage) {
        throw new Error('Wallet not connected');
      }

      // Create message to sign
      const message = `Cancel payment request ${requestId}`;
      const messageBytes = new TextEncoder().encode(message);
      const signatureBytes = await signMessage(messageBytes);
      const signature = bs58.encode(signatureBytes);

      const response = await fetch('/api/payment-requests/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId,
          requesterWallet: publicKey.toString(),
          signature,
          message,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to cancel request');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-requests'] });
      toast.success('Request cancelled successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  return {
    incomingRequests,
    outgoingRequests,
    createRequest,
    fulfillRequest,
    rejectRequest,
    completeRequest,
    cancelRequest,
  };
}