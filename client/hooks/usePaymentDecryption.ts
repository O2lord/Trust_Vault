import { useState, useEffect, useCallback, useRef } from 'react';
import { getDecryptionKey } from '@/lib/encryptionApi';
import { decryptPaymentInstructionsClient } from '@/utils/payment-encryption/clientEncryption';

export interface UsePaymentDecryptionResult {
  decryptedData: object | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
}

/**
 * Hook for decrypting payment instructions
 */
export function usePaymentDecryption(
  sellerAddress: string | null,
  trustVaultPubkey: string | null,
  encryptedData: string | null
): UsePaymentDecryptionResult {
  const [decryptedData, setDecryptedData] = useState<object | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Use ref to track if decryption has been attempted to prevent infinite loops
  const decryptionAttempted = useRef(false);
  const lastParamsRef = useRef<string>('');



  // Create a stable reference for the decryption function
  const decryptData = useCallback(async () => {
    
    
    // Early return if no encrypted data
    if (!encryptedData) {
     
      return;
    }

    // Only require trustVaultPubkey as minimum
    if (!trustVaultPubkey && !sellerAddress) {
      const errorMessage = `Missing required parameter for decryption: trustVaultPubkey`;
    
      
      setError(errorMessage);
      setLoading(false);
      return;
    }

   
    setLoading(true);
    setError(null);
    setDecryptedData(null);

    try {
      
      const keyResponse = await getDecryptionKey(trustVaultPubkey ?? undefined, sellerAddress ?? undefined);
      
    
      
      if (!keyResponse.success) {
        throw new Error(keyResponse.error || 'Failed to get decryption key');
      }

      if (!keyResponse.encryptionKey || !keyResponse.iv || !keyResponse.tag) {
        console.error("❌ Incomplete key response:", keyResponse);
        throw new Error('Incomplete decryption key data');
      }

   
      
      const decrypted = await decryptPaymentInstructionsClient({
        encryptedData,
        key: keyResponse.encryptionKey,
        iv: keyResponse.iv,
        tag: keyResponse.tag,
      });

      
      setDecryptedData(decrypted);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to decrypt payment instructions';
      console.error('❌ Decryption error:', {
        error: err,
        message: errorMessage
      });
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [sellerAddress, trustVaultPubkey, encryptedData]);

  // Effect to handle decryption with proper loop prevention
  useEffect(() => {
    // Create a unique key for current parameters
    const currentParams = `${sellerAddress || 'null'}-${trustVaultPubkey || 'null'}-${encryptedData || 'null'}`;
    
   

    // Only proceed if we have the minimum required data and parameters have changed
    if (encryptedData && trustVaultPubkey && currentParams !== lastParamsRef.current) {
     
      lastParamsRef.current = currentParams;
      decryptionAttempted.current = true;
      decryptData();
    } else if (!encryptedData || !trustVaultPubkey) {
      // Reset state if we don't have minimum required parameters
     
      setDecryptedData(null);
      setLoading(false);
      setError(null);
      decryptionAttempted.current = false;
      lastParamsRef.current = '';
    }
  }, [encryptedData, trustVaultPubkey, sellerAddress, decryptData]);

  const retry = useCallback(() => {
   
    decryptionAttempted.current = false;
    lastParamsRef.current = '';
    setError(null);
    setLoading(false);
    setDecryptedData(null);
    
    // Trigger a new decryption attempt
    if (encryptedData && trustVaultPubkey) {
      decryptData();
    }
  }, [encryptedData, trustVaultPubkey, decryptData]);

  return {
    decryptedData,
    loading,
    error,
    retry,
  };
}

/**
 * Hook for checking if data is encrypted
 */
export function useIsEncrypted(paymentInstructions: string): boolean {
  try {
    const parsed = JSON.parse(paymentInstructions);
    const isNotEncrypted = typeof parsed === 'object' && parsed !== null;
   
    return !isNotEncrypted;
  } catch (parseError: unknown) {
    const errorMessage = parseError instanceof Error ? parseError.message : 'Unknown parse error';
   
    return true;
  }
}