// lib/tokenUtils.ts
// Utility functions for working with Solana tokens

import { Connection, PublicKey } from '@solana/web3.js';

export interface TokenInfo {
  symbol: string;
  decimals: number;
  logoURI?: string;
  name?: string;
  mintAddress: string;
}

/**
 * Fetch token information from a mint address
 */
export async function fetchTokenInfo(
  connection: Connection,
  mintAddress: PublicKey
): Promise<TokenInfo> {
  try {
    // Fetch mint account to get decimals
    const mintInfo = await connection.getParsedAccountInfo(mintAddress);
    
    if (!mintInfo.value || !('parsed' in mintInfo.value.data)) {
      throw new Error('Invalid mint account');
    }

    const decimals = mintInfo.value.data.parsed.info.decimals;
    
    // Default token info
    const tokenInfo: TokenInfo = {
      symbol: 'TOKEN',
      decimals,
      mintAddress: mintAddress.toString(),
    };

    // Try to fetch Metaplex metadata
    try {
      const metadataPDA = await getMetadataPDA(mintAddress);
      const metadataAccount = await connection.getAccountInfo(metadataPDA);
      
      if (metadataAccount) {
        const metadata = parseMetadata(metadataAccount.data);
        
        if (metadata.symbol) tokenInfo.symbol = metadata.symbol;
        if (metadata.name) tokenInfo.name = metadata.name;
        
        // Fetch logo from metadata URI
        if (metadata.uri) {
          try {
            const uriResponse = await fetch(metadata.uri);
            const uriData = await uriResponse.json();
            if (uriData.image) tokenInfo.logoURI = uriData.image;
          } catch (uriError) {
          }
        }
      }
    } catch (metadataError) {
    }

    return tokenInfo;
  } catch (error) {
    console.error('Error fetching token info:', error);
    throw error;
  }
}

/**
 * Get Metaplex metadata PDA for a mint
 */
async function getMetadataPDA(mint: PublicKey): Promise<PublicKey> {
  const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
  const [publicKey] = await PublicKey.findProgramAddress(
    [
      Buffer.from('metadata'),
      METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
    ],
    METADATA_PROGRAM_ID
  );
  return publicKey;
}

/**
 * Parse Metaplex metadata from account data
 */
function parseMetadata(data: Buffer): {
  name?: string;
  symbol?: string;
  uri?: string;
} {
  try {
    let offset = 1; // Skip first byte (key)
    
    // Skip update authority (32 bytes)
    offset += 32;
    
    // Skip mint (32 bytes)
    offset += 32;
    
    // Read name
    const nameLength = data.readUInt32LE(offset);
    offset += 4;
    const name = data.slice(offset, offset + nameLength).toString('utf8').replace(/\0/g, '').trim();
    offset += nameLength;
    
    // Read symbol
    const symbolLength = data.readUInt32LE(offset);
    offset += 4;
    const symbol = data.slice(offset, offset + symbolLength).toString('utf8').replace(/\0/g, '').trim();
    offset += symbolLength;
    
    // Read URI
    const uriLength = data.readUInt32LE(offset);
    offset += 4;
    const uri = data.slice(offset, offset + uriLength).toString('utf8').replace(/\0/g, '').trim();
    
    return { name, symbol, uri };
  } catch (error) {
    console.error('Error parsing metadata:', error);
    return {};
  }
}

/**
 * Format token amount from raw value to display value
 */
export function formatTokenAmount(
  rawAmount: string | bigint,
  decimals: number,
  maxDecimals: number = 6
): string {
  const amount = typeof rawAmount === 'string' ? BigInt(rawAmount) : rawAmount;
  const divisor = BigInt(10 ** decimals);
  
  const wholePart = amount / divisor;
  const fractionalPart = amount % divisor;
  
  if (fractionalPart === BigInt(0)) {
    return wholePart.toString();
  }
  
  const fractionalStr = fractionalPart.toString().padStart(decimals, '0');
  
  // Trim trailing zeros but keep up to maxDecimals
  let trimmedFractional = fractionalStr.replace(/0+$/, '');
  if (trimmedFractional.length > maxDecimals) {
    trimmedFractional = trimmedFractional.substring(0, maxDecimals);
  }
  
  return trimmedFractional ? `${wholePart}.${trimmedFractional}` : wholePart.toString();
}

/**
 * Get token info from trust_express account
 */
export async function getTokenInfoFromTrustExpress(
  connection: Connection,
  trustExpressAddress: string
): Promise<TokenInfo> {
  const trustExpressAccount = new PublicKey(trustExpressAddress);
  const accountInfo = await connection.getAccountInfo(trustExpressAccount);

  if (!accountInfo) {
    throw new Error('Trust Express account not found');
  }

  // Parse mint address from account data (offset 48 based on struct)
  const mintAddress = new PublicKey(accountInfo.data.slice(48, 80));
  
  return fetchTokenInfo(connection, mintAddress);
}

/**
 * Cache for token info to reduce RPC calls
 */
const tokenInfoCache = new Map<string, { info: TokenInfo; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function getCachedTokenInfo(
  connection: Connection,
  mintAddress: string
): Promise<TokenInfo> {
  const cached = tokenInfoCache.get(mintAddress);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.info;
  }
  
  const info = await fetchTokenInfo(connection, new PublicKey(mintAddress));
  tokenInfoCache.set(mintAddress, { info, timestamp: Date.now() });
  
  // Clean old cache entries
  for (const [key, value] of tokenInfoCache.entries()) {
    if (Date.now() - value.timestamp > CACHE_TTL) {
      tokenInfoCache.delete(key);
    }
  }
  
  return info;
}