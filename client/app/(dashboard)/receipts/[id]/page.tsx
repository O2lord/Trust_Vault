'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Connection, PublicKey } from '@solana/web3.js';
import Image from 'next/image';
import { CheckCircle, AlertCircle, ExternalLink, Printer, ArrowLeft } from 'lucide-react';
import Link from 'next/link';


interface PayoutDetails {
  type: 'bank_transfer' | 'mobile_money' | 'flutterwave_wallet';
  account_number?: string;
  bank_code?: string;
  bank_name?: string;
  beneficiary_name?: string;
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
  // flat columns that may also exist
  beneficiary_name?: string;
  account_number?: string;
  bank_name?: string;
}

interface TokenInfo {
  symbol: string;
  decimals: number;
  logoURI?: string;
  name?: string;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  NGN: '₦',
  KES: 'KSh',
  GHS: '₵',
  ZAR: 'R',
  USD: '$',
};

const CURRENCY_FLAGS: Record<string, string> = {
  NGN: '🇳🇬',
  KES: '🇰🇪',
  GHS: '🇬🇭',
  ZAR: '🇿🇦',
  USD: '🇺🇸',
};

export default function ReceiptPage() {
  const params = useParams();
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [tokenLoading, setTokenLoading] = useState(true);

  // Fetch receipt
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

  // Fetch token info
  useEffect(() => {
    const fetchTokenInfo = async () => {
      if (!receipt?.trust_express_address) return;
      try {
        setTokenLoading(true);
        const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';
        const connection = new Connection(rpcUrl, 'confirmed');
        const trustExpressAccount = new PublicKey(receipt.trust_express_address);
        const accountInfo = await connection.getAccountInfo(trustExpressAccount);
        if (!accountInfo) throw new Error('Account not found');

        const mintAddress = new PublicKey(accountInfo.data.slice(48, 80));
        const mintInfo = await connection.getParsedAccountInfo(mintAddress);

        if (mintInfo.value && 'parsed' in mintInfo.value.data) {
          const decimals = mintInfo.value.data.parsed.info.decimals;
          let symbol = 'TOKEN';
          let logoURI: string | undefined;
          let name: string | undefined;

          try {
            const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
            const [metadataPDA] = PublicKey.findProgramAddressSync(
              [Buffer.from('metadata'), METADATA_PROGRAM_ID.toBuffer(), mintAddress.toBuffer()],
              METADATA_PROGRAM_ID
            );
            const metadataAccount = await connection.getAccountInfo(metadataPDA);
            if (metadataAccount) {
              const data = metadataAccount.data;
              let offset = 1;
              const nameLen = data.readUInt32LE(offset); offset += 4;
              name = data.slice(offset, offset + nameLen).toString('utf8').replace(/\0/g, ''); offset += nameLen;
              const symbolLen = data.readUInt32LE(offset); offset += 4;
              symbol = data.slice(offset, offset + symbolLen).toString('utf8').replace(/\0/g, '').trim() || 'TOKEN'; offset += symbolLen;
              const uriLen = data.readUInt32LE(offset); offset += 4;
              const uri = data.slice(offset, offset + uriLen).toString('utf8').replace(/\0/g, '');
              if (uri) {
                try {
                  const uriRes = await fetch(uri);
                  const uriData = await uriRes.json();
                  logoURI = uriData.image;
                } catch { /* non-fatal */ }
              }
            }
          } catch { /* non-fatal */ }

          setTokenInfo({ symbol, decimals, logoURI, name });
        }
      } catch (error) {
        console.error('Error fetching token info:', error);
        setTokenInfo({ symbol: 'TOKEN', decimals: 6 });
      } finally {
        setTokenLoading(false);
      }
    };
    fetchTokenInfo();
  }, [receipt]);

  const formatAmount = (raw: string, decimals: number) => {
    const n = Number(raw) / Math.pow(10, decimals);
    return n.toLocaleString(undefined, { maximumFractionDigits: decimals });
  };

  const formatFiat = (raw: string) => {
  const n = Number(raw);
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
};

 const formatFee = (raw: string, decimals: number) => {
  const n = BigInt(raw);
  const d = BigInt(10 ** decimals);
  const whole = n / d;
  const frac = n % d;
  if (frac === BigInt(0)) return whole.toString();
  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${whole}.${fracStr}`;
};

  // Determine receipt type
  const isSellOrder = (r: Receipt): boolean => {
    const acct = r.account_number ?? r.payout_details?.account_number;
    return !!acct;
  };

  const isSuccess = (status: string) =>
    status === 'success' || status === 'completed';

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#F5F0E8' }}>
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#E8480A] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-[#6B6558]">Loading receipt…</p>
        </div>
      </div>
    );
  }

  if (!receipt) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#F5F0E8' }}>
        <div className="text-center">
          <AlertCircle className="w-10 h-10 text-[#E8480A] mx-auto mb-3" />
          <p className="text-sm font-bold text-[#0F0D0A]">Receipt not found</p>
          <Link href="/express" className="text-xs text-[#6B6558] underline mt-2 block">
            Back to Express
          </Link>
        </div>
      </div>
    );
  }

  const decimals = tokenInfo?.decimals ?? 6;
  const sym = CURRENCY_SYMBOLS[receipt.currency] ?? receipt.currency;
  const flag = CURRENCY_FLAGS[receipt.currency] ?? '';
  const sellOrder = isSellOrder(receipt);
  const success = isSuccess(receipt.status);

  // Resolve bank details from either flat columns or nested payout_details
  const beneficiaryName = receipt.beneficiary_name ?? receipt.payout_details?.beneficiary_name;
  const accountNumber = receipt.account_number ?? receipt.payout_details?.account_number;
  const bankName = receipt.bank_name ?? receipt.payout_details?.bank_name;

  return (
    <div className="min-h-screen py-12 px-4" style={{ background: '#F5F0E8' }}>
      {/* Top accent stripe */}
      <div
        className="fixed top-0 left-0 right-0 h-0.5 z-10"
        style={{ background: 'linear-gradient(90deg,#E8480A,#FF8C5A 50%,#E8480A)' }}
      />

      <div className="max-w-md mx-auto">

        {/* Back link */}
        <Link
          href="/express"
          className="inline-flex items-center gap-1.5 text-xs text-[#6B6558] hover:text-[#0F0D0A] mb-6 no-underline transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Express
        </Link>

        {/* Card */}
        <div
          className="bg-white rounded-2xl overflow-hidden"
          style={{ border: '1.5px solid #E8E2D8' }}
        >
          {/* Header */}
          <div
            className="px-6 py-5 text-center"
            style={{ borderBottom: '1.5px solid #E8E2D8', background: '#FDFCFA' }}
          >
            <p className="text-lg font-bold text-[#0F0D0A]">Transaction Receipt</p>
            <div className="flex items-center justify-center gap-1.5 mt-0.5">
              {!tokenLoading && tokenInfo?.logoURI && (
                <Image
                  src={tokenInfo.logoURI}
                  alt={tokenInfo.symbol}
                  width={14}
                  height={14}
                  className="rounded-full"
                />
              )}
              <p className="text-xs text-[#6B6558]">
                {sellOrder ? 'Sell Order · Token → Fiat' : 'Buy Order · Fiat → Token'}
              </p>
            </div>
          </div>

          {/* Status badge */}
          <div className="px-6 pt-5 flex justify-between items-center">
            <span className="text-xs text-[#6B6558]">Status</span>
            <span
              className="text-xs font-black px-3 py-1 rounded-full uppercase tracking-wider"
              style={{
                background: success ? 'rgba(10,123,107,0.12)' : 'rgba(232,72,10,0.12)',
                color: success ? '#0A7B6B' : '#E8480A',
              }}
            >
              {receipt.status.toUpperCase()}
            </span>
          </div>

          {/* Key amounts */}
          <div className="px-6 py-4 flex items-center gap-2">

            {/* Left box */}
            <div className="flex-1 rounded-xl px-4 py-3" style={{ background: '#F5F0E8' }}>
              <p className="text-xs text-[#6B6558] mb-0.5">
                {sellOrder ? 'Tokens Sold' : 'Amount Sent'}
              </p>
              {sellOrder ? (
                <div className="flex items-center gap-1.5">
                  {!tokenLoading && tokenInfo?.logoURI && (
                    <Image src={tokenInfo.logoURI} alt={tokenInfo.symbol} width={16} height={16} className="rounded-full flex-shrink-0" />
                  )}
                  <p className="text-base font-black text-[#0F0D0A]">
                    {formatAmount(receipt.token_amount, decimals)}
                  </p>
                  <p className="text-xs font-bold text-[#6B6558]">
                    {tokenLoading ? '…' : tokenInfo?.symbol ?? 'TOKEN'}
                  </p>
                </div>
              ) : (
                <p className="text-base font-black text-[#0F0D0A]">
                  {sym}{formatFiat(receipt.fiat_amount)}
                </p>
              )}
            </div>

            {/* Arrow — always → */}
            <div className="flex-shrink-0 text-[#E8480A] font-black text-sm">→</div>

            {/* Right box */}
            <div className="flex-1 rounded-xl px-4 py-3" style={{ background: '#F5F0E8' }}>
              <p className="text-xs text-[#6B6558] mb-0.5">
                {sellOrder ? 'Fiat Sent' : 'Tokens Received'}
              </p>
              {sellOrder ? (
                <p className="text-base font-black text-[#0F0D0A]">
                  {sym}{formatFiat(receipt.fiat_amount)}
                </p>
              ) : (
                <div className="flex items-center gap-1.5">
                  {!tokenLoading && tokenInfo?.logoURI && (
                    <Image src={tokenInfo.logoURI} alt={tokenInfo.symbol} width={16} height={16} className="rounded-full flex-shrink-0" />
                  )}
                  <p className="text-base font-black text-[#0F0D0A]">
                    {formatAmount(receipt.token_amount, decimals)}
                  </p>
                  <p className="text-xs font-bold text-[#6B6558]">
                    {tokenLoading ? '…' : tokenInfo?.symbol ?? 'TOKEN'}
                  </p>
                </div>
              )}
            </div>

          </div>

          {/* Detail rows */}
          <div className="px-6 pb-5 space-y-0" style={{ borderTop: '1px solid #F0EDE7' }}>

            <Row label="Receipt ID" value={receipt.id} mono truncate />
            <Row label="Date" value={new Date(receipt.created_at).toLocaleString()} />
            {/* Sell order — bank details */}
            {sellOrder && (
              <>
                {beneficiaryName && <Row label="Recipient" value={beneficiaryName} />}
                {accountNumber && <Row label="Account No" value={accountNumber} mono />}
                {bankName && <Row label="Bank" value={bankName} />}
              </>
            )}

            {/* Fee */}
            <div
              className="flex items-start justify-between gap-4 py-2.5"
              style={{ borderBottom: '1px solid #F0EDE7' }}
            >
              <span className="text-xs text-[#6B6558] flex-shrink-0">Fee:</span>
              <span className="text-xs text-[#0F0D0A] flex items-center gap-1">
                {tokenLoading ? (
                  <span className="text-[#C8C2B4]">…</span>
                ) : (
                  <>
                    {tokenInfo?.logoURI && (
                      <Image
                        src={tokenInfo.logoURI}
                        alt={tokenInfo.symbol ?? ''}
                        width={12}
                        height={12}
                        className="rounded-full"
                      />
                    )}
                    {formatFee(receipt.fee_amount, decimals)} {tokenInfo?.symbol ?? 'TOKEN'}
                  </>
                )}
              </span>
            </div>
            <Row
              label="Reference"
              value={receipt.payout_reference}
              mono
            />

            {/* Transaction link */}
            <div
              className="flex items-start justify-between gap-4 py-2.5"
              style={{ borderBottom: '1px solid #F0EDE7' }}
            >
              <span className="text-xs text-[#6B6558] flex-shrink-0">Transaction:</span>
              <a
                href={`https://explorer.solana.com/tx/${receipt.transaction_signature}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[#E8480A] flex items-center gap-1 hover:underline"
              >
                View on Explorer <ExternalLink className="w-3 h-3" />
              </a>
            </div>

          </div>

          {/* Footer actions */}
          <div
            className="flex gap-3 px-6 py-4"
            style={{ borderTop: '1.5px solid #E8E2D8', background: '#FDFCFA' }}
          >
            <button
              onClick={() => window.print()}
              className="flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest border cursor-pointer hover:opacity-80 transition-opacity bg-transparent flex items-center justify-center gap-2"
              style={{ borderColor: '#C8C2B4', color: '#6B6558' }}
            >
              <Printer className="w-3.5 h-3.5" /> Print
            </button>
            <Link
              href="/express"
              className="flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-white text-center no-underline flex items-center justify-center cursor-pointer hover:opacity-90 transition-opacity"
              style={{ background: '#0F0D0A' }}
            >
              Done
            </Link>
          </div>
        </div>

        {/* Receipt type label 
        <p className="text-center text-xs text-[#C8C2B4] mt-4">
          {sellOrder ? 'Sell Order · Token → Fiat' : 'Buy Order · Fiat → Token'}
        </p>
        */}
      </div>
    </div>
  );
}

// ─── Row helper ───────────────────────────────────────────────────────────────
function Row({
  label,
  value,
  mono = false,
  truncate = false,
  bold = false,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
  truncate?: boolean;
  bold?: boolean;
}) {
  const display = value !== null && value !== undefined && value !== '' ? value : '—';
  return (
    <div
      className="flex items-start justify-between gap-4 py-2.5"
      style={{ borderBottom: '1px solid #F0EDE7' }}
    >
      <span className="text-xs text-[#6B6558] flex-shrink-0">{label}:</span>
      <span
        className={`text-xs text-right text-[#0F0D0A] ${bold ? 'font-black' : ''} ${mono ? 'font-mono' : ''} ${truncate ? 'truncate max-w-[200px]' : ''}`}
      >
        {display}
      </span>
    </div>
  );
}