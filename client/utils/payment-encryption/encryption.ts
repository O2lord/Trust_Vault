import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 12; // 96 bits for GCM (not 16!)
const TAG_LENGTH = 16; // 128 bits

export interface EncryptionResult {
  encryptedData: string;
  keyId: string;
  key: string; // Add the AES key to the result
  iv: string;
  tag: string;
}

export interface DecryptionInput {
  encryptedData: string;
  key: string;
  iv: string;
  tag: string;
}

/**
 * Generate a cryptographically secure random key
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(KEY_LENGTH).toString('base64');
}

/**
 * Generate a unique key ID
 */
export function generateKeyId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = crypto.randomBytes(8).toString('hex');
  return `key_${timestamp}_${randomPart}`;
}

/**
 * Encrypt payment instructions using AES-256-GCM
 */
export function encryptPaymentInstructions(
  paymentInstructions: object,
  encryptionKey?: string
): EncryptionResult {
  try {
    

    // Generate key if not provided
    const key = encryptionKey || generateEncryptionKey();
    const keyBuffer = Buffer.from(key, 'base64');
    
   

    // Validate key length
    if (keyBuffer.length !== KEY_LENGTH) {
      throw new Error(`Invalid key length: ${keyBuffer.length} bytes, expected ${KEY_LENGTH} bytes`);
    }
    
    // Generate random IV (12 bytes for GCM)
    const iv = crypto.randomBytes(IV_LENGTH);
    
   
    
    // Convert payment instructions to JSON string
    const plaintext = JSON.stringify(paymentInstructions);
   
    
    // Create cipher using the modern Node.js API
    const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);
    
    // Set additional authenticated data (AAD)
    cipher.setAAD(Buffer.from('trust-vault-payment-instructions'));
    
    // Encrypt the data
    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    // Get the authentication tag
    const tag = cipher.getAuthTag();
    
   
    
    // Generate key ID
    const keyId = generateKeyId();
    
    return {
      encryptedData: encrypted,
      keyId,
      key, // Return the AES key for storage
      iv: iv.toString('base64'),
      tag: tag.toString('base64')
    };
  } catch (error) {
    console.error('❌ Crypto: Encryption error:', error);
    throw new Error('Failed to encrypt payment instructions');
  }
}

/**
 * Decrypt payment instructions using AES-256-GCM
 */
export function decryptPaymentInstructions(input: DecryptionInput): object {
  try {
    

    const keyBuffer = Buffer.from(input.key, 'base64');
    const ivBuffer = Buffer.from(input.iv, 'base64');
    const tagBuffer = Buffer.from(input.tag, 'base64');
    
   

    // Validate buffer lengths
    if (keyBuffer.length !== KEY_LENGTH) {
      throw new Error(`Invalid key length: ${keyBuffer.length} bytes, expected ${KEY_LENGTH} bytes`);
    }
    if (ivBuffer.length !== IV_LENGTH) {
      throw new Error(`Invalid IV length: ${ivBuffer.length} bytes, expected ${IV_LENGTH} bytes`);
    }
    if (tagBuffer.length !== TAG_LENGTH) {
      throw new Error(`Invalid tag length: ${tagBuffer.length} bytes, expected ${TAG_LENGTH} bytes`);
    }
    
    // Create decipher using the modern Node.js API
    const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, ivBuffer);
    
    // Set additional authenticated data (AAD)
    decipher.setAAD(Buffer.from('trust-vault-payment-instructions'));
    
    // Set the authentication tag
    decipher.setAuthTag(tagBuffer);
    
    // Decrypt the data
    let decrypted = decipher.update(input.encryptedData, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    
    
    // Parse JSON
    return JSON.parse(decrypted);
  } catch (error) {
    console.error('❌ Crypto: Decryption error:', error);
    throw new Error('Failed to decrypt payment instructions');
  }
}

/**
 * Securely overwrite sensitive data in memory
 */
export function secureWipe(data: string): void {
  if (typeof data === 'string') {
    // In Node.js, we can't directly overwrite string memory
    // but we can at least clear the reference
    data = '';
  }
}

/**
 * Validate encryption key format
 */
export function validateEncryptionKey(key: string): boolean {
  try {
    const keyBuffer = Buffer.from(key, 'base64');
    return keyBuffer.length === KEY_LENGTH;
  } catch {
    return false;
  }
}