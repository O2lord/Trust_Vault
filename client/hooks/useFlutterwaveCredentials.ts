// hooks/useFlutterwaveCredentials.ts
import { useState, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { toast } from 'sonner';
import bs58 from 'bs58';

interface Credential {
  id: string;
  label: string | null;
  created_at: string;
  is_active: boolean;
  updated_at: string;
}

interface CredentialWithStatus extends Credential {
  balance?: number;
  currency?: string;
  checking?: boolean;
}

interface UseFlutterwaveCredentialsReturn {
  credentials: CredentialWithStatus[];
  loading: boolean;
  fetchCredentials: () => Promise<void>;
  addCredential: (secretKey: string, label?: string) => Promise<boolean>;
  deleteCredential: (credentialId: string) => Promise<boolean>;
  checkCredentialStatus: (credentialId: string) => Promise<void>;
  verifyCredential: (secretKey: string) => Promise<{ valid: boolean; balance?: number; currency?: string }>;
  linkCredentialToBuyOrder: (trustExpressPda: string, credentialId: string) => Promise<boolean>;
}

const useFlutterwaveCredentials = (): UseFlutterwaveCredentialsReturn => {
  const { publicKey, signMessage } = useWallet();
  const [credentials, setCredentials] = useState<CredentialWithStatus[]>([]);
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

  // READ OPERATION - No signature needed
  const fetchCredentials = useCallback(async (): Promise<void> => {
    if (!publicKey) {
      console.warn('Wallet not connected');
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams({
        walletAddress: publicKey.toBase58(),
      });

      const response = await fetch(`/api/flutterwave/credentials/list?${params}`);
      const data = await response.json();

      if (response.ok) {
        setCredentials(data.credentials || []);
      } else {
        toast.error(data.error || 'Failed to fetch credentials');
        setCredentials([]);
      }
    } catch (error) {
      console.error('Error fetching credentials:', error);
      toast.error('Failed to fetch credentials');
      setCredentials([]);
    } finally {
      setLoading(false);
    }
  }, [publicKey]);

  // READ OPERATION - No signature needed
  const verifyCredential = useCallback(async (
    secretKey: string
  ): Promise<{ valid: boolean; balance?: number; currency?: string }> => {
    try {
      const params = new URLSearchParams({ secretKey: secretKey.trim() });
      const response = await fetch(`/api/flutterwave/credentials/verify?${params}`);
      const data = await response.json();

      if (response.ok && data.valid) {
        return { valid: true, balance: data.balance, currency: data.currency };
      } else {
        return { valid: false };
      }
    } catch (error) {
      console.error('Error verifying credential:', error);
      return { valid: false };
    }
  }, []);

  // WRITE OPERATION - Signature required
  const addCredential = useCallback(async (
    secretKey: string,
    label?: string
  ): Promise<boolean> => {
    if (!publicKey || !signMessage) {
      toast.error('Please connect your wallet');
      return false;
    }

    if (!secretKey.trim()) {
      toast.error('Please provide a secret key');
      return false;
    }

    try {
      const message = generateAuthMessage('store_credentials');
      const signature = await signAuthMessage(message);

      const response = await fetch('/api/flutterwave/credentials/store', {
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
        toast.success('Credentials saved successfully!');
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

  // WRITE OPERATION - Signature required
  const deleteCredential = useCallback(async (credentialId: string): Promise<boolean> => {
    if (!publicKey || !signMessage) {
      toast.error('Please connect your wallet');
      return false;
    }

    try {
      const message = generateAuthMessage('delete_credential');
      const signature = await signAuthMessage(message);

      const params = new URLSearchParams({
        credentialId,
        walletAddress: publicKey.toBase58(),
        signature,
        message,
      });

      const response = await fetch(`/api/flutterwave/credentials/delete?${params}`, {
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

  // READ OPERATION - No signature needed
  const checkCredentialStatus = useCallback(async (credentialId: string): Promise<void> => {
    if (!publicKey) {
      return;
    }

    setCredentials(prev => prev.map(c => 
      c.id === credentialId ? { ...c, checking: true } : c
    ));

    try {
      const params = new URLSearchParams({
        credentialId,
        walletAddress: publicKey.toBase58(),
      });

      const response = await fetch(`/api/flutterwave/credentials/status?${params}`);
      const data = await response.json();

      if (response.ok) {
        setCredentials(prev => prev.map(c => 
          c.id === credentialId 
            ? { 
                ...c, 
                checking: false, 
                balance: data.balance, 
                currency: data.currency, 
                is_active: data.valid 
              } 
            : c
        ));
        
        if (data.valid) {
          toast.success(`Credentials valid. Balance: ${data.balance} ${data.currency}`);
        } else {
          toast.warning('Credentials are invalid or expired');
        }
      } else {
        toast.error(data.error || 'Failed to check status');
        setCredentials(prev => prev.map(c => 
          c.id === credentialId ? { ...c, checking: false } : c
        ));
      }
    } catch (error) {
      console.error('Error checking status:', error);
      toast.error('Failed to check credential status');
      setCredentials(prev => prev.map(c => 
        c.id === credentialId ? { ...c, checking: false } : c
      ));
    }
  }, [publicKey]);

  // WRITE OPERATION - Signature required
  const linkCredentialToBuyOrder = useCallback(async (
    trustExpressPda: string,
    credentialId: string
  ): Promise<boolean> => {
    if (!publicKey || !signMessage) {
      toast.error('Please connect your wallet');
      return false;
    }

    try {
      const message = generateAuthMessage('link_credential');
      const signature = await signAuthMessage(message);

      const response = await fetch('/api/flutterwave/credentials/link', {
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
  }, [publicKey, signMessage, generateAuthMessage, signAuthMessage]);

  return {
    credentials,
    loading,
    fetchCredentials,
    addCredential,
    deleteCredential,
    checkCredentialStatus,
    verifyCredential,
    linkCredentialToBuyOrder,
  };
};

export default useFlutterwaveCredentials;