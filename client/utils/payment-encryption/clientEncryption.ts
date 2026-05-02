/**
 * Client-side encryption utilities for browser environment
 */

export interface ClientDecryptionInput {
  encryptedData: string;
  key: string;
  iv: string;
  tag: string;
}

/**
 * Decrypt payment instructions on the client side using Web Crypto API
 */
export async function decryptPaymentInstructionsClient(
  input: ClientDecryptionInput
): Promise<Record<string, unknown>> {
  try {
    // Convert base64 strings to ArrayBuffers
    const keyBuffer = Uint8Array.from(atob(input.key), c => c.charCodeAt(0));
    const ivBuffer = Uint8Array.from(atob(input.iv), c => c.charCodeAt(0));
    const tagBuffer = Uint8Array.from(atob(input.tag), c => c.charCodeAt(0));
    const encryptedBuffer = Uint8Array.from(atob(input.encryptedData), c => c.charCodeAt(0));
    
    // Validate key length (must be 16, 24, or 32 bytes for AES)
    if (keyBuffer.length !== 16 && keyBuffer.length !== 24 && keyBuffer.length !== 32) {
      console.error("❌ Invalid key length:", keyBuffer.length, "bytes. Must be 16, 24, or 32 bytes for AES.");
      throw new Error(`Invalid key length: ${keyBuffer.length} bytes. Must be 16, 24, or 32 bytes for AES.`);
    }

    // Validate IV length (must be 12 bytes for AES-GCM)
    if (ivBuffer.length !== 12) {
      console.error("❌ Invalid IV length:", ivBuffer.length, "bytes. Must be 12 bytes for AES-GCM.");
      throw new Error(`Invalid IV length: ${ivBuffer.length} bytes. Must be 12 bytes for AES-GCM.`);
    }

    // Validate tag length (must be 16 bytes for AES-GCM)
    if (tagBuffer.length !== 16) {
      console.error("❌ Invalid tag length:", tagBuffer.length, "bytes. Must be 16 bytes for AES-GCM.");
      throw new Error(`Invalid tag length: ${tagBuffer.length} bytes. Must be 16 bytes for AES-GCM.`);
    }

    // Combine encrypted data and tag for AES-GCM
    const combinedBuffer = new Uint8Array(encryptedBuffer.length + tagBuffer.length);
    combinedBuffer.set(encryptedBuffer);
    combinedBuffer.set(tagBuffer, encryptedBuffer.length);
    
    // Import the key
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyBuffer,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );
    
    // Decrypt the data
    const decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: ivBuffer,
        additionalData: new TextEncoder().encode('trust-vault-payment-instructions')
      } as AesGcmParams,
      cryptoKey,
      combinedBuffer
    );
    
    // Convert to string and parse JSON
    const decryptedText = new TextDecoder().decode(decryptedBuffer);
    
    const parsedData: unknown = JSON.parse(decryptedText);
    
    // Type guard to ensure we return the expected object type
    if (typeof parsedData === 'object' && parsedData !== null) {
      return parsedData as Record<string, unknown>;
    }
    
    throw new Error('Decrypted data is not a valid object');
  } catch (error) {
    console.error('❌ Client-side decryption error:', error);
    throw new Error('Failed to decrypt payment instructions');
  }
}

/**
 * Securely clear sensitive data from memory
 */
export function secureWipeClient(data: string | Uint8Array | ArrayBuffer): void {
  if (typeof data === 'string') {
    // Note: In JavaScript, strings are immutable, so we can only clear the reference
    // The actual string data may persist in memory until garbage collection
    data = '';
  } else if (data instanceof Uint8Array) {
    // Overwrite Uint8Array with random data
    const randomData = crypto.getRandomValues(new Uint8Array(data.length));
    data.set(randomData);
  } else if (data instanceof ArrayBuffer) {
    // Convert ArrayBuffer to Uint8Array and overwrite
    const uint8View = new Uint8Array(data);
    const randomData = crypto.getRandomValues(new Uint8Array(uint8View.length));
    uint8View.set(randomData);
  }
}

/**
 * Generate a secure random string for client-side use
 */
export function generateSecureRandom(length: number = 32): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}