import { useState, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { toast } from 'sonner';
import bs58 from 'bs58';

interface SellerCredential {
  id: string;
  label: string | null;
  created_at: string;
  is_active: boolean;
  flutterwave_subaccount_id: string | null;
  processor: 'flutterwave' | 'opay' | 'paystack' | 'korapay';
  processor_account_id?: string | null;
}

interface UseSellerFlutterwaveCredentialsReturn {
  credentials: SellerCredential[];
  loading: boolean;
  fetchCredentials: () => Promise<void>;
  addCredential: (secretKey: string, label?: string) => Promise<boolean>;
  deleteCredential: (credentialId: string) => Promise<boolean>;
  linkToSellOrder: (trustExpressPda: string, credentialId: string) => Promise<boolean>;
}

const useSellerFlutterwaveCredentials = (): UseSellerFlutterwaveCredentialsReturn => {
  const { publicKey, signMessage } = useWallet();
  const [credentials, setCredentials] = useState<SellerCredential[]>([]);
  const [loading, setLoading] = useState(false);

  const generateAuthMessage = useCallback((action: string): string => {
    const timestamp = Date.now();
    const nonce = Math.random().toString(36).substring(2, 15);
    return `Sign this message to authenticate with TrustExpress.\n\nAction: ${action}\nTimestamp: ${timestamp}\nNonce: ${nonce}\n\nThis signature will not cost any gas fees.`;
  }, []);

  const signAuthMessage = useCallback(async (message: string): Promise<string> => {
    if (!signMessage || !publicKey) {
      throw new Error('Wallet not connected');
    }
    const messageBytes = new TextEncoder().encode(message);
    const signature = await signMessage(messageBytes);
    return bs58.encode(signature);
  }, [signMessage, publicKey]);

  const fetchCredentials = useCallback(async (): Promise<void> => {
    if (!publicKey) return;

    setLoading(true);
    try {
      const params = new URLSearchParams({
        walletAddress: publicKey.toBase58(),
      });

      // Fetch from all processors in parallel
      const [flwRes, opayRes, paystackRes, korapayRes] = await Promise.allSettled([
        fetch(`/api/flutterwave/seller-credentials/list?${params}`),
        fetch(`/api/payment-processors/opay/seller-credentials/list?${params}`),
        fetch(`/api/payment-processors/paystack/seller-credentials/list?${params}`),
        fetch(`/api/payment-processors/korapay/seller-credentials/list?${params}`),
      ]);

      const merged: SellerCredential[] = [];

      if (flwRes.status === 'fulfilled' && flwRes.value.ok) {
        const data = await flwRes.value.json();
        merged.push(...(data.credentials || []).map((c: any) => ({
          ...c,
          processor: 'flutterwave' as const,
        })));
      }

      if (opayRes.status === 'fulfilled' && opayRes.value.ok) {
        const data = await opayRes.value.json();
        merged.push(...(data.credentials || []).map((c: any) => ({
          ...c,
          processor: 'opay' as const,
        })));
      }

      if (paystackRes.status === 'fulfilled' && paystackRes.value.ok) {
        const data = await paystackRes.value.json();
        merged.push(...(data.credentials || []).map((c: any) => ({
          ...c,
          processor: 'paystack' as const,
        })));
      }

      if (korapayRes.status === 'fulfilled' && korapayRes.value.ok) {
        const data = await korapayRes.value.json();
        merged.push(...(data.credentials || []).map((c: any) => ({
          ...c,
          processor: 'korapay' as const,
        })));
      }

      // Deduplicate by id
      const seen = new Set<string>();
      const deduped = merged.filter((c) => {
        if (seen.has(c.id)) return false;
        seen.add(c.id);
        return true;
      });

      // Sort newest first
      deduped.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setCredentials(deduped);
    } catch (error) {
      console.error('Error fetching credentials:', error);
      toast.error('Failed to fetch credentials');
      setCredentials([]);
    } finally {
      setLoading(false);
    }
  }, [publicKey]);

  const addCredential = useCallback(async (
    secretKey: string,
    label?: string
  ): Promise<boolean> => {
    if (!publicKey || !signMessage) {
      toast.error('Please connect your wallet');
      return false;
    }

    try {
      const message = generateAuthMessage('store_seller_credentials');
      const signature = await signAuthMessage(message);

      const response = await fetch('/api/flutterwave/seller-credentials/store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: publicKey.toBase58(),
          secretKey: secretKey.trim(),
          signature,
          message,
          label: label?.trim() || null,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        toast.success('Seller credentials saved successfully!');
        await fetchCredentials();
        return true;
      } else {
        toast.error(data.error || 'Failed to save credentials');
        return false;
      }
    } catch (error) {
      console.error('Error saving credentials:', error);
      toast.error('Failed to save credentials');
      return false;
    }
  }, [publicKey, signMessage, generateAuthMessage, signAuthMessage, fetchCredentials]);

  const deleteCredential = useCallback(async (credentialId: string): Promise<boolean> => {
    if (!publicKey || !signMessage) {
      toast.error('Please connect your wallet');
      return false;
    }

    try {
      const message = generateAuthMessage('delete_seller_credential');
      const signature = await signAuthMessage(message);

      const params = new URLSearchParams({
        credentialId,
        walletAddress: publicKey.toBase58(),
        signature,
        message,
      });

      const response = await fetch(`/api/flutterwave/seller-credentials/delete?${params}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (response.ok && data.success) {
        toast.success('Credential deleted successfully');
        await fetchCredentials();
        return true;
      } else {
        toast.error(data.error || 'Failed to delete credential');
        return false;
      }
    } catch (error) {
      console.error('Error deleting credential:', error);
      toast.error('Failed to delete credential');
      return false;
    }
  }, [publicKey, signMessage, generateAuthMessage, signAuthMessage, fetchCredentials]);

  const linkToSellOrder = useCallback(async (
    trustExpressPda: string,
    credentialId: string
  ): Promise<boolean> => {
    if (!publicKey || !signMessage) {
      toast.error('Please connect your wallet');
      return false;
    }

    try {
      const message = generateAuthMessage('link_sell_order_credential');
      const signature = await signAuthMessage(message);

      // Route to correct endpoint based on processor
      const credential = credentials.find(c => c.id === credentialId);
      const endpoint =
        credential?.processor === 'korapay'
          ? '/api/payment-processors/korapay/seller-credentials/link'
          : credential?.processor === 'paystack'
            ? '/api/payment-processors/paystack/seller-credentials/link'
            : credential?.processor === 'opay'
              ? '/api/payment-processors/opay/seller-credentials/link'
              : '/api/flutterwave/seller-credentials/link';

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trustExpressPda,
          credentialId,
          walletAddress: publicKey.toBase58(),
          signature,
          message,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        return true;
      } else {
        console.error('Failed to link credential:', data.error);
        return false;
      }
    } catch (error) {
      console.error('Error linking credential:', error);
      return false;
    }
  }, [publicKey, signMessage, generateAuthMessage, signAuthMessage, credentials]);

  return {
    credentials,
    loading,
    fetchCredentials,
    addCredential,
    deleteCredential,
    linkToSellOrder,
  };
};

export default useSellerFlutterwaveCredentials;