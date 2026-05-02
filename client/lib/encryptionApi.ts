/**
 * Frontend API helper for encryption operations
 */

export interface EncryptionApiResponse {
  success: boolean;
  encryptedData?: string;
  keyId?: string;
  error?: string;
}

export interface AssociationApiResponse {
  success: boolean;
  message?: string;
  keyDestroyed?: boolean;
  error?: string;
}

export interface DecryptionApiResponse {
  success: boolean;
  encryptionKey?: string;
  iv?: string;
  tag?: string;
  keyId?: string;
  error?: string;
}

/**
 * Encrypt payment instructions via API
 */
export async function encryptPaymentInstructions(
  paymentInstructions: object
): Promise<EncryptionApiResponse> {
  try {
    const response = await fetch('/api/encryption-api/encrypt-payment-instruction', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ paymentInstructions }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to encrypt payment instructions');
    }

    return data;
  } catch (error) {
    console.error('Encryption API error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Associate encryption key with trust vault and/or seller pubkey
 */
export async function associateKeyWithVault(
  keyId: string,
  trustVaultPubkey?: string,
  sellerPubkey?: string
): Promise<AssociationApiResponse> {
  try {
  

    const response = await fetch('/api/encryption-api/associate-keys', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        keyId, 
        trustVaultPubkey, 
        sellerPubkey
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to associate key');
    }

    return data;
  } catch (error) {
    console.error('Association API error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Retrieve decryption key for trust vault and/or seller pubkey
 */
export async function getDecryptionKey(
  trustVaultPubkey?: string,
  sellerPubkey?: string
): Promise<DecryptionApiResponse> {
  try {
   

    const response = await fetch('/api/encryption-api/decrypt-key', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        trustVaultPubkey, 
        sellerPubkey 
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      if (response.status === 404) {
        return {
          success: false,
          error: 'Payment instructions no longer available',
        };
      }
      throw new Error(data.error || 'Failed to retrieve decryption key');
    }

    return data;
  } catch (error) {
    console.error('Decryption API error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Close trust vault and destroy encryption key
 */
export async function closeVault(
  trustVaultPubkey: string,
  reason: 'completed' | 'cancelled' | 'disputed' | 'manual' | 'dispute_resolved',
  initiatedBy: string
): Promise<AssociationApiResponse> {
  try {
  
    
    const response = await fetch('/api/encryption-api/close-vault', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ trustVaultPubkey, reason, initiatedBy }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to close vault');
    }

 

    return data;
  } catch (error) {
    console.error('Close vault API error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Directly destroy an encryption key
 */
export async function destroyKey(
  trustVaultPubkey?: string,
  sellerPubkey?: string,
  reason?: string
): Promise<AssociationApiResponse> {
  try {
 
    
    const response = await fetch('/api/encryption-api/destroy-key', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        trustVaultPubkey, 
        sellerPubkey, // NEW: Support seller-specific destruction
        reason: reason || 'Manual destruction' 
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to destroy key');
    }

    return data;
  } catch (error) {
    console.error('Destroy key API error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}