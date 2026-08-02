'use client';

import { useEffect, useState, useMemo } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import Link from 'next/link';
import { ArrowLeft, ArrowUpRight, ArrowDownLeft, Filter, Receipt, ExternalLink } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const CURRENCY_SYMBOLS: Record<string, string> = {
  NGN: '₦', KES: 'KSh', GHS: '₵', ZAR: 'R', USD: '$',
};

type Filter = 'all' | 'buy' | 'sell';

interface Receipt {
  id: string;
  payout_reference: string;
  payout_method: string;
  fiat_amount: string;
  token_amount: string;
  currency: string;
  status: string;
  created_at: string;
  mint_address: string | null;
  taker_address: string;
  maker_address: string;
}

function getOrderType(receipt: Receipt, walletAddress: string): 'buy' | 'sell' {
  // Buy order: user is the taker (receiving tokens by sending fiat)
  // Sell order: user is the maker (receiving fiat by selling tokens)
  if (receipt.payout_method === 'validator_consensus' || receipt.payout_method === 'flutterwave_payment') {
    return 'sell';
  }
  return 'buy';
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function formatFiat(amount: string, currency: string) {
  const sym = CURRENCY_SYMBOLS[currency] ?? currency;
  const n = Number(amount);
  return `${sym}${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function formatTokenAmount(amount: string) {
  const n = Number(amount) / 1e9;
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function StatusBadge({ status }: { status: string }) {
  const isSuccess = status === 'success' || status === 'completed';
  const isPending = status === 'pending' || status === 'processing';
  return (
    <span
      className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full"
      style={{
        background: isSuccess
          ? 'rgba(10,123,107,0.12)'
          : isPending
          ? 'rgba(232,72,10,0.10)'
          : 'rgba(192,57,43,0.12)',
        color: isSuccess ? '#0A7B6B' : isPending ? '#E8480A' : '#C0392B',
      }}
    >
      {status}
    </span>
  );
}

export default function TransactionHistoryPage() {
  const { publicKey } = useWallet();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    if (!publicKey) {
      setLoading(false);
      return;
    }

    const walletAddress = publicKey.toString();

    const fetchReceipts = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('receipts')
          .select('id, payout_reference, payout_method, fiat_amount, token_amount, currency, status, created_at, mint_address, taker_address, maker_address')
          .or(`taker_address.eq.${walletAddress},maker_address.eq.${walletAddress}`)
          .order('created_at', { ascending: false });

        if (!error && data) setReceipts(data);
      } catch (e) {
        console.error('Failed to fetch receipts:', e);
      } finally {
        setLoading(false);
      }
    };

    fetchReceipts();
  }, [publicKey]);

  const filtered = useMemo(() => {
    if (!publicKey) return [];
    const wallet = publicKey.toString();
    if (filter === 'all') return receipts;
    return receipts.filter((r) => getOrderType(r, wallet) === filter);
  }, [receipts, filter, publicKey]);

  const wallet = publicKey?.toString() ?? '';

  // Group by date
  const grouped = useMemo(() => {
    const groups: Record<string, Receipt[]> = {};
    for (const r of filtered) {
      const key = formatDate(r.created_at);
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    }
    return groups;
  }, [filtered]);

  const buys = receipts.filter((r) => getOrderType(r, wallet) === 'buy').length;
  const sells = receipts.filter((r) => getOrderType(r, wallet) === 'sell').length;

  return (
    <div className="min-h-screen py-10 px-4" style={{ background: '#F5F0E8' }}>
      {/* Top accent */}
      <div
        className="fixed top-0 left-0 right-0 h-0.5 z-10"
        style={{ background: 'linear-gradient(90deg,#E8480A,#FF8C5A 50%,#E8480A)' }}
      />

      <div className="max-w-2xl mx-auto">
        {/* Back */}
        <Link
          href="/express"
          className="inline-flex items-center gap-1.5 text-xs text-[#6B6558] hover:text-[#0F0D0A] mb-6 no-underline transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Express
        </Link>

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-black text-[#0F0D0A]">Transaction History</h1>
          <p className="text-xs text-[#6B6558] mt-0.5">
            {receipts.length} total · {buys} buys · {sells} sells
          </p>
        </div>

        {/* Filter tabs */}
        <div
          className="flex gap-1 p-1 rounded-xl mb-6"
          style={{ background: '#EDE8DF' }}
        >
          {(['all', 'buy', 'sell'] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="flex-1 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all cursor-pointer border-none"
              style={{
                background: filter === f ? '#0F0D0A' : 'transparent',
                color: filter === f ? '#FFFFFF' : '#6B6558',
              }}
            >
              {f === 'all' ? 'All' : f === 'buy' ? 'Buy Orders' : 'Sell Orders'}
            </button>
          ))}
        </div>

        {/* Content */}
        {!publicKey ? (
          <div
            className="rounded-2xl p-10 text-center"
            style={{ background: '#FFFFFF', border: '1.5px solid #E8E2D8' }}
          >
            <Receipt className="w-8 h-8 text-[#C8C2B4] mx-auto mb-3" />
            <p className="text-sm font-bold text-[#0F0D0A]">Connect your wallet</p>
            <p className="text-xs text-[#6B6558] mt-1">to view your transaction history</p>
          </div>
        ) : loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="rounded-2xl h-20 animate-pulse"
                style={{ background: '#EDE8DF' }}
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div
            className="rounded-2xl p-10 text-center"
            style={{ background: '#FFFFFF', border: '1.5px solid #E8E2D8' }}
          >
            <Receipt className="w-8 h-8 text-[#C8C2B4] mx-auto mb-3" />
            <p className="text-sm font-bold text-[#0F0D0A]">No transactions yet</p>
            <p className="text-xs text-[#6B6558] mt-1">
              {filter === 'all' ? 'Your completed trades will appear here' : `No ${filter} orders found`}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped).map(([date, items]) => (
              <div key={date}>
                <p className="text-[10px] font-black uppercase tracking-widest text-[#C8C2B4] mb-2 px-1">
                  {date}
                </p>
                <div
                  className="rounded-2xl overflow-hidden"
                  style={{ background: '#FFFFFF', border: '1.5px solid #E8E2D8' }}
                >
                  {items.map((receipt, idx) => {
                    const orderType = getOrderType(receipt, wallet);
                    const isBuy = orderType === 'buy';

                    return (
                      <Link
                        key={receipt.id}
                        href={`/receipts/${receipt.id}`}
                        className="no-underline"
                      >
                        <div
                          className="flex items-center gap-4 px-5 py-4 hover:bg-[#FDFCFA] transition-colors cursor-pointer"
                          style={{
                            borderBottom: idx < items.length - 1 ? '1px solid #F0EDE7' : 'none',
                          }}
                        >
                          {/* Icon */}
                          <div
                            className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{
                              background: isBuy ? 'rgba(10,123,107,0.10)' : 'rgba(232,72,10,0.10)',
                            }}
                          >
                            {isBuy ? (
                              <ArrowDownLeft className="w-4 h-4" style={{ color: '#0A7B6B' }} />
                            ) : (
                              <ArrowUpRight className="w-4 h-4" style={{ color: '#E8480A' }} />
                            )}
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-xs font-black text-[#0F0D0A]">
                                {isBuy ? 'Buy Order' : 'Sell Order'}
                              </p>
                              <StatusBadge status={receipt.status} />
                            </div>
                            <p className="text-[10px] text-[#6B6558] mt-0.5 font-mono truncate">
                              {receipt.payout_reference}
                            </p>
                          </div>

                          {/* Amounts */}
                          <div className="text-right flex-shrink-0">
                            <p className="text-sm font-black text-[#0F0D0A]">
                              {formatFiat(receipt.fiat_amount, receipt.currency)}
                            </p>
                            {receipt.token_amount && (
                              <p className="text-[10px] text-[#6B6558] mt-0.5">
                                {formatTokenAmount(receipt.token_amount)} TOKEN
                              </p>
                            )}
                          </div>

                          {/* Arrow */}
                          <ExternalLink className="w-3.5 h-3.5 text-[#C8C2B4] flex-shrink-0" />
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}