// lib/solana-auth.ts
import { PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

/**
 * Verifies a Solana wallet signature
 * @param walletAddress - The public key of the wallet (base58 string)
 * @param signature - The base58 encoded signature
 * @param message - The original message that was signed
 * @returns boolean indicating if signature is valid
 */
export async function verifySignature(
  walletAddress: string,
  signature: string,
  message: string
): Promise<boolean> {
  try {
    // Validate inputs
    if (!walletAddress || !signature || !message) {
      console.error('Missing required parameters for signature verification');
      return false;
    }

    // Convert wallet address to PublicKey
    let publicKey: PublicKey;
    try {
      publicKey = new PublicKey(walletAddress);
    } catch (error) {
      console.error('Invalid wallet address format:', error);
      return false;
    }

    // Decode the signature from base58
    let signatureUint8: Uint8Array;
    try {
      signatureUint8 = bs58.decode(signature);
    } catch (error) {
      console.error('Invalid signature format:', error);
      return false;
    }

    // Convert message to Uint8Array
    const messageUint8 = new TextEncoder().encode(message);

    // Verify the signature using nacl
    const isValid = nacl.sign.detached.verify(
      messageUint8,
      signatureUint8,
      publicKey.toBytes()
    );

    return isValid;
  } catch (error) {
    console.error('Error verifying signature:', error);
    return false;
  }
}

/**
 * Generates a message for the user to sign
 * This should be used on the frontend before sending to the API
 * @param action - The action being performed (e.g., 'store_credentials', 'delete_credential')
 * @param additionalData - Optional additional data to include in the message
 */
export function generateAuthMessage(
  action: string,
  additionalData?: Record<string, string | number | boolean>
): string {
  const timestamp = Date.now();
  const nonce = Math.random().toString(36).substring(2, 15);
  
  let message = `Sign this message to authenticate with TrustExpress.\n\n`;
  message += `Action: ${action}\n`;
  message += `Timestamp: ${timestamp}\n`;
  message += `Nonce: ${nonce}\n`;
  
  if (additionalData) {
    message += `\nAdditional Data:\n`;
    for (const [key, value] of Object.entries(additionalData)) {
      message += `${key}: ${value}\n`;
    }
  }
  
  message += `\nThis signature will not cost any gas fees.`;
  
  return message;
}

/**
 * Validates that a signed message is recent (within 5 minutes)
 * Prevents replay attacks
 * @param message - The message to validate
 * @param maxAgeMinutes - Maximum age of the message in minutes (default: 5)
 */
export function validateMessageTimestamp(
  message: string,
  maxAgeMinutes: number = 5
): boolean {
  try {
    // Extract timestamp from message
    const timestampMatch = message.match(/Timestamp:\s*(\d+)/);
    
    if (!timestampMatch) {
      console.error('No timestamp found in message');
      return false;
    }

    const timestamp = parseInt(timestampMatch[1]);
    
    // Validate timestamp is a valid number
    if (isNaN(timestamp)) {
      console.error('Invalid timestamp format');
      return false;
    }

    const now = Date.now();
    const maxAge = maxAgeMinutes * 60 * 1000; // Convert to milliseconds

    // Check if message is too old
    if (now - timestamp > maxAge) {
      console.error('Message timestamp is too old');
      return false;
    }

    // Check if timestamp is in the future (clock skew protection)
    if (timestamp > now + 60000) { // Allow 1 minute of clock skew
      console.error('Message timestamp is in the future');
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error validating message timestamp:', error);
    return false;
  }
}

/**
 * Extracts action from a signed message
 * @param message - The message to parse
 */
export function extractActionFromMessage(message: string): string | null {
  try {
    const actionMatch = message.match(/Action:\s*(.+)/);
    return actionMatch ? actionMatch[1].trim() : null;
  } catch (error) {
    console.error('Error extracting action from message:', error);
    return null;
  }
}

/**
 * Validates that the message action matches the expected action
 * @param message - The message to validate
 * @param expectedAction - The expected action
 */
export function validateMessageAction(
  message: string,
  expectedAction: string
): boolean {
  const action = extractActionFromMessage(message);
  return action === expectedAction;
}

/**
 * Complete message validation (timestamp + action)
 * @param message - The message to validate
 * @param expectedAction - The expected action
 * @param maxAgeMinutes - Maximum age in minutes
 */
export function validateMessage(
  message: string,
  expectedAction: string,
  maxAgeMinutes: number = 5
): { valid: boolean; error?: string } {
  // Check timestamp
  if (!validateMessageTimestamp(message, maxAgeMinutes)) {
    return { valid: false, error: 'Message timestamp is invalid or too old' };
  }

  // Check action
  if (!validateMessageAction(message, expectedAction)) {
    return { valid: false, error: 'Message action does not match expected action' };
  }

  return { valid: true };
}