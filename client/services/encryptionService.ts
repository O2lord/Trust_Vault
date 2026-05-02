import { 
  encryptPaymentInstructions, 
  EncryptionResult 
} from '../utils/payment-encryption/encryption';
import { trustVaultKeyRepository } from '../lib/supabase/database';

export interface EncryptInstructionsInput {
  paymentInstructions: object;
}

export interface EncryptInstructionsResult {
  encryptedData: string;
  keyId: string;
}

/**
 * Encrypt payment instructions and store the key in Supabase
 */
export async function encryptInstructions(
  input: EncryptInstructionsInput
): Promise<EncryptInstructionsResult> {
  try {
    // Validate input
    if (!input.paymentInstructions || typeof input.paymentInstructions !== 'object') {
      throw new Error('Invalid payment instructions provided');
    }

    

    // Encrypt the payment instructions
    const encryptionResult: EncryptionResult = encryptPaymentInstructions(
      input.paymentInstructions
    );

    // CRITICAL FIX: Store the AES key, not the encrypted data
    // The encryptionResult should contain the raw AES key
    if (!encryptionResult.key) {
      throw new Error('Encryption result missing AES key');
    }

    // Store the key in Supabase with 'pending' status
    await trustVaultKeyRepository.create({
      keyId: encryptionResult.keyId,
      encryptionKey: encryptionResult.key, // Store the AES key, not encrypted data
      iv: encryptionResult.iv,
      tag: encryptionResult.tag,
    });

    

    return {
      encryptedData: encryptionResult.encryptedData, // Return encrypted payment instructions
      keyId: encryptionResult.keyId,
    };
  } catch (error) {
    console.error('❌ Service: Encryption service error:', error);
    throw new Error('Failed to encrypt payment instructions');
  }
}

/**
 * Validate payment instructions format
 */
export function validatePaymentInstructions(instructions: unknown): boolean {
  if (!instructions || typeof instructions !== 'object') {
    return false;
  }

  // Check for MakeNewTrustVaultDialog format
  if ('bankName' in instructions && 'accountNumber' in instructions && 'accountName' in instructions) {
    return !!(instructions.bankName && instructions.accountNumber && instructions.accountName);
  }

  // Check for CreateBuyDialog format
  if ('paymentType' in instructions) {
    return !!instructions.paymentType;
  }

  return false;
}

/**
 * Sanitize payment instructions to remove potentially harmful content
 */
export function sanitizePaymentInstructions(instructions: object): unknown {
  const sanitized = JSON.parse(JSON.stringify(instructions));
  
  // Remove any potential script tags or harmful content
  const sanitizeString = (str: string): string => {
    if (typeof str !== 'string') return str;
    return str
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '')
      .trim();
  };

  // Recursively sanitize all string values
  const sanitizeObject = (obj: unknown): unknown => {
    if (typeof obj === 'string') {
      return sanitizeString(obj);
    } else if (Array.isArray(obj)) {
      return obj.map(sanitizeObject);
    } else if (obj && typeof obj === 'object') {
      const sanitizedObj: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        sanitizedObj[key] = sanitizeObject(value);
      }
      return sanitizedObj;
    }
    return obj;
  };

  return sanitizeObject(sanitized);
}

/**
 * Generate audit log entry for encryption operations
 */
export function logEncryptionOperation(
  operation: 'encrypt' | 'decrypt' | 'associate' | 'destroy',
  keyId: string,
  trustVaultPubkey?: string,
  success: boolean = true,
  error?: string
): void {
  const logEntry = {
    timestamp: new Date().toISOString(),
    operation,
    keyId,
    trustVaultPubkey,
    success,
    error,
    userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : 'server',
  };

}