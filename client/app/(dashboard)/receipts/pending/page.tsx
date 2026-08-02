'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Loader2, CheckCircle2, Clock } from 'lucide-react';

function truncateAddress(addr: string) {
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

function StatusPill({ label, tone }: { label: string; tone: 'pending' | 'success' }) {
  const isSuccess = tone === 'success';
  return (
    <span
      className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full"
      style={{
        background: isSuccess ? 'rgba(10,123,107,0.12)' : 'rgba(232,72,10,0.10)',
        color: isSuccess ? '#0A7B6B' : '#E8480A',
      }}
    >
      {label}
    </span>
  );
}

export default function PendingReceiptPage() {
  const searchParams = useSearchParams();
  const trustExpress = searchParams.get('trustExpress');
  const taker = searchParams.get('taker');

  const [status, setStatus] = useState<'loading' | 'found' | 'timeout'>('loading');
  const [receiptId, setReceiptId] = useState<string | null>(null);

  useEffect(() => {
    if (!trustExpress) return;

    let attempts = 0;
    const maxAttempts = 30; // 60 seconds total

    const checkReceipt = async () => {
      try {
        const url = taker
          ? `/api/receipts/by-transaction?trustExpressAddress=${trustExpress}&takerAddress=${taker}`
          : `/api/receipts/by-transaction?trustExpressAddress=${trustExpress}`;

        const response = await fetch(url);

        if (response.ok) {
          const receipt = await response.json();
          setReceiptId(receipt.id);
          setStatus('found');
          window.location.href = `/receipts/${receipt.id}`;
          return true;
        }
        return false;
      } catch (error) {
        console.error('Error checking receipt:', error);
        return false;
      }
    };

    const pollInterval = setInterval(async () => {
      attempts++;

      const found = await checkReceipt();

      if (found || attempts >= maxAttempts) {
        clearInterval(pollInterval);
        if (!found) setStatus('timeout');
      }
    }, 2000);

    checkReceipt();

    return () => clearInterval(pollInterval);
  }, [trustExpress, taker]);

  return (
    <div className="min-h-screen py-10 px-4" style={{ background: '#F5F0E8' }}>
      {/* Top accent — same brand rule used across Trust Vault */}
      <div
        className="fixed top-0 left-0 right-0 h-0.5 z-10"
        style={{ background: 'linear-gradient(90deg,#E8480A,#FF8C5A 50%,#E8480A)' }}
      />

      <div className="max-w-md mx-auto pt-10">
        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: '#FFFFFF', border: '1.5px solid #E8E2D8' }}
        >
          {/* Header */}
          <div className="px-6 pt-6 pb-5 text-center" style={{ borderBottom: '1.5px solid #F0EDE7' }}>
            <h1 className="text-lg font-black text-[#0F0D0A]">
              {status === 'found' ? 'Payment Confirmed' : 'Confirming Payment'}
            </h1>
            <p className="text-xs text-[#6B6558] mt-1">
              {status === 'found' ? 'Receipt ready' : 'Verifying on-chain settlement'}
            </p>
          </div>

          {/* Body */}
          <div className="px-6 py-10 flex flex-col items-center text-center gap-4">
            {status === 'loading' && (
              <>
                <StatusPill label="Pending" tone="pending" />
                <Loader2 className="w-10 h-10 animate-spin" style={{ color: '#E8480A' }} />
                <div>
                  <p className="text-sm font-black text-[#0F0D0A]">
                    Verifying your transaction
                  </p>
                  <p className="text-xs text-[#6B6558] mt-1.5 max-w-[280px]">
                    This usually takes 5–15 seconds. Your receipt will appear here
                    automatically — no need to refresh.
                  </p>
                </div>
              </>
            )}

            {status === 'found' && (
              <>
                <StatusPill label="Confirmed" tone="success" />
                <CheckCircle2 className="w-10 h-10" style={{ color: '#0A7B6B' }} />
                <div>
                  <p className="text-sm font-black text-[#0F0D0A]">Payment confirmed</p>
                  <p className="text-xs text-[#6B6558] mt-1.5">
                    Redirecting you to your receipt…
                  </p>
                </div>
              </>
            )}

            {status === 'timeout' && (
              <>
                <StatusPill label="Pending" tone="pending" />
                <Clock className="w-10 h-10" style={{ color: '#E8480A' }} />
                <div>
                  <p className="text-sm font-black text-[#0F0D0A]">
                    Still confirming
                  </p>
                  <p className="text-xs text-[#6B6558] mt-1.5 max-w-[280px]">
                    Your payment is taking longer than usual to settle on-chain.
                    It hasn&apos;t failed — check again in a moment.
                  </p>
                </div>
                <button
                  onClick={() => window.location.reload()}
                  className="mt-2 px-8 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest cursor-pointer border-none"
                  style={{ background: '#0F0D0A', color: '#FFFFFF' }}
                >
                  Check Again
                </button>
              </>
            )}
          </div>

          {/* Footer reference row — mirrors the receipt detail page's own row style */}
          {trustExpress && (
            <div
              className="px-6 py-3.5 flex items-center justify-between"
              style={{ borderTop: '1.5px solid #F0EDE7', background: '#FAF8F4' }}
            >
              <span className="text-[10px] font-black uppercase tracking-widest text-[#C8C2B4]">
                Order
              </span>
              <span className="text-[11px] font-mono text-[#6B6558]">
                {truncateAddress(trustExpress)}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}