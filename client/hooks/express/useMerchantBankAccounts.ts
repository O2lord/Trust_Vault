// hooks/merchant/useMerchantBankAccounts.ts
import { useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import bs58 from 'bs58';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MerchantBankAccount {
  id: string;
  label: string;
  bank_name: string;
  bank_code: string;
  account_number: string;
  account_name: string;
  currency: string;
  is_default: boolean;
  created_at: string;
}

export interface AddAccountInput {
  label?: string;
  bankName: string;
  bankCode: string;
  accountNumber: string;
  accountName: string;
  currency: string;
  setAsDefault?: boolean;
}

export interface UpdateAccountInput {
  accountId: string;
  label?: string;
  bankName?: string;
  bankCode?: string;
  accountNumber?: string;
  accountName?: string;
  currency?: string;
  setAsDefault?: boolean;
}

// ─── Auth helpers — must match generateAuthMessage in @/lib/solana-auth.ts ───
//
// validateMessageTimestamp() extracts /Timestamp:\s*(\d+)/ and compares it
// against Date.now() in MILLISECONDS. The full message format must be:
//
//   Sign this message to authenticate with TrustExpress.\n\n
//   Action: <action>\n
//   Timestamp: <Date.now()>\n        <-- milliseconds, NOT unix seconds
//   Nonce: <random>\n
//   \n
//   This signature will not cost any gas fees.
//
// Identical to BuyerFlutterwaveCredentialManager.generateAuthMessage().

function buildAuthMessage(action: string): string {
  const timestamp = Date.now(); // milliseconds — matches validateMessageTimestamp
  const nonce = Math.random().toString(36).substring(2, 15);
  return (
    `Sign this message to authenticate with TrustExpress.\n\n` +
    `Action: ${action}\n` +
    `Timestamp: ${timestamp}\n` +
    `Nonce: ${nonce}\n` +
    `\nThis signature will not cost any gas fees.`
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useMerchantBankAccounts() {
  const { publicKey, signMessage } = useWallet();
  const queryClient = useQueryClient();
  const walletAddress = publicKey?.toString() ?? null;

  // Identical pattern to BuyerFlutterwaveCredentialManager.signAuthMessage()
  const signAuthMessage = useCallback(
    async (message: string): Promise<string> => {
      if (!signMessage) throw new Error('Wallet does not support message signing');
      const messageBytes = new TextEncoder().encode(message);
      const signature = await signMessage(messageBytes);
      return bs58.encode(signature);
    },
    [signMessage]
  );

  // ── LIST ─────────────────────────────────────────────────────────────────
  const {
    data: accounts = [],
    isLoading,
    error,
    refetch,
  } = useQuery<MerchantBankAccount[]>({
    queryKey: ['merchant-bank-accounts', walletAddress],
    queryFn: async () => {
      if (!walletAddress) return [];
      const res = await fetch(
        `/api/merchant/bank-accounts/list?walletAddress=${walletAddress}`
      );
      if (!res.ok) throw new Error('Failed to fetch bank accounts');
      const json = await res.json();
      return json.accounts;
    },
    enabled: !!walletAddress,
    staleTime: 30_000,
  });

  // ── ADD ──────────────────────────────────────────────────────────────────
  const addMutation = useMutation({
    mutationFn: async (input: AddAccountInput): Promise<MerchantBankAccount> => {
      if (!walletAddress) throw new Error('Wallet not connected');
      const message = buildAuthMessage('store_merchant_bank_account');
      const signature = await signAuthMessage(message);

      const res = await fetch('/api/merchant/bank-accounts/store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress, signature, message, ...input }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to save account');
      return json.account;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['merchant-bank-accounts', walletAddress] });
    },
  });

  // ── UPDATE ───────────────────────────────────────────────────────────────
  const updateMutation = useMutation({
    mutationFn: async (input: UpdateAccountInput): Promise<MerchantBankAccount> => {
      if (!walletAddress) throw new Error('Wallet not connected');
      const message = buildAuthMessage('update_merchant_bank_account');
      const signature = await signAuthMessage(message);

      const res = await fetch('/api/merchant/bank-accounts/update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress, signature, message, ...input }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to update account');
      return json.account;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['merchant-bank-accounts', walletAddress] });
    },
  });

  // ── DELETE ───────────────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: async (accountId: string): Promise<void> => {
      if (!walletAddress) throw new Error('Wallet not connected');
      const message = buildAuthMessage('delete_merchant_bank_account');
      const signature = await signAuthMessage(message);

      const params = new URLSearchParams({
        accountId,
        walletAddress,
        signature,
        message,
      });

      const res = await fetch(`/api/merchant/bank-accounts/delete?${params}`, {
        method: 'DELETE',
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to delete account');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['merchant-bank-accounts', walletAddress] });
    },
  });

  return {
    accounts,
    isLoading,
    error,
    refetch,
    walletAddress,
    addAccount: addMutation.mutateAsync,
    updateAccount: updateMutation.mutateAsync,
    deleteAccount: deleteMutation.mutateAsync,
    isAdding: addMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    addError: addMutation.error,
    updateError: updateMutation.error,
    deleteError: deleteMutation.error,
  };
}