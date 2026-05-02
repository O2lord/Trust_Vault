'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Connection, PublicKey } from '@solana/web3.js';
import Image from 'next/image';

interface PayoutDetails {
  type: 'bank_transfer' | 'mobile_money' | 'flutterwave_wallet';
  account_number: string;
  bank_code?: string;
  beneficiary_name: string;
  phone_number?: string;
  network?: string;
}

interface Receipt {
  id: string;
  payout_reference: string;
  transaction_signature: string;
  taker_address: string;
  maker_address: string;
  token_amount: string;
  fiat_amount: string;
  currency: string;
  fee_amount: string;
  status: string;
  created_at: string;
  payout_method: string;
  payout_details: PayoutDetails;
  trust_express_address: string;
  mint_address?: string; 
}

interface TokenInfo {
  symbol: string;
  decimals: number;
  logoURI?: string;
  name?: string;
}

export default function ReceiptPage() {
  const params = useParams();
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [tokenLoading, setTokenLoading] = useState(true);

  // Fetch receipt data
  useEffect(() => {
    const fetchReceipt = async () => {
      try {
        const res = await fetch(`/api/receipts/${params.id}`);
        if (res.ok) {
          const data = await res.json();
          setReceipt(data);
        }
      } catch (error) {
        console.error('Error fetching receipt:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchReceipt();
  }, [params.id]);

  // Fetch token information from blockchain
  useEffect(() => {
    const fetchTokenInfo = async () => {
      if (!receipt?.trust_express_address) return;

      try {
        setTokenLoading(true);
        
        // Connect to Solana
        const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';
        const connection = new Connection(rpcUrl, 'confirmed');

        // Fetch the trust_express account to get mint address
        const trustExpressAccount = new PublicKey(receipt.trust_express_address);
        const accountInfo = await connection.getAccountInfo(trustExpressAccount);

        if (!accountInfo) {
          throw new Error('Trust Express account not found');
        }

        // Parse mint address from account data (offset 48 based on your struct)
        const mintAddress = new PublicKey(accountInfo.data.slice(48, 80));
        
        // Fetch mint account to get decimals
        const mintInfo = await connection.getParsedAccountInfo(mintAddress);
        
        if (mintInfo.value && 'parsed' in mintInfo.value.data) {
          const decimals = mintInfo.value.data.parsed.info.decimals;
          
          // Try to fetch token metadata
          let symbol = 'TOKEN';
          let logoURI = undefined;
          let name = undefined;

          try {
            // Attempt to get token metadata (Metaplex standard)
            const metadataPDA = await getMetadataPDA(mintAddress);
            const metadataAccount = await connection.getAccountInfo(metadataPDA);
            
            if (metadataAccount) {
              const metadata = parseMetadata(metadataAccount.data);
              symbol = metadata.symbol || 'TOKEN';
              name = metadata.name;
              
              // Fetch logo from metadata URI if available
              if (metadata.uri) {
                const uriResponse = await fetch(metadata.uri);
                const uriData = await uriResponse.json();
                logoURI = uriData.image;
              }
            }
          } catch (metadataError) {
          }

          setTokenInfo({
            symbol,
            decimals,
            logoURI,
            name
          });
        }
      } catch (error) {
        console.error('Error fetching token info:', error);
        // Fallback to defaults
        setTokenInfo({
          symbol: 'TOKEN',
          decimals: 6,
        });
      } finally {
        setTokenLoading(false);
      }
    };

    fetchTokenInfo();
  }, [receipt]);

  // Helper function to get Metaplex metadata PDA
  const getMetadataPDA = async (mint: PublicKey): Promise<PublicKey> => {
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
  };

  // Simple metadata parser (you might need a more robust one)
  const parseMetadata = (data: Buffer): { name?: string; symbol?: string; uri?: string } => {
    try {
      // This is a simplified parser - you may want to use @metaplex-foundation/mpl-token-metadata
      let offset = 1; // Skip first byte
      
      // Read name
      const nameLength = data.readUInt32LE(offset);
      offset += 4;
      const name = data.slice(offset, offset + nameLength).toString('utf8').replace(/\0/g, '');
      offset += nameLength;
      
      // Read symbol
      const symbolLength = data.readUInt32LE(offset);
      offset += 4;
      const symbol = data.slice(offset, offset + symbolLength).toString('utf8').replace(/\0/g, '');
      offset += symbolLength;
      
      // Read URI
      const uriLength = data.readUInt32LE(offset);
      offset += 4;
      const uri = data.slice(offset, offset + uriLength).toString('utf8').replace(/\0/g, '');
      
      return { name, symbol, uri };
    } catch (error) {
      console.error('Error parsing metadata:', error);
      return {};
    }
  };

  // Calculate displayed fee
  const getDisplayedFee = (): string => {
    if (!receipt || !tokenInfo) return '0';
    
    const rawFee = BigInt(receipt.fee_amount);
    const decimals = tokenInfo.decimals;
    const divisor = BigInt(10 ** decimals);
    
    const wholePart = rawFee / divisor;
    const fractionalPart = rawFee % divisor;
    
    if (fractionalPart === BigInt(0)) {
      return wholePart.toString();
    }
    
    const fractionalStr = fractionalPart.toString().padStart(decimals, '0');
    const trimmedFractional = fractionalStr.replace(/0+$/, '');
    
    return `${wholePart}.${trimmedFractional}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading receipt...</div>
      </div>
    );
  }

  if (!receipt) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Receipt not found</div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl text-black mx-auto p-8 bg-white shadow-lg rounded-lg">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold">Transaction Receipt</h1>
        <p className="text-gray-500">Trust Express</p>
      </div>

      <div className="space-y-4 border-t border-b py-6">
        <div className="flex justify-between">
          <span className="text-gray-600">Receipt ID:</span>
          <span className="font-mono text-sm">{receipt.id}</span>
        </div>
        
        <div className="flex justify-between">
          <span className="text-gray-600">Date:</span>
          <span>{new Date(receipt.created_at).toLocaleString()}</span>
        </div>

        <div className="flex justify-between">
          <span className="text-gray-600">Name:</span>
            {receipt.payout_details.beneficiary_name}
        </div>

        <div className="flex justify-between">
          <span className="text-gray-600">Acct No:</span>
            {receipt.payout_details.account_number}
        </div>

        <div className="flex justify-between">
          <span className="text-gray-600">Status:</span>
          <span
            className="px-2 py-1 rounded text-xs font-bold uppercase"
            style={{
              background: receipt.status === 'success' || receipt.status === 'completed'
                ? 'rgba(10,123,107,0.12)'
                : 'rgba(232,72,10,0.12)',
              color: receipt.status === 'success' || receipt.status === 'completed'
                ? '#0A7B6B'
                : '#E8480A',
            }}
          >
            {receipt.status.toUpperCase()}
          </span>
        </div>

        <div className="flex justify-between">
          <span className="text-gray-600">Amount:</span>
          <span className="text-xl font-bold">
            {receipt.fiat_amount} {receipt.currency}
          </span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-gray-600">Fee:</span>
          <div className="flex items-center gap-2">
            {tokenLoading ? (
              <span className="text-sm text-gray-400">Loading...</span>
            ) : (
              <>
                {tokenInfo?.logoURI && (
                  <Image 
                    src={tokenInfo.logoURI} 
                    alt={tokenInfo.symbol}
                    className="w-5 h-5 rounded-full"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                )}
                <span className="font-semibold">
                  {getDisplayedFee()} {tokenInfo?.symbol || 'TOKEN'}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex justify-between">
          <span className="text-gray-600">Transaction:</span>
          <a 
            href={`https://explorer.solana.com/tx/${receipt.transaction_signature}?cluster=devnet`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline text-sm"
          >
            View on Explorer
          </a>
        </div>

        <div className="flex justify-between">
          <span className="text-gray-600">Reference:</span>
          <span className="font-mono text-sm">{receipt.payout_reference}</span>
        </div>
      </div>

      <div className="mt-8">
        <button 
          onClick={() => window.print()}
          className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition-colors"
        >
          Print Receipt
        </button>
      </div>
    </div>
  );
}