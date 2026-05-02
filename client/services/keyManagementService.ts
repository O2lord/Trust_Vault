import { trustVaultKeyRepository } from '../lib/supabase/database';
import { AssociateKeyInput, DestroyKeyInput } from '../models/trustVaultKeys';

import { logEncryptionOperation } from './encryptionService';

export interface KeyAssociationResult {
  success: boolean;
  message: string;
}

export interface KeyRetrievalResult {
  encryptionKey: string;
  iv: string;
  tag: string;
  keyId: string;
}

/**
 * Associate an encryption key with a trust vault and/or seller pubkey
 */
export async function associateKeyWithVault(
  input: AssociateKeyInput
): Promise<KeyAssociationResult> {
  try {
    // Validate input - must have at least one target
    if (!input.keyId) {
      throw new Error('Key ID is required');
    }

    if (!input.trustVaultPubkey && !input.sellerPubkey) {
      throw new Error('Either trust vault pubkey or seller pubkey is required');
    }

    // Find the pending key
    const key = await trustVaultKeyRepository.findByKeyId(input.keyId);
    if (!key) {
      throw new Error('Key not found');
    }

    if (key.status !== 'pending') {
      throw new Error('Key is not in pending status');
    }

    // Associate the key
    await trustVaultKeyRepository.associate(input);

   

    // Log the operation for audit purposes
    logEncryptionOperation('associate', input.keyId, input.trustVaultPubkey, true);

    return {
      success: true,
      message: 'Key associated successfully',
    };
  } catch (error) {
    console.error('Key association error:', error);
    
    // Log the failed operation
    if (input.keyId) {
      logEncryptionOperation('associate', input.keyId, input.trustVaultPubkey, false, 
        error instanceof Error ? error.message : 'Unknown error');
    }
    
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to associate key',
    };
  }
}

/**
 * Retrieve encryption key for decryption with enhanced lookup logic
 */
export async function retrieveDecryptionKey(
  trustVaultPubkey?: string,
  sellerPubkey?: string
): Promise<KeyRetrievalResult> {
  try {
   
    
    let key = null;

    if (trustVaultPubkey && sellerPubkey) {
      // Buy order reservation: lookup by both vault and seller
      
      key = await trustVaultKeyRepository.findByVaultAndSeller(trustVaultPubkey, sellerPubkey);
    } else if (trustVaultPubkey) {
      // Sell order: lookup by vault only (no seller)
      
      key = await trustVaultKeyRepository.findByTrustVaultPubkey(trustVaultPubkey);
    } else if (sellerPubkey) {
      // Direct seller lookup: get all active keys for seller
      
      const sellerKeys = await trustVaultKeyRepository.findBySellerPubkey(sellerPubkey);
      
      if (sellerKeys.length === 0) {
        throw new Error('No encryption keys found for this seller');
      } else if (sellerKeys.length === 1) {
        key = sellerKeys[0];
      } else {
        // Multiple keys found - need more specific lookup
        throw new Error(`Multiple encryption keys found for seller. Please specify trust vault pubkey. Found ${sellerKeys.length} keys.`);
      }
    } else {
      throw new Error('Must provide either trustVaultPubkey or sellerPubkey');
    }
    
    if (!key) {
    
      // Debug: Try to find any keys for debugging
      if (trustVaultPubkey) {
        const allKeys = await trustVaultKeyRepository.findAllByTrustVaultPubkey(trustVaultPubkey);
     
      }
      
      throw new Error('No encryption key found for the specified criteria');
    }

    if (key.status !== 'active') {
     
      throw new Error('Encryption key is not active');
    }

    if (!key.encryptionKey) {
     
      throw new Error('Encryption key has been destroyed');
    }

    

    // Increment access count for audit purposes
    await trustVaultKeyRepository.incrementAccessCount(key.keyId);

   

    // Log the operation for audit purposes
    logEncryptionOperation('decrypt', key.keyId, trustVaultPubkey, true);

    return {
      encryptionKey: key.encryptionKey,
      iv: key.iv,
      tag: key.tag,
      keyId: key.keyId,
    };
  } catch (error) {
    console.error('❌ Service: Key retrieval error:', error);
    
    // Log the failed operation
    logEncryptionOperation('decrypt', 'unknown', trustVaultPubkey, false, 
      error instanceof Error ? error.message : 'Unknown error');
    
    throw new Error('Failed to retrieve decryption key');
  }
}

/**
 * Destroy encryption key for a trust vault and/or seller
 */
export async function destroyVaultKey(
  input: DestroyKeyInput
): Promise<void> {
  try {
   

    // Destroy the key(s)
    await trustVaultKeyRepository.destroy(input);

  

    // Log the operation for audit purposes
    logEncryptionOperation('destroy', 'multiple', input.trustVaultPubkey, true);
  } catch (error) {
    console.error('❌ Service: Key destruction error:', error);
    
    // Log the failed operation
    logEncryptionOperation('destroy', 'unknown', input.trustVaultPubkey, false, 
      error instanceof Error ? error.message : 'Unknown error');
    
    throw new Error('Failed to destroy encryption key');
  }
}

/**
 * Clean up old destroyed keys
 */
export async function cleanupExpiredKeys(olderThanDays: number = 30): Promise<number> {
  try {
    const expiredKeys = await trustVaultKeyRepository.findExpiredKeys(olderThanDays);
    
    let deletedCount = 0;
    for (const key of expiredKeys) {
      await trustVaultKeyRepository.hardDelete(key.keyId);
      deletedCount++;
      
      // Log each deletion
      
    }

   
    return deletedCount;
  } catch (error) {
    console.error('Key cleanup error:', error);
    throw new Error('Failed to cleanup expired keys');
  }
}

/**
 * Validate trust vault exists on Solana blockchain
 */
export async function validateTrustVaultExists(pubkey: string): Promise<boolean> {
  try {
    // TODO: Implement actual Solana blockchain validation
    // This would involve connecting to Solana and checking if the account exists
    // and is a valid trust vault account
    
    // For now, just validate the pubkey format
    if (!pubkey || pubkey.length < 32) {
      return false;
    }

    // Mock validation - in production, this would be a real blockchain call
    return true;
  } catch (error) {
    console.error('Trust vault validation error:', error);
    return false;
  }
}

/**
 * Get key statistics for monitoring
 */
export async function getKeyStatistics(): Promise<{
  totalKeys: number;
  activeKeys: number;
  pendingKeys: number;
  destroyedKeys: number;
}> {
  try {
    // This would be implemented with proper database queries in production
    // For now, return mock data
    return {
      totalKeys: 0,
      activeKeys: 0,
      pendingKeys: 0,
      destroyedKeys: 0,
    };
  } catch (error) {
    console.error('Error getting key statistics:', error);
    throw new Error('Failed to get key statistics');
  }
}