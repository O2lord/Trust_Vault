"use client"
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react'
import Image from 'next/image';
import { useExpressGlobalStats } from '@/hooks/express/useExpressGlobalStats';

function formatCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000)     return `${(value / 1_000).toFixed(1)}K`;
  return value.toString();
}

export default function Home() {
  const [isVisible, setIsVisible] = useState(false);
  const { totalVolumeFormatted, totalConfirmations, totalFeesFormatted, isLoading } = useExpressGlobalStats();

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const stats = [
  {
    value: isLoading ? '…' : totalVolumeFormatted,
    label: 'TOTAL SETTLED',
  },
  {
    value: isLoading ? '…' : formatCount(totalConfirmations),
    label: 'TRANSACTIONS',
  },
  {
    // Fees generated replaces TOTAL ESCROWS — more meaningful to visitors
    value: isLoading ? '…' : totalFeesFormatted,
    label: 'FEES GENERATED',
  },
  {
    value: '<30s',
    label: 'AVG. SETTLEMENT',
  },
];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@800&family=Instrument+Serif:ital@1&display=swap');
      `}</style>

      <div style={{ background: '#F5F0E8', minHeight: '100vh' }}>
        {/* 3px orange top stripe */}
        <div style={{ height: '3px', background: '#E8480A', width: '100%' }} />

        {/* Content */}
        <div className="container relative z-10 mx-auto px-4 py-12 md:py-20 text-center">
          <div
            className={`space-y-6 max-w-4xl mx-auto transition-all duration-1000 ${
              isVisible ? 'opacity-100 transform translate-y-0' : 'opacity-0 transform translate-y-10'
            }`}
          >
            <h1
              style={{
                fontFamily: "'Syne', sans-serif",
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '-0.02em',
                color: '#0F0D0A',
                fontSize: 'clamp(56px, 9vw, 108px)',
                lineHeight: 0.92,
              }}
            >
              Trust Vault
            </h1>

            <div className="max-width flex items-center justify-center gap-4">
              <Link href="/express" className="flex items-center">
                <Image
                  src={"/logos/shield2.png"}
                  alt="Trust Vault Logo"
                  width="220"
                  height="220"
                  className="rounded-full"
                  style={{ border: '2px solid #0F0D0A' }}
                />
              </Link>
            </div>

            <p
              style={{
                fontFamily: "'Instrument Serif', Georgia, serif",
                fontStyle: 'italic',
                fontSize: '1.25rem',
                color: 'rgba(15,13,10,0.75)',
                maxWidth: '48rem',
                margin: '0 auto',
                lineHeight: 1.65,
              }}
            >
              Your secure digital vault for managing your P2P transactions safely.
            </p>

            <p
              style={{
                fontFamily: "'Instrument Serif', Georgia, serif",
                fontStyle: 'italic',
                fontSize: '0.95rem',
                color: 'rgba(15,13,10,0.55)',
                maxWidth: '48rem',
                margin: '0 auto',
                lineHeight: 1.65,
              }}
            >
              &quot;Crypto is borderless and so should P2P transactions.&quot;
            </p>

            <div className="flex flex-wrap justify-center gap-4 mt-8">
              <Link
                href="/express"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  background: '#E8480A',
                  color: '#FFFFFF',
                  border: '2px solid #0F0D0A',
                  fontFamily: "'Syne', sans-serif",
                  fontWeight: 800,
                  fontSize: '12px',
                  letterSpacing: '0.2em',
                  textTransform: 'uppercase',
                  padding: '16px 32px',
                  textDecoration: 'none',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#0F0D0A')}
                onMouseLeave={e => (e.currentTarget.style.background = '#E8480A')}
              >
                Get Started
                <ChevronRight className="ml-2 h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>

        {/* Stats Row — live data from chain */}
        <div className="container mx-auto px-4 pb-8">
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            border: '2px solid #0F0D0A',
            borderRadius: '12px',
            overflow: 'hidden',
            background: '#FFFFFF',
          }}>
            {stats.map((stat, i) => (
              <div key={i} style={{
                padding: '28px 32px',
                borderRight: i < 3 ? '2px solid #0F0D0A' : 'none',
              }}>
                <div style={{
                  fontFamily: "'Syne', sans-serif",
                  fontWeight: 800,
                  fontSize: '2rem',
                  color: '#E8480A',
                  letterSpacing: '-0.02em',
                  marginBottom: '6px',
                  minHeight: '2.5rem',
                }}>
                  {stat.value}
                </div>
                <div style={{
                  fontFamily: "'Syne', sans-serif",
                  fontWeight: 700,
                  fontSize: '11px',
                  letterSpacing: '0.15em',
                  textTransform: 'uppercase',
                  color: 'rgba(15,13,10,0.5)',
                }}>
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* How It Works */}
        <div className="container mx-auto px-4 pb-16">
          <div style={{
            border: '2px solid #0F0D0A',
            borderRadius: '12px',
            overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{
              background: '#0F0D0A',
              padding: '16px 24px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
            }}>
              <span style={{ color: '#E8480A', fontSize: '16px' }}>⚡</span>
              <span style={{
                fontFamily: "'Syne', sans-serif",
                fontWeight: 700,
                fontSize: '12px',
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: '#FFFFFF',
              }}>
                How It Works
              </span>
            </div>

            {/* Steps */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              background: '#FFFFFF',
            }}>
              {[
                {
                  n: '1',
                  title: 'Select Currency',
                  desc: 'Choose your preferred fiat currency from our supported options (NGN, KES, GHS)',
                },
                {
                  n: '2',
                  title: 'Enter Amount & Details',
                  desc: 'Specify the amount you want to send/receive and enter the payout details. Required tokens are calculated automatically, using the exchange rate set by LP.',
                },
                {
                  n: '3',
                  title: 'Get Paid Instantly',
                  desc: 'Receive instant payment to your bank account or get your tokens immediately.',
                },
              ].map((step, i) => (
                <div key={i} style={{
                  padding: '32px 28px',
                  borderRight: i < 2 ? '1px solid rgba(15,13,10,0.15)' : 'none',
                }}>
                  <div style={{
                    fontFamily: "'Syne', sans-serif",
                    fontWeight: 800,
                    fontSize: '32px',
                    color: 'rgba(15,13,10,0.12)',
                    lineHeight: 1,
                    marginBottom: '12px',
                  }}>
                    {step.n}
                  </div>
                  <div style={{
                    fontFamily: "'Syne', sans-serif",
                    fontWeight: 800,
                    fontSize: '13px',
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                    color: '#0F0D0A',
                    marginBottom: '10px',
                  }}>
                    {step.title}
                  </div>
                  <p style={{
                    fontFamily: "'Instrument Serif', Georgia, serif",
                    fontStyle: 'italic',
                    fontSize: '14px',
                    lineHeight: 1.65,
                    color: 'rgba(15,13,10,0.6)',
                  }}>
                    {step.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </>
  );
}