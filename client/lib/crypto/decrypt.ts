// client/lib/crypto/decrypt.ts
//
// Extracted from discord-bot/lib/flutterwave-credentials-bot.ts
// so API routes don't need to cross workspace boundaries.
//
// All 5 affected routes should update their import to:
//   import { decrypt } from "@/lib/crypto/decrypt";
//
// After doing that, you can remove the cross-workspace dependency entirely.

import { createDecipheriv } from "crypto";

const ENCRYPTION_KEY = process.env.CREDENTIAL_ENCRYPTION_KEY!;

/**
 * Decrypts an AES-256-GCM encrypted value.
 * @param encryptedData - hex-encoded ciphertext
 * @param iv            - hex-encoded initialization vector
 * @param authTag       - hex-encoded GCM auth tag
 * @returns decrypted plaintext string, or null on failure
 */
export function decrypt(
  encryptedData: string,
  iv: string,
  authTag: string
): string | null {
  try {
    if (!ENCRYPTION_KEY) {
      console.error("❌ CREDENTIAL_ENCRYPTION_KEY is not set");
      return null;
    }

    const keyBuffer = Buffer.from(ENCRYPTION_KEY, "hex");
    const ivBuffer = Buffer.from(iv, "hex");
    const authTagBuffer = Buffer.from(authTag, "hex");
    const encryptedBuffer = Buffer.from(encryptedData, "hex");

    const decipher = createDecipheriv("aes-256-gcm", keyBuffer, ivBuffer);
    decipher.setAuthTag(authTagBuffer);

    const decrypted = Buffer.concat([
      decipher.update(encryptedBuffer),
      decipher.final(),
    ]);

    return decrypted.toString("utf8");
  } catch (error) {
    console.error(
      "❌ Decryption failed:",
      error instanceof Error ? error.message : error
    );
    return null;
  }
}